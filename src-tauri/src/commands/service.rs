//! Lógica de los comandos Tauri como funciones puras y testeables (T6).
//!
//! Sin tipos de Tauri aquí: los `#[tauri::command]` de `mod.rs` solo
//! delegan. La carga pesada (escaneo + lectura de índices) corre en
//! `spawn_blocking` desde el comando async.

use std::path::Path;

use serde::{Deserialize, Serialize};

use crate::docset::{
    apply_to_docset, read_index, read_info_plist, scan_dir, Docset, Entry, IssueKind, PendingTarix,
    ScanIssue, ScanReport, TarixLimits,
};
use crate::search::{search as search_index, SearchIndex, SearchResult};

use super::error::ApiError;
use super::state::Loaded;

/// Límite de resultados por defecto y tope (no serializar el índice entero
/// al frontend por accidente).
pub const DEFAULT_LIMIT: usize = 50;
/// Tope absoluto de resultados por búsqueda.
pub const MAX_LIMIT: usize = 500;

/// Petición de búsqueda. El `request_id` lo pone el frontend y vuelve
/// intacto en la respuesta para descartar respuestas obsoletas.
#[derive(Debug, Clone, Deserialize)]
pub struct SearchRequest {
    /// Id opaco de la petición (eco en la respuesta).
    pub request_id: u64,
    /// Texto a buscar (vacío → sin resultados).
    pub query: String,
    /// Filtro opcional por ids de docset.
    pub docset_ids: Option<Vec<String>>,
    /// Tope opcional (`None` → 50, siempre ≤ 500).
    pub limit: Option<usize>,
}

/// Respuesta de búsqueda con el `request_id` de eco.
#[derive(Debug, Clone, Serialize)]
pub struct SearchResponse {
    /// Eco del `request_id` de la petición.
    pub request_id: u64,
    /// Resultados ordenados (hasta `limit`).
    pub results: Vec<SearchResult>,
}

/// Opciones de carga (la caché vive fuera de la carpeta del usuario).
pub struct LoadOptions {
    /// Base de `tarix-cache/<id>/` (datos de la app en producción).
    pub cache_base: std::path::PathBuf,
    /// Si es `false` solo se reutilizan cachés existentes (arranque rápido);
    /// si es `true` se extrae lo que falte (carga explícita, lenta la
    /// primera vez pero sin bloquear la UI: corre en `spawn_blocking`).
    pub extract_missing: bool,
}

/// Carga una carpeta de docsets: escanea, lee índices, instala tarix según
/// opciones y construye el índice en memoria. Solo los docsets abribles
/// entran en la búsqueda; el resto queda en `issues`/`pending` sin tumbarla.
pub fn load_docsets_dir(dir: &Path, opts: &LoadOptions) -> Result<Loaded, ApiError> {
    if !dir.is_dir() {
        return Err(ApiError::InvalidDir {
            path: dir.display().to_string(),
        });
    }
    let report = scan_dir(dir).map_err(|e| ApiError::InvalidDir {
        path: format!("{}: {e}", dir.display()),
    })?;
    let mut entries: Vec<Entry> = Vec::new();
    let mut issues = report.issues;
    let mut docsets = report.docsets;
    let mut pending = Vec::new();
    for tarix in &report.pending_tarix {
        if opts.extract_missing {
            match install_pending(&opts.cache_base, tarix) {
                Ok(installed) => {
                    entries.extend(installed.entries);
                    docsets.push(installed.docset);
                }
                Err(e) => {
                    if cfg!(debug_assertions) {
                        eprintln!("[opendoc] tarix {}: {e}", tarix.id);
                    }
                    issues.push(ScanIssue {
                        path: tarix.root_path.clone(),
                        kind: IssueKind::TarixFailed,
                    });
                    pending.push(tarix.clone());
                }
            }
        } else {
            pending.push(tarix.clone());
        }
    }
    docsets.sort_by(|a, b| {
        a.name
            .to_lowercase()
            .cmp(&b.name.to_lowercase())
            .then_with(|| a.name.cmp(&b.name))
    });
    for docset in &docsets {
        if docset.contents_path.starts_with(&opts.cache_base) {
            continue; // Tarix ya integrado arriba con sus entradas.
        }
        let dsidx = docset.contents_path.join("Resources/docSet.dsidx");
        match read_index(&dsidx, &docset.id) {
            Ok(data) => entries.extend(data.entries),
            Err(_) => {
                if !has_issue(&issues, &docset.root_path, &IssueKind::InvalidIndex) {
                    issues.push(ScanIssue {
                        path: docset.root_path.clone(),
                        kind: IssueKind::InvalidIndex,
                    });
                }
            }
        }
    }
    Ok(Loaded {
        source_dir: dir.to_path_buf(),
        docsets,
        pending,
        issues,
        index: SearchIndex::build(entries),
    })
}

