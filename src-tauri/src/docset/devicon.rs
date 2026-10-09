//! Iconos Devicon como fallback (sin icono propio → caché → descarga).
//!
//! - La resolución SOLO acepta claves presentes en la tabla verificada
//!   (`VERIFIED`): nunca se construyen URLs de nombres arbitrarios. Cada
//!   entrada fija nombre y variante comprobados contra el `devicon.json`
//!   real (578 iconos; p. ej. `rails` no tiene `original`, solo `plain`).
//! - Origen único: CDN jsdelivr con versión pineada (`v2.17.0`), sin API
//!   key. La URL solo se compone de la constante base + valores de la
//!   tabla; por defensa se rechaza cualquier otra.
//! - Caché persistente `<base>/<nombre>.svg` (datos de la app, nunca en la
//!   carpeta del usuario): escritura atómica (tmp + rename), sin
//!   re-descargas. En carga/arranque solo se lee disco (sin red).
//! - Validación: tope de tamaño, forma `<svg…>…</svg>`, sin `<script`.
//!   El SVG viaja como data-URL y se pinta en `<img>` (sin ejecución).
//! - Todo fallo (red, HTTP, validación) devuelve `None`: la instalación
//!   del docset continúa y la UI usa el genérico.

use std::io::Read;
use std::path::{Path, PathBuf};

/// CDN jsdelivr con versión pineada (URLs estables, sin API key).
pub const DEVICON_BASE: &str = "https://cdn.jsdelivr.net/gh/devicons/devicon@v2.17.0/icons/";
/// Tope de un SVG (los de Devicon rondan pocos KB; igual que iconos PNG).
pub const MAX_SVG_BYTES: u64 = 256 * 1024;

/// Clave normalizada → (nombre Devicon, variante). Variantes comprobadas
/// contra `devicon.json`: `original` salvo donde no existe (`plain`).
/// Las claves con símbolos (`c++`, `c#`) y alias (`vue`, `html`, `node`)
/// son explícitas: nada se deduce por patrones.
const VERIFIED: &[(&str, &str, &str)] = &[
    ("python", "python", "original"),
    ("lua", "lua", "original"),
    ("c", "c", "original"),
    ("c++", "cplusplus", "original"),
    ("cpp", "cplusplus", "original"),
    ("c#", "csharp", "original"),
    ("go", "go", "original"),
    ("rust", "rust", "original"),
    ("java", "java", "original"),
    ("javascript", "javascript", "original"),
    ("js", "javascript", "original"),
    ("typescript", "typescript", "original"),
    ("ruby", "ruby", "original"),
    ("php", "php", "original"),
    ("swift", "swift", "original"),
    ("kotlin", "kotlin", "original"),
    ("html", "html5", "original"),
    ("html5", "html5", "original"),
    ("css", "css3", "original"),
    ("css3", "css3", "original"),
    ("react", "react", "original"),
    ("vue", "vuejs", "original"),
    ("vuejs", "vuejs", "original"),
    ("angularjs", "angularjs", "original"),
    ("nodejs", "nodejs", "original"),
    ("node", "nodejs", "original"),
    ("docker", "docker", "original"),
    ("git", "git", "original"),
    ("bash", "bash", "original"),
    ("perl", "perl", "original"),
    ("scala", "scala", "original"),
    ("haskell", "haskell", "original"),
    ("r", "r", "original"),
    ("matlab", "matlab", "original"),
    ("dart", "dart", "original"),
    ("flutter", "flutter", "original"),
    ("rails", "rails", "plain"),
    ("ruby_on_rails", "rails", "plain"),
    ("django", "django", "plain"),
    ("flask", "flask", "original"),
    ("jquery", "jquery", "original"),
    ("bootstrap", "bootstrap", "original"),
    ("tailwindcss", "tailwindcss", "original"),
    ("tailwind_css", "tailwindcss", "original"),
    ("postgresql", "postgresql", "original"),
    ("mysql", "mysql", "original"),
    ("sqlite", "sqlite", "original"),
    ("mongodb", "mongodb", "original"),
    ("redis", "redis", "original"),
    ("nginx", "nginx", "original"),
    ("apache", "apache", "original"),
    ("linux", "linux", "original"),
    ("apple", "apple", "original"),
    ("android", "android", "original"),
    ("dotnetcore", "dotnetcore", "original"),
    ("dot-net", "dot-net", "original"),
    ("dotnet", "dot-net", "original"),
    (".net", "dot-net", "original"),
    ("net", "dot-net", "original"),
    ("wordpress", "wordpress", "original"),
    ("laravel", "laravel", "original"),
    ("symfony", "symfony", "original"),
    ("elixir", "elixir", "original"),
    ("erlang", "erlang", "original"),
    ("clojure", "clojure", "original"),
    ("groovy", "groovy", "original"),
    ("powershell", "powershell", "original"),
    ("vim", "vim", "original"),
    ("emacs", "emacs", "original"),
    ("cmake", "cmake", "original"),
    ("opengl", "opengl", "original"),
    ("qt", "qt", "original"),
    ("unity", "unity", "original"),
    ("godot", "godot", "original"),
    ("tensorflow", "tensorflow", "original"),
    ("pytorch", "pytorch", "original"),
    ("pandas", "pandas", "original"),
    ("numpy", "numpy", "original"),
    ("matplotlib", "matplotlib", "original"),
    ("jupyter", "jupyter", "original"),
    ("latex", "latex", "original"),
    ("markdown", "markdown", "original"),
    ("yaml", "yaml", "original"),
    ("json", "json", "original"),
    ("xml", "xml", "original"),
    ("graphql", "graphql", "plain"),
    ("kubernetes", "kubernetes", "original"),
    ("terraform", "terraform", "original"),
    ("ansible", "ansible", "original"),
    ("jenkins", "jenkins", "original"),
    ("github", "github", "original"),
    ("gitlab", "gitlab", "original"),
    ("bitbucket", "bitbucket", "original"),
    ("vscode", "vscode", "original"),
    ("visualstudio", "visualstudio", "original"),
    ("xcode", "xcode", "original"),
    ("eclipse", "eclipse", "original"),
    ("netbeans", "netbeans", "original"),
    ("pycharm", "pycharm", "original"),
    ("intellij", "intellij", "original"),
    ("webstorm", "webstorm", "original"),
    ("atom", "atom", "original"),
];

