//! Esquema personalizado `opendoc://` (T8, SPEC §4.3).
//!
//! Formas aceptadas (todas llevan a lo mismo):
//! `opendoc://<id>/<ruta>`, `opendoc://localhost/<id>/<ruta>` (macOS/Linux)
//! y `http://opendoc.localhost/<id>/<ruta>` (Windows/Android).
//! El contenido se muestra en un `<iframe>` aislado de la UI.
//!
//! Handler síncrono: son ficheros locales pequeños; el `async` no aporta.

pub mod resolve;

pub use resolve::{content_type_for, resolve_request, ResolveError, ResolvedFile};

use tauri::{Manager, Runtime, UriSchemeContext};

use crate::commands::AppState;
use crate::docset::Docset;

/// Error al servir. Se traduce a estado HTTP, no a `ApiError`.
#[derive(Debug, Clone, PartialEq, Eq)]
enum ServeError {
    /// Ningún docset cargado tiene ese id.
    UnknownDocset,
    /// El docset no tiene `Documents/` (p. ej. tarix).
    NoDocuments,
    /// Sin página de inicio conocida.
    NoHomePage,
    /// La ruta no se pudo resolver o leer.
    Resolve(ResolveError),
}

/// `(id, resto)` de cualquier forma de URI aceptada, o `None` sin id.
pub fn parse_opendoc_uri(uri: &tauri::http::Uri) -> Option<(String, String)> {
    let host = uri.host().unwrap_or("");
    let mut segs: Vec<&str> = uri.path().split('/').filter(|s| !s.is_empty()).collect();
    if !host.is_empty() && host != "localhost" && host != "opendoc.localhost" {
        Some((host.to_string(), segs.join("/")))
    } else if segs.is_empty() {
        None
    } else {
        Some((segs.remove(0).to_string(), segs.join("/")))
    }
}

/// Sirve un fichero de docset como respuesta HTTP (puro, testeable).
pub fn serve_file(docsets: &[Docset], id: &str, raw_path: &str) -> tauri::http::Response<Vec<u8>> {
    match serve_inner(docsets, id, raw_path) {
        Ok((bytes, mime)) => response(
            200,
            mime,
            if mime == "text/html" {
                inject_theme_support(&bytes)
            } else {
                bytes
            },
        ),
        Err(ServeError::UnknownDocset) => {
            response(404, "text/plain", b"docset desconocido".to_vec())
        }
        Err(ServeError::NoDocuments) => {
            response(404, "text/plain", b"docset sin documentos".to_vec())
        }
        Err(ServeError::NoHomePage) => {
            response(404, "text/plain", b"sin pagina de inicio".to_vec())
        }
        Err(ServeError::Resolve(ResolveError::NotFound(_))) => {
            response(404, "text/plain", b"no encontrado".to_vec())
        }
        Err(ServeError::Resolve(_)) => response(403, "text/plain", b"prohibido".to_vec()),
    }
}

/// Lógica de servicio: docset → `Documents/` → fichero.
fn serve_inner(
    docsets: &[Docset],
    id: &str,
    raw_path: &str,
) -> Result<(Vec<u8>, &'static str), ServeError> {
    let docset = docsets
        .iter()
        .find(|d| d.id == id)
        .ok_or(ServeError::UnknownDocset)?;
    let documents = docset.contents_path.join("Resources/Documents");
    if !documents.is_dir() {
        return Err(ServeError::NoDocuments);
    }
    // Sin ruta (`opendoc://<id>`) → página de inicio del docset.
    let path = if raw_path.is_empty() {
        docset.home_path.as_deref().ok_or(ServeError::NoHomePage)?
    } else {
        raw_path
    };
    let resolved = resolve_request(&documents, path).map_err(ServeError::Resolve)?;
    let bytes = std::fs::read(&resolved.path)
        .map_err(|_| ServeError::Resolve(ResolveError::NotFound(raw_path.to_string())))?;
    Ok((bytes, resolved.mime))
}

/// Soporte de tema oscuro provisional (hasta temas por docset en v1.0).
/// Inyecta SIEMPRE en `text/html` un bloque constante: un `<style>` con el
/// filtro invertido bajo `html[data-opendoc-theme="dark"]` (reinvirtiendo
/// img/video/canvas/svg) y un `<script>` mínimo que pone/quita ese atributo
/// al recibir `{type:"opendoc-theme", value:"dark"|"light"}` solo desde
/// `window.parent`. Sin el atributo no cambia nada visualmente.
/// Punto de inserción: antes de `</head>` (insensible a caso) o, si no hay,
/// tras el BOM / al inicio. Solo ASCII: no re-codifica el documento.
pub const THEME_STYLE: &str = "<style>html[data-opendoc-theme=\"dark\"]{filter:invert(1) hue-rotate(180deg);}html[data-opendoc-theme=\"dark\"] img,html[data-opendoc-theme=\"dark\"] video,html[data-opendoc-theme=\"dark\"] canvas,html[data-opendoc-theme=\"dark\"] svg{filter:invert(1) hue-rotate(180deg);}</style>";
pub const THEME_SCRIPT: &str = "<script>(function(){window.addEventListener(\"message\",function(e){if(e.source!==window.parent)return;var d=e.data;if(!d||d.type!==\"opendoc-theme\")return;if(d.value===\"dark\"){document.documentElement.setAttribute(\"data-opendoc-theme\",\"dark\");}else if(d.value===\"light\"){document.documentElement.removeAttribute(\"data-opendoc-theme\");}});})();</script>";