/// Un tarix instalado: `Docset` apuntando a la caché + sus entradas.
pub struct InstalledTarix {
    /// Docset con `contents_path` en la caché extraída.
    pub docset: Docset,
    /// Entradas leídas del `.dsidx` original.
    pub entries: Vec<Entry>,
}

/// Instala un tarix pendiente: asegura la caché y construye su `Docset`
/// (metadatos del original, `Documents/` de la caché).
pub fn install_pending(
    cache_base: &Path,
    pending: &PendingTarix,
) -> Result<InstalledTarix, crate::docset::TarixError> {
    use crate::docset::TarixError;
    let resources = pending.root_path.join("Contents/Resources");
    let tgz = resources.join("tarix.tgz");
    crate::docset::ensure_extracted(cache_base, &pending.id, &tgz, TarixLimits::default())?;
    let extracted_contents =
        crate::docset::tarix::cache_dir_for(cache_base, &pending.id).join("Contents");
    let mut docset = Docset {
        id: pending.id.clone(),
        name: pending.name.clone(),
        platform: None,
        version: None,
        bundle_id: None,
        home_path: None,
        root_path: pending.root_path.clone(),
        contents_path: extracted_contents,
    };
    let orig_contents = pending.root_path.join("Contents");
    if let Ok(Some(info)) = read_info_plist(&orig_contents) {
        apply_to_docset(&mut docset, &info);
    }
    let orig_dsidx = resources.join("docSet.dsidx");
    let data = read_index(&orig_dsidx, &pending.id)
        .map_err(|e| TarixError::Corrupt(format!("índice: {e}")))?;
    if docset.home_path.is_none() {
        if let Some(first) = data.entries.first() {
            docset.home_path = Some(first.path.clone());
        }
    }
    Ok(InstalledTarix {
        docset,
        entries: data.entries,
    })
}

/// Error al instalar un pendiente concreto: el id no está en pendientes.
#[derive(Debug)]
pub struct UnknownPendingId {
    /// Id solicitado.
    pub id: String,
}

/// Integra un tarix ya instalado en `loaded`: lo mueve a docsets (con
/// orden determinista), extiende el índice y lo quita de pendientes.
pub fn apply_installed(loaded: &mut Loaded, installed: InstalledTarix) {
    let id = installed.docset.id.clone();
    loaded.pending.retain(|p| p.id != id);
    loaded.index.extend(installed.entries);
    loaded.docsets.push(installed.docset);
    loaded.docsets.sort_by(|a, b| {
        a.name
            .to_lowercase()
            .cmp(&b.name.to_lowercase())
            .then_with(|| a.name.cmp(&b.name))
    });
}

/// Registra un fallo de instalación como issue `TarixFailed` (sin duplicar)
/// manteniendo el pendiente para reintentar.
pub fn fail_pending(loaded: &mut Loaded, pending: &PendingTarix) {
    if !has_issue(&loaded.issues, &pending.root_path, &IssueKind::TarixFailed) {
        loaded.issues.push(ScanIssue {
            path: pending.root_path.clone(),
            kind: IssueKind::TarixFailed,
        });
    }
}