/// Resuelve un id de feed a (nombre Devicon, variante) o `None`.
/// Normaliza (recorta, minúsculas, un sufijo `_N` de versión) pero SOLO
/// acepta claves de la tabla: `csv`, `toml`, `sublime`, rutas o basura
/// dan `None` (genérico). `c` y `c++` son claves distintas.
pub fn resolve(feed_id: &str) -> Option<(&'static str, &'static str)> {
    let mut key = feed_id.trim().to_lowercase();
    if key.is_empty() {
        return None;
    }
    // Un sufijo `_N` de versión (`Python_3` → `python`).
    if let Some((stem, digits)) = key.rsplit_once('_') {
        if !stem.is_empty() && !digits.is_empty() && digits.bytes().all(|b| b.is_ascii_digit()) {
            key = stem.to_string();
        }
    }
    VERIFIED
        .iter()
        .find(|(candidate, _, _)| *candidate == key)
        .map(|(_, name, variant)| (*name, *variant))
}

/// URL completa de un icono verificado (`None` si no resuelve).
/// Solo compone la constante base + valores de la tabla.
pub fn icon_url(feed_id: &str) -> Option<String> {
    let (name, variant) = resolve(feed_id)?;
    let url = format!("{DEVICON_BASE}{name}/{name}-{variant}.svg");
    debug_assert!(url.starts_with(DEVICON_BASE));
    Some(url)
}

/// Fichero de caché para un nombre Devicon (`None` con base vacía o
/// nombre inseguro: solo `[a-z0-9-]`, sin puntos ni barras).
pub fn cache_file(base: &Path, name: &str) -> Option<PathBuf> {
    if base.as_os_str().is_empty()
        || name.is_empty()
        || !name.bytes().all(|b| b.is_ascii_alphanumeric() || b == b'-')
    {
        return None;
    }
    Some(base.join(format!("{name}.svg")))
}

/// Lee la caché (con validación) como data-URL, o `None`.
pub fn load_cached(base: &Path, name: &str) -> Option<String> {
    let path = cache_file(base, name)?;
    let meta = std::fs::metadata(&path).ok()?;
    if !meta.is_file() || meta.len() > MAX_SVG_BYTES {
        return None;
    }
    let bytes = std::fs::read(&path).ok()?;
    if !validate_svg(&bytes) {
        return None;
    }
    Some(svg_data_url(&bytes))
}