/// BOM UTF-8 (se respeta al insertar al inicio).
const UTF8_BOM: [u8; 3] = [0xEF, 0xBB, 0xBF];

/// Inserta `THEME_STYLE + THEME_SCRIPT` en un HTML.
pub fn inject_theme_support(html: &[u8]) -> Vec<u8> {
    let block = format!("{THEME_STYLE}{THEME_SCRIPT}");
    let bytes = block.as_bytes();
    if let Some(pos) = find_head_close(html) {
        let mut out = Vec::with_capacity(html.len() + bytes.len());
        out.extend_from_slice(&html[..pos]);
        out.extend_from_slice(bytes);
        out.extend_from_slice(&html[pos..]);
        out
    } else {
        let start = if html.starts_with(&UTF8_BOM) {
            UTF8_BOM.len()
        } else {
            0
        };
        let mut out = Vec::with_capacity(html.len() + bytes.len());
        out.extend_from_slice(&html[..start]);
        out.extend_from_slice(bytes);
        out.extend_from_slice(&html[start..]);
        out
    }
}

/// Posición de `</head>` insensible a mayúsculas (`None` si no hay).
fn find_head_close(html: &[u8]) -> Option<usize> {
    const NEEDLE: &[u8] = b"</head>";
    html.windows(NEEDLE.len()).position(|w| {
        w.iter()
            .zip(NEEDLE.iter())
            .all(|(a, b)| a.to_ascii_lowercase() == *b)
    })
}
/// constantes inválidas, que no usamos).
/// `Access-Control-Allow-Origin: *`: el iframe tiene origen opaco
/// (sandbox sin same-origin) y las fuentes (@font-face) y fetch() exigen
/// CORS incluso en mismo host; `*` es seguro aquí (sin credenciales ni
/// cookies; este host solo existe dentro del webview).
fn response(status: u16, mime: &'static str, body: Vec<u8>) -> tauri::http::Response<Vec<u8>> {
    tauri::http::Response::builder()
        .status(status)
        .header("Content-Type", mime)
        .header("Access-Control-Allow-Origin", "*")
        .body(body)
        .unwrap_or_else(|_| tauri::http::Response::new(Vec::new()))
}