/// Busca en lo cargado. Nunca falla: sin coincidencias devuelve vacío.
pub fn search_loaded(loaded: &mut Loaded, req: &SearchRequest) -> SearchResponse {
    let limit = req.limit.unwrap_or(DEFAULT_LIMIT).clamp(1, MAX_LIMIT);
    let results = search_index(
        &mut loaded.index,
        &req.query,
        req.docset_ids.as_deref(),
        limit,
    );
    SearchResponse {
        request_id: req.request_id,
        results,
    }
}

/// URL `opendoc://<id>/<home>` de la página de inicio (el protocolo se
/// sirve en T8; aquí solo se genera la URL).
pub fn docset_home_url(docsets: &[Docset], id: &str) -> Result<String, ApiError> {
    let docset = docsets
        .iter()
        .find(|d| d.id == id)
        .ok_or_else(|| ApiError::UnknownDocset { id: id.to_string() })?;
    let home = docset
        .home_path
        .as_deref()
        .ok_or_else(|| ApiError::NoHomePage { id: id.to_string() })?;
    Ok(docset_url(id, home))
}

/// Construye `opendoc://<id>/<home>` sin validar (helper puro).
pub fn docset_url(id: &str, home: &str) -> String {
    format!("opendoc://{id}/{home}")
}

/// Resumen de carga para devolver al frontend.
pub fn load_report(loaded: &Loaded) -> ScanReport {
    ScanReport {
        docsets: loaded.docsets.clone(),
        pending_tarix: loaded.pending.clone(),
        issues: loaded.issues.clone(),
    }
}

/// `true` si ya hay un issue igual (evita duplicar `InvalidIndex`: el
/// escáner pudo registrarlo al intentar el fallback de home).
fn has_issue(issues: &[ScanIssue], path: &Path, kind: &IssueKind) -> bool {
    issues.iter().any(|i| i.path == path && &i.kind == kind)
}