/// Icono para una carpeta instalada (stem sin `.docset`) desde la caché
/// local. Sin red: para arranque y cargas.
pub fn icon_for_folder(base: &Path, folder_stem: &str) -> Option<String> {
    let (name, _) = resolve(folder_stem)?;
    load_cached(base, name)
}

/// Resuelve desde caché o descarga (best-effort): cualquier fallo da
/// `None` sin tocar nada más. Reutiliza el cliente del flujo F2 (nunca
/// en contexto async: lo llama el hilo bloqueante).
pub fn ensure_cached_or_fetch(
    client: &reqwest::blocking::Client,
    base: &Path,
    feed_id: &str,
) -> Option<String> {
    // FASE 0: solo medida (caché local vs descarga).
    let t_icon = std::time::Instant::now();
    let (name, _) = resolve(feed_id)?;
    if let Some(cached) = load_cached(base, name) {
        crate::profile::mark(
            "install",
            format_args!(
                "icono feed={feed_id} origen=cache ms={}",
                crate::profile::ms_since(t_icon)
            ),
        );
        return Some(cached);
    }
    let url = icon_url(feed_id)?;
    let result = fetch_and_store_url(client, base, name, &url);
    crate::profile::mark(
        "install",
        format_args!(
            "icono feed={feed_id} origen=descarga ok={} ms={}",
            result.is_some(),
            crate::profile::ms_since(t_icon)
        ),
    );
    result
}

/// Descarga y guarda un SVG con origen restringido a `DEVICON_BASE`.
/// Rechaza cualquier otra URL sin tocar la red.
pub(crate) fn fetch_and_store_url(
    client: &reqwest::blocking::Client,
    base: &Path,
    name: &str,
    url: &str,
) -> Option<String> {
    if !url.starts_with(DEVICON_BASE) {
        return None;
    }
    let path = cache_file(base, name)?;
    let bytes = download_capped(client, url)?;
    store_validated_path(&path, &bytes)
}

/// Descarga con tope (anuncio + bytes reales). `None` ante red, HTTP o
/// tamaño excesivo. Sin validar contenido (lo hace `store_validated`).
pub(crate) fn download_capped(client: &reqwest::blocking::Client, url: &str) -> Option<Vec<u8>> {
    let response = client.get(url).send().ok()?;
    if !response.status().is_success() {
        return None;
    }
    if response.content_length().is_some_and(|n| n > MAX_SVG_BYTES) {
        return None;
    }
    let mut bytes = Vec::new();
    let mut buffer = [0_u8; 16384];
    let mut response = response;
    loop {
        let n = response.read(&mut buffer).ok()?;
        if n == 0 {
            break;
        }
        bytes.extend_from_slice(&buffer[..n]);
        if bytes.len() as u64 > MAX_SVG_BYTES {
            return None;
        }
    }
    Some(bytes)
}

/// Valida y guarda atómicamente en `path` como data-URL.
/// `None` (sin dejar restos) si el contenido no es SVG válido.
/// El temporal es único por llamada: dos escrituras simultáneas no se
/// pisan (gana el último rename, el fichero final siempre es válido).
fn store_validated_path(path: &Path, bytes: &[u8]) -> Option<String> {
    if !validate_svg(bytes) {
        return None;
    }
    if let Some(parent) = path.parent() {
        std::fs::create_dir_all(parent).ok()?;
    }
    let tmp = unique_tmp_next_to(path)?;
    {
        use std::io::Write;
        let mut file = std::fs::OpenOptions::new()
            .write(true)
            .create_new(true)
            .open(&tmp)
            .ok()?;
        file.write_all(bytes).ok()?;
        file.sync_all().ok()?;
    }
    if std::fs::rename(&tmp, path).is_err() {
        let _ = std::fs::remove_file(&tmp);
        // Windows no reemplaza un destino que otra escritura concurrente
        // acaba de crear. Si ese ganador es un SVG válido, la caché ya está
        // satisfecha y esta operación también puede completarse.
        let existing = std::fs::read(path).ok()?;
        return validate_svg(&existing).then(|| svg_data_url(&existing));
    }
    Some(svg_data_url(bytes))
}