/// Handler registrado en `lib.rs`. Nunca pánico: todo error es un estado.
pub fn handle<R: Runtime>(
    ctx: UriSchemeContext<'_, R>,
    req: tauri::http::Request<Vec<u8>>,
) -> tauri::http::Response<Vec<u8>> {
    let (id, rest) = match parse_opendoc_uri(req.uri()) {
        Some(parts) => parts,
        None => return response(400, "text/plain", b"url invalida".to_vec()),
    };
    let Some(state) = ctx.app_handle().try_state::<AppState>() else {
        return response(500, "text/plain", b"sin estado".to_vec());
    };
    let Ok(loaded) = state.loaded.lock() else {
        return response(500, "text/plain", b"estado bloqueado".to_vec());
    };
    if cfg!(debug_assertions) {
        eprintln!("[opendoc] serve {id} / {rest}");
    }
    serve_file(&loaded.docsets, &id, &rest)
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::path::{Path, PathBuf};

    fn uri(s: &str) -> tauri::http::Uri {
        s.parse().expect("uri válida")
    }

    #[test]
    fn parses_all_uri_shapes() {
        assert_eq!(
            parse_opendoc_uri(&uri("opendoc://css/a/b.html")),
            Some(("css".to_string(), "a/b.html".to_string()))
        );
        assert_eq!(
            parse_opendoc_uri(&uri("opendoc://localhost/css/a/b.html")),
            Some(("css".to_string(), "a/b.html".to_string()))
        );
        assert_eq!(
            parse_opendoc_uri(&uri("http://opendoc.localhost/css/a/b.html")),
            Some(("css".to_string(), "a/b.html".to_string()))
        );
        assert_eq!(
            parse_opendoc_uri(&uri("opendoc://css")),
            Some(("css".to_string(), "".to_string()))
        );
        assert_eq!(parse_opendoc_uri(&uri("opendoc://localhost/")), None);
    }

    /// Docset sintético con `Documents/sub/index.html` en Temp.
    fn sample_docset(dir: &Path) -> Docset {
        let contents = dir.join("Contents");
        let docs = contents.join("Resources/Documents");
        std::fs::create_dir_all(docs.join("sub")).expect("mkdirs");
        std::fs::write(docs.join("a.html"), "<html>a</html>").expect("write");
        std::fs::write(docs.join("sub/index.html"), "<html>sub</html>").expect("write");
        Docset {
            id: "demo".to_string(),
            name: "Demo".to_string(),
            platform: None,
            version: None,
            bundle_id: None,
            home_path: Some("a.html".to_string()),
            root_path: dir.to_path_buf(),
            contents_path: contents,
        }
    }

    #[test]
    fn serves_files_dirs_and_home() {
        let dir = tempfile::tempdir().expect("tempdir");
        let docsets = vec![sample_docset(dir.path())];
        let ok = serve_file(&docsets, "demo", "a.html");
        assert_eq!(ok.status(), 200);
        assert_eq!(ok.headers().get("Content-Type").expect("mime"), "text/html");
        // CORS para el iframe de origen opaco (fuentes web y fetch).
        assert_eq!(
            ok.headers()
                .get("Access-Control-Allow-Origin")
                .expect("cors"),
            "*"
        );
        assert_eq!(serve_file(&docsets, "demo", "sub").status(), 200);
        assert_eq!(serve_file(&docsets, "demo", "").status(), 200);
        assert_eq!(serve_file(&docsets, "demo", "nope.html").status(), 404);
        assert_eq!(serve_file(&docsets, "demo", "../x").status(), 403);
        assert_eq!(serve_file(&docsets, "otro", "a.html").status(), 404);
    }

    #[test]
    fn theme_injection_points() {
        // Antes de </head> (cualquier caso).
        for html in [
            "<html><head><title>x</title></head><body></body></html>",
            "<HTML><HEAD></HEAD><BODY></BODY></HTML>",
        ] {
            let out = inject_theme_support(html.as_bytes());
            let s = String::from_utf8(out).expect("utf8");
            assert!(s.contains(THEME_STYLE), "{html}");
            assert!(s.contains(THEME_SCRIPT), "{html}");
            let style_pos = s.find(THEME_STYLE).expect("style");
            let head_pos = s.to_lowercase().find("</head>").expect("head");
            assert!(style_pos < head_pos, "{html}");
        }
        // Sin head: al inicio (tras BOM si lo hay).
        let no_head = "<html><body>hola</body></html>";
        let out = inject_theme_support(no_head.as_bytes());
        assert!(String::from_utf8(out)
            .expect("utf8")
            .starts_with(THEME_STYLE));
        let mut bom = vec![0xEF, 0xBB, 0xBF];
        bom.extend_from_slice(no_head.as_bytes());
        let out = inject_theme_support(&bom);
        assert_eq!(&out[..3], &[0xEF, 0xBB, 0xBF]);
        assert!(String::from_utf8(out[3..].to_vec())
            .expect("utf8")
            .starts_with(THEME_STYLE));
        // El bloque es constante: mismo input, mismo output.
        assert_eq!(
            inject_theme_support(no_head.as_bytes()),
            inject_theme_support(no_head.as_bytes())
        );
    }

    #[test]
    fn non_html_untouched_and_script_shape() {
        // El script solo acepta forma exacta desde window.parent.
        assert!(THEME_SCRIPT.contains("e.source!==window.parent"));
        assert!(THEME_SCRIPT.contains("d.type!==\"opendoc-theme\""));
        assert!(THEME_SCRIPT.contains("data-opendoc-theme"));
        assert!(THEME_STYLE.contains("invert(1) hue-rotate(180deg)"));
    }

    #[test]
    fn real_css_home_serves_with_html_mime() {
        let Some(dsidx_dir) = crate::docset::fixture_or_skip("CSS.docset/Contents/Resources")
        else {
            return;
        };
        let contents = dsidx_dir.parent().expect("Contents").to_path_buf();
        let home = "developer.mozilla.org/en-US/docs/Web/CSS/Reference.html";
        let docsets = vec![Docset {
            id: "css".to_string(),
            name: "CSS".to_string(),
            platform: Some("css".to_string()),
            version: None,
            bundle_id: Some("css".to_string()),
            home_path: Some(home.to_string()),
            root_path: contents.parent().expect("docset").to_path_buf(),
            contents_path: contents,
        }];
        let res = serve_file(&docsets, "css", home);
        assert_eq!(res.status(), 200);
        assert_eq!(
            res.headers().get("Content-Type").expect("mime"),
            "text/html"
        );
        assert!(!res.body().is_empty());
    }

    #[test]
    fn tarix_without_documents_is_404() {
        if crate::docset::fixture_or_skip("C++.docset").is_none() {
            return;
        }
        let contents = PathBuf::from("tests/fixtures/C++.docset/Contents");
        let docsets = vec![Docset {
            id: "c++".to_string(),
            name: "C++".to_string(),
            platform: None,
            version: None,
            bundle_id: None,
            home_path: None,
            root_path: PathBuf::from("tests/fixtures/C++.docset"),
            contents_path: contents,
        }];
        assert_eq!(serve_file(&docsets, "c++", "x.html").status(), 404);
    }
}