/// Ruta del `.dsidx` de fixtures en tests (cargo corre desde `src-tauri/`).
#[cfg(test)]
fn fixtures_dir() -> std::path::PathBuf {
    std::path::PathBuf::from("tests/fixtures")
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::path::PathBuf;

    /// Opciones de carga en tests: caché en Temp, sin extraer (rápido).
    fn test_options() -> (tempfile::TempDir, LoadOptions) {
        let dir = tempfile::tempdir().expect("tempdir");
        let opts = LoadOptions {
            cache_base: dir.path().join("tarix-cache"),
            extract_missing: false,
        };
        (dir, opts)
    }

    #[test]
    fn invalid_dir_returns_typed_error() {
        let (_tmp, opts) = test_options();
        let err = load_docsets_dir(Path::new("definitivamente/no/existe"), &opts)
            .expect_err("debe fallar");
        assert!(matches!(err, ApiError::InvalidDir { .. }));
        let err = load_docsets_dir(Path::new("tests/fixtures/README.md"), &opts)
            .expect_err("fichero no es dir");
        assert!(matches!(err, ApiError::InvalidDir { .. }));
    }

    #[test]
    fn load_fixtures_indexes_css_and_lists_tarix_pending() {
        if crate::docset::fixture_or_skip("CSS.docset").is_none() {
            return;
        }
        let (_tmp, opts) = test_options();
        let mut loaded = load_docsets_dir(&fixtures_dir(), &opts).expect("cargar fixtures");
        // Solo CSS es abrible; C++ y Python_3 quedan pendientes (no issues).
        assert_eq!(loaded.docsets.len(), 1);
        assert_eq!(loaded.docsets[0].id, "css");
        assert_eq!(loaded.index.len(), 1249);
        let mut pending: Vec<&str> = loaded.pending.iter().map(|p| p.id.as_str()).collect();
        pending.sort_unstable();
        assert_eq!(pending, vec!["c", "python-3"]);
        assert!(loaded.issues.is_empty());
        // La búsqueda funciona sobre lo cargado.
        let res = search_loaded(
            &mut loaded,
            &SearchRequest {
                request_id: 7,
                query: "grid".to_string(),
                docset_ids: None,
                limit: None,
            },
        );
        assert_eq!(res.request_id, 7);
        assert_eq!(res.results[0].name, "grid");
    }

    #[test]
    fn request_id_echo_and_filters() {
        if crate::docset::fixture_or_skip("CSS.docset").is_none() {
            return;
        }
        let (_tmp, opts) = test_options();
        let mut loaded = load_docsets_dir(&fixtures_dir(), &opts).expect("cargar fixtures");
        let req = SearchRequest {
            request_id: 42,
            query: "color".to_string(),
            docset_ids: Some(vec!["css".to_string()]),
            limit: Some(3),
        };
        let res = search_loaded(&mut loaded, &req);
        assert_eq!(res.request_id, 42);
        assert!(res.results.len() <= 3);
        assert!(res.results.iter().all(|r| r.docset_id == "css"));
        // Filtro a docset inexistente → vacío, no error.
        let req = SearchRequest {
            request_id: 43,
            query: "color".to_string(),
            docset_ids: Some(vec!["nope".to_string()]),
            limit: None,
        };
        let res = search_loaded(&mut loaded, &req);
        assert_eq!(res.request_id, 43);
        assert!(res.results.is_empty());
    }

    #[test]
    fn home_url_and_errors() {
        if crate::docset::fixture_or_skip("CSS.docset").is_none() {
            return;
        }
        let (_tmp, opts) = test_options();
        let loaded = load_docsets_dir(&fixtures_dir(), &opts).expect("cargar fixtures");
        let url = docset_home_url(&loaded.docsets, "css").expect("home css");
        assert_eq!(
            url,
            "opendoc://css/developer.mozilla.org/en-US/docs/Web/CSS/Reference.html"
        );
        let err = docset_home_url(&loaded.docsets, "nope").expect_err("desconocido");
        assert!(matches!(err, ApiError::UnknownDocset { .. }));
        let docsets = vec![Docset {
            id: "sinhome".to_string(),
            name: "SinHome".to_string(),
            platform: None,
            version: None,
            bundle_id: None,
            home_path: None,
            root_path: PathBuf::from("x"),
            contents_path: PathBuf::from("x/Contents"),
        }];
        let err = docset_home_url(&docsets, "sinhome").expect_err("sin home");
        assert!(matches!(err, ApiError::NoHomePage { .. }));
    }

    #[test]
    fn docset_url_keeps_anchor() {
        assert_eq!(
            docset_url("css", "a/b.html#frag"),
            "opendoc://css/a/b.html#frag"
        );
    }

    #[test]
    fn error_serializes_with_kind() {
        let err = ApiError::UnknownDocset {
            id: "x".to_string(),
        };
        let json = serde_json::to_value(&err).expect("serializar");
        assert_eq!(json["kind"], "unknown_docset");
        assert!(json.to_string().contains('x'));
    }

    /// Docset tarix sintético: `Contents/` con plist + dsidx mínimo +
    /// `tarix.tgz` cuya raíz interna trae `Documents/`.
    fn make_tarix_docset(root: &Path, name: &str) -> PathBuf {
        use flate2::write::GzEncoder;
        use flate2::Compression;
        let docset = root.join(name);
        let resources = docset.join("Contents/Resources");
        std::fs::create_dir_all(resources.join("Documents.tmp").parent().expect("padre"))
            .expect("mkdirs");
        // plist mínimo
        std::fs::write(
            docset.join("Contents/Info.plist"),
            r#"<?xml version="1.0" encoding="UTF-8"?><plist version="1.0"><dict>
<key>CFBundleName</key><string>Demo</string>
<key>dashIndexFilePath</key><string>home.html</string>
</dict></plist>"#,
        )
        .expect("plist");
        // dsidx mínimo con una entrada
        let conn = rusqlite::Connection::open(resources.join("docSet.dsidx")).expect("dsidx");
        conn.execute_batch(
            "CREATE TABLE searchIndex(id INTEGER PRIMARY KEY, name TEXT, type TEXT, path TEXT);
             INSERT INTO searchIndex(name, type, path) VALUES ('cosa', 'Guide', 'cosa.html');",
        )
        .expect("poblar");
        drop(conn);
        // tgz con Documents/home.html + la página de la entrada
        let tgz_path = resources.join("tarix.tgz");
        let file = std::fs::File::create(&tgz_path).expect("tgz");
        let enc = GzEncoder::new(file, Compression::fast());
        let mut archive = tar::Builder::new(enc);
        for (name, content) in [
            (
                "Demo.docset/Contents/Resources/Documents/home.html",
                "<html>home</html>",
            ),
            (
                "Demo.docset/Contents/Resources/Documents/cosa.html",
                "<html>cosa</html>",
            ),
        ] {
            let mut header = tar::Header::new_gnu();
            header.set_size(content.len() as u64);
            header.set_mode(0o644);
            header.set_cksum();
            archive
                .append_data(&mut header, name, content.as_bytes())
                .expect("añadir");
        }
        archive
            .into_inner()
            .expect("cerrar")
            .finish()
            .expect("finish");
        // triada tarix (el db puede estar vacío: no se lee en T10)
        std::fs::write(resources.join("tarixIndex.db"), []).expect("indexdb");
        docset
    }

    #[test]
    fn install_and_apply_moves_pending_to_docsets() {
        let dir = tempfile::tempdir().expect("tempdir");
        let docset = make_tarix_docset(dir.path(), "Demo.docset");
        let cache = dir.path().join("cache");
        let pending = PendingTarix {
            id: "demo".to_string(),
            name: "Demo".to_string(),
            root_path: docset,
        };
        let installed = install_pending(&cache, &pending).expect("instalar");
        assert_eq!(installed.docset.name, "Demo"); // del plist
        assert_eq!(installed.docset.home_path.as_deref(), Some("home.html"));
        assert!(installed
            .docset
            .contents_path
            .starts_with(cache.join("demo")));
        assert_eq!(installed.entries.len(), 1);

        let mut loaded = Loaded::default();
        loaded.pending.push(pending);
        apply_installed(&mut loaded, installed);
        assert!(loaded.pending.is_empty());
        assert_eq!(loaded.docsets.len(), 1);
        assert_eq!(loaded.index.len(), 1);
        let res = search_loaded(
            &mut loaded,
            &SearchRequest {
                request_id: 1,
                query: "cosa".to_string(),
                docset_ids: None,
                limit: None,
            },
        );
        assert_eq!(res.results[0].name, "cosa");
    }

    #[test]
    fn failed_install_keeps_pending_and_records_issue_once() {
        let dir = tempfile::tempdir().expect("tempdir");
        let pending = PendingTarix {
            id: "roto".to_string(),
            name: "Roto".to_string(),
            root_path: dir.path().join("Roto.docset"), // sin triada
        };
        let mut loaded = Loaded::default();
        loaded.pending.push(pending.clone());
        fail_pending(&mut loaded, &pending);
        fail_pending(&mut loaded, &pending);
        assert_eq!(loaded.pending.len(), 1, "el pendiente se conserva");
        assert_eq!(loaded.issues.len(), 1, "sin duplicar issues");
        assert_eq!(loaded.issues[0].kind, IssueKind::TarixFailed);
    }

    #[test]
    fn load_with_extract_missing_installs_synthetic_tarix() {
        let dir = tempfile::tempdir().expect("tempdir");
        make_tarix_docset(dir.path(), "Demo.docset");
        let opts = LoadOptions {
            cache_base: dir.path().join("cache"),
            extract_missing: true,
        };
        let report_dir = dir.path();
        let loaded = load_docsets_dir(report_dir, &opts).expect("cargar");
        assert_eq!(loaded.docsets.len(), 1);
        assert_eq!(loaded.docsets[0].id, "demo");
        assert!(loaded.pending.is_empty());
        assert!(loaded.issues.is_empty());
        assert_eq!(loaded.index.len(), 1);
    }
}
