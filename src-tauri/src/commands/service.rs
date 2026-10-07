//! Lógica de los comandos Tauri como funciones puras y testeables (T6).
//!
//! Sin tipos de Tauri aquí: los `#[tauri::command]` de `mod.rs` solo
//! delegan. La carga pesada (escaneo + lectura de índices) corre en
//! `spawn_blocking` desde el comando async.

use std::path::Path;

use serde::{Deserialize, Serialize};

use crate::docset::{read_index, scan_dir, Docset, Entry, IssueKind, ScanIssue, ScanReport};
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

/// Carga una carpeta de docsets: escanea, lee índices y construye el índice
/// en memoria. Solo los docsets abribles entran en la búsqueda; el resto
/// queda en `issues` sin tumbar la carga.
pub fn load_docsets_dir(dir: &Path) -> Result<Loaded, ApiError> {
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
    for docset in &report.docsets {
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
        docsets: report.docsets,
        issues,
        index: SearchIndex::build(entries),
    })
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

    #[test]
    fn invalid_dir_returns_typed_error() {
        let err =
            load_docsets_dir(Path::new("definitivamente/no/existe")).expect_err("debe fallar");
        assert!(matches!(err, ApiError::InvalidDir { .. }));
        let err =
            load_docsets_dir(Path::new("tests/fixtures/README.md")).expect_err("fichero no es dir");
        assert!(matches!(err, ApiError::InvalidDir { .. }));
    }

    #[test]
    fn load_fixtures_indexes_css_and_reports_tarix() {
        if crate::docset::fixture_or_skip("CSS.docset").is_none() {
            return;
        }
        let mut loaded = load_docsets_dir(&fixtures_dir()).expect("cargar fixtures");
        // Solo CSS es abrible (C++ y Python_3 son tarix sin Documents/).
        assert_eq!(loaded.docsets.len(), 1);
        assert_eq!(loaded.docsets[0].id, "css");
        assert_eq!(loaded.index.len(), 1249);
        assert!(loaded.issues.len() >= 2);
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
        let mut loaded = load_docsets_dir(&fixtures_dir()).expect("cargar fixtures");
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
        let loaded = load_docsets_dir(&fixtures_dir()).expect("cargar fixtures");
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
}