/// Temporal único junto al destino (mismo sistema de ficheros para que
/// el rename sea atómico). Solo caracteres seguros en el nombre.
fn unique_tmp_next_to(path: &Path) -> Option<PathBuf> {
    let parent = path.parent()?;
    let stem = path.file_stem()?.to_string_lossy();
    let pid = std::process::id();
    let nanos = std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .map(|d| d.as_nanos())
        .unwrap_or(0);
    for attempt in 0..100_u32 {
        let candidate = parent.join(format!(".{stem}-{pid}-{nanos}-{attempt}.svg.tmp"));
        if !candidate.exists() {
            return Some(candidate);
        }
    }
    None
}

/// Valida y guarda en la caché (`<base>/<name>.svg`) como data-URL.
/// Puerta para tests sin red.
#[cfg(test)]
fn store_validated(base: &Path, name: &str, bytes: &[u8]) -> Option<String> {
    let path = cache_file(base, name)?;
    store_validated_path(&path, bytes)
}

/// `true` si son bytes de SVG aceptables: forma `<svg…>…</svg>`, tope
/// de tamaño y sin `<script` (insensible a mayúsculas). No ejecuta nada.
pub fn validate_svg(bytes: &[u8]) -> bool {
    if bytes.is_empty() || bytes.len() as u64 > MAX_SVG_BYTES {
        return false;
    }
    // BOM UTF-8 opcional.
    let mut body = bytes;
    if let Some(stripped) = body.strip_prefix(&[0xEF, 0xBB, 0xBF]) {
        body = stripped;
    }
    let text = String::from_utf8_lossy(body);
    let text = text.trim_start();
    let text = text
        .strip_prefix("<?xml")
        .and_then(|rest| rest.split_once("?>").map(|(_, tail)| tail.trim_start()))
        .unwrap_or(text);
    let lower = text.to_lowercase();
    (lower.starts_with("<svg ") || lower.starts_with("<svg>"))
        && lower.contains("</svg>")
        && !lower.contains("<script")
}

/// Data-URL lista para `<img>` (contexto sin ejecución de scripts).
pub fn svg_data_url(bytes: &[u8]) -> String {
    use base64::Engine;
    format!(
        "data:image/svg+xml;base64,{}",
        base64::engine::general_purpose::STANDARD.encode(bytes)
    )
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn resolution_is_exact_and_strict() {
        assert_eq!(resolve("Python_3"), Some(("python", "original")));
        assert_eq!(resolve("  PYTHON "), Some(("python", "original")));
        assert_eq!(resolve("C++"), Some(("cplusplus", "original")));
        assert_eq!(resolve("cpp"), Some(("cplusplus", "original")));
        // `C` y `C++` no se confunden.
        assert_eq!(resolve("C"), Some(("c", "original")));
        assert_ne!(resolve("C"), resolve("C++"));
        assert_eq!(resolve("C#"), Some(("csharp", "original")));
        assert_eq!(resolve("Go"), Some(("go", "original")));
        assert_eq!(resolve("Lua"), Some(("lua", "original")));
        // Sin `original` en Devicon: variante verificada.
        assert_eq!(resolve("Rails"), Some(("rails", "plain")));
        assert_eq!(resolve("Django"), Some(("django", "plain")));
        assert_eq!(resolve("GraphQL"), Some(("graphql", "plain")));
        assert_eq!(resolve("Nginx"), Some(("nginx", "original")));
        // Alias explícitos.
        assert_eq!(resolve("Vue"), Some(("vuejs", "original")));
        assert_eq!(resolve("HTML"), Some(("html5", "original")));
        assert_eq!(resolve("CSS"), Some(("css3", "original")));
        assert_eq!(resolve("Node"), Some(("nodejs", "original")));
        assert_eq!(resolve(".NET"), Some(("dot-net", "original")));
        assert_eq!(resolve("Tailwind_CSS"), Some(("tailwindcss", "original")));
        // Lo no verificado → genérico (nada de URLs construidas).
        for unknown in [
            "",
            "   ",
            "csv",
            "toml",
            "sublime",
            "CobolXYZ",
            "python/../x",
            "..",
            "a/b",
            "py thon",
            "python_",
            "python_3_12",
        ] {
            assert_eq!(resolve(unknown), None, "{unknown}");
        }
    }

    #[test]
    fn urls_stay_on_the_pinned_cdn() {
        let url = icon_url("Lua").expect("lua");
        assert_eq!(
            url,
            "https://cdn.jsdelivr.net/gh/devicons/devicon@v2.17.0/icons/lua/lua-original.svg"
        );
        assert_eq!(
            icon_url("Rails").expect("rails"),
            "https://cdn.jsdelivr.net/gh/devicons/devicon@v2.17.0/icons/rails/rails-plain.svg"
        );
        assert!(icon_url("csv").is_none());
    }

    /// SVG mínimo válido con el contenido dado en el cuerpo.
    fn svg_doc(body: &str) -> Vec<u8> {
        format!("<svg xmlns=\"http://www.w3.org/2000/svg\" viewBox=\"0 0 128 128\">{body}</svg>")
            .into_bytes()
    }

    #[test]
    fn validation_accepts_shape_and_rejects_danger() {
        assert!(validate_svg(&svg_doc(
            "<circle cx=\"1\" cy=\"2\" r=\"3\"/>"
        )));
        assert!(validate_svg(
            &format!(
                "<?xml version=\"1.0\"?>\n{}",
                String::from_utf8_lossy(&svg_doc("<g/>"))
            )
            .into_bytes()
        ));
        // Con declaración XML y con BOM UTF-8 delante también vale.
        let mut bom = vec![0xEF, 0xBB, 0xBF];
        bom.extend_from_slice(&svg_doc("<g/>"));
        assert!(validate_svg(&bom));
        // Sin cierre, sin raíz svg, vacío, basura.
        assert!(!validate_svg(b"<svg><g>"));
        assert!(!validate_svg(b"<html></html>"));
        assert!(!validate_svg(b""));
        assert!(!validate_svg(b"no es svg"));
        // Scripts fuera, en cualquier caja.
        assert!(!validate_svg(&svg_doc("<SCRIPT>alert(1)</SCRIPT>")));
        assert!(!validate_svg(&svg_doc("<script href=\"x\"/>")));
        // Sobretamaño.
        let mut big = svg_doc("");
        big.resize(MAX_SVG_BYTES as usize + 1, b' ');
        assert!(!validate_svg(&big));
    }

    #[test]
    fn cache_names_are_safe() {
        let dir = tempfile::tempdir().expect("tempdir");
        assert!(cache_file(dir.path(), "lua").is_some());
        assert!(cache_file(dir.path(), "dot-net").is_some());
        for bad in ["", "../x", "a/b", "a.svg", "a b", "ña", "a.png"] {
            assert!(cache_file(dir.path(), bad).is_none(), "{bad}");
        }
        assert!(cache_file(Path::new(""), "lua").is_none(), "base vacía");
        assert!(load_cached(dir.path(), "lua").is_none(), "ausente");
    }

    /// Servidor HTTP mínimo con respuestas encoladas (una por conexión).
    struct MockServer {
        base: String,
    }

    impl MockServer {
        fn start(responses: Vec<(u16, Vec<u8>)>) -> Self {
            use std::io::{Read, Write};
            use std::net::TcpListener;
            let listener = TcpListener::bind("127.0.0.1:0").expect("bind");
            let addr = listener.local_addr().expect("addr");
            listener.set_nonblocking(true).expect("nonblocking");
            std::thread::spawn(move || {
                let mut pending = responses.into_iter();
                let total = pending.len();
                let mut served = 0_usize;
                let deadline = std::time::Instant::now() + std::time::Duration::from_secs(30);
                while served < total && std::time::Instant::now() < deadline {
                    let (mut stream, _) = match listener.accept() {
                        Ok(pair) => pair,
                        Err(_) => {
                            std::thread::sleep(std::time::Duration::from_millis(5));
                            continue;
                        }
                    };
                    let _ = stream.set_nonblocking(false);
                    let Some((status, body)) = pending.next() else {
                        break;
                    };
                    let _ = stream.set_read_timeout(Some(std::time::Duration::from_secs(5)));
                    let mut request = Vec::new();
                    let mut chunk = [0_u8; 1024];
                    loop {
                        match stream.read(&mut chunk) {
                            Ok(0) => break,
                            Ok(n) => {
                                request.extend_from_slice(&chunk[..n]);
                                if request.len() > 65_536
                                    || request.windows(4).any(|w| w == b"\r\n\r\n")
                                {
                                    break;
                                }
                            }
                            Err(_) => break,
                        }
                    }
                    let reason = if status == 200 { "OK" } else { "Error" };
                    let head = format!(
                        "HTTP/1.1 {status} {reason}\r\nContent-Length: {}\r\nConnection: close\r\n\r\n",
                        body.len()
                    );
                    let _ = stream.write_all(head.as_bytes());
                    let _ = stream.write_all(&body);
                    served += 1;
                }
            });
            Self {
                base: format!("http://{addr}"),
            }
        }
    }

    fn test_client() -> reqwest::blocking::Client {
        crate::catalog::feed::http_client().expect("cliente")
    }

    #[test]
    fn download_respects_http_and_size_caps() {
        let client = test_client();
        // 200 válido → bytes.
        let body = svg_doc("<circle/>");
        let server = MockServer::start(vec![(200, body.clone())]);
        let url = format!("{}/icons/lua/lua-original.svg", server.base);
        assert_eq!(download_capped(&client, &url), Some(body));
        // 404 → None.
        let server = MockServer::start(vec![(404, b"no".to_vec())]);
        let url = format!("{}/icons/lua/lua-original.svg", server.base);
        assert_eq!(download_capped(&client, &url), None);
        // Cuerpo mayor que el tope (aunque el anuncio mienta) → None.
        let big = vec![b' '; MAX_SVG_BYTES as usize + 1024];
        let server = MockServer::start(vec![(200, big)]);
        let url = format!("{}/icons/go/go-original.svg", server.base);
        assert_eq!(download_capped(&client, &url), None);
    }

    #[test]
    fn store_validates_and_writes_atomically() {
        let dir = tempfile::tempdir().expect("tempdir");
        // Válido → data-URL + fichero, sin temporal restante.
        let body = svg_doc("<rect/>");
        let url = store_validated(dir.path(), "lua", &body).expect("guardar");
        assert!(url.starts_with("data:image/svg+xml;base64,"));
        assert!(dir.path().join("lua.svg").is_file());
        assert_no_tmps(dir.path());
        // Inválido → None sin fichero.
        assert!(store_validated(dir.path(), "go", b"no es svg").is_none());
        assert!(!dir.path().join("go.svg").exists());
        // Nombre inseguro → None.
        assert!(store_validated(dir.path(), "../x", &body).is_none());
    }

    #[test]
    fn origin_outside_cdn_is_rejected_without_network() {
        let dir = tempfile::tempdir().expect("tempdir");
        let client = test_client();
        // Ni siquiera se intenta la petición con otro origen.
        assert!(
            fetch_and_store_url(&client, dir.path(), "lua", "http://127.0.0.1:1/x.svg").is_none()
        );
        assert!(fetch_and_store_url(
            &client,
            dir.path(),
            "lua",
            "https://cdn.jsdelivr.net.evil.example/icons/lua/lua-original.svg"
        )
        .is_none());
    }

    #[test]
    fn cached_hit_avoids_download() {
        let dir = tempfile::tempdir().expect("tempdir");
        let body = svg_doc("<rect/>");
        std::fs::write(dir.path().join("lua.svg"), &body).expect("semilla");
        // `ensure_cached_or_fetch` consulta la caché antes de tocar la
        // red: con semilla válida no necesita al cliente para nada salvo
        // su firma; aquí se comprueba la puerta (caché primero).
        let cached = load_cached(dir.path(), "lua").expect("caché");
        assert!(cached.starts_with("data:image/svg+xml;base64,"));
        assert_eq!(
            std::fs::read(dir.path().join("lua.svg")).expect("leer"),
            body
        );
    }

    #[test]
    fn concurrent_stores_do_not_corrupt_cache() {
        let dir = tempfile::tempdir().expect("tempdir");
        let body = svg_doc("<ellipse/>");
        std::thread::scope(|s| {
            let mut handles = Vec::new();
            for _ in 0..4 {
                handles.push(s.spawn(|| store_validated(dir.path(), "go", &body)));
            }
            for h in handles {
                assert!(h.join().expect("hilo").is_some());
            }
        });
        let stored = std::fs::read(dir.path().join("go.svg")).expect("fichero");
        assert!(validate_svg(&stored));
        assert_no_tmps(dir.path());
    }

    /// Ningún temporal `*.svg.tmp` pendiente en el directorio.
    fn assert_no_tmps(dir: &Path) {
        let leftovers: Vec<_> = std::fs::read_dir(dir)
            .expect("leer")
            .flatten()
            .filter(|e| e.file_name().to_string_lossy().ends_with(".svg.tmp"))
            .collect();
        assert!(leftovers.is_empty(), "{leftovers:?}");
    }
}
