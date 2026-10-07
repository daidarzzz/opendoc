//! Comandos Tauri finos (contrato SPEC §4.4): `list_docsets`,
//! `set_docsets_dir`, `search`, `get_docset_home`.
//!
//! Solo delegan en `service.rs` (testeable sin Tauri). Si se toca este
//! contrato, actualizar `src/lib/types.ts` y la tabla de SPEC §4.4.

pub mod error;
pub mod service;
pub mod state;

pub use error::ApiError;
pub use service::{SearchRequest, SearchResponse};
pub use state::{AppState, Loaded};

use tauri::State;

/// Lista los docsets cargados (vacío hasta el primer `set_docsets_dir`).
#[tauri::command]
pub fn list_docsets(state: State<'_, AppState>) -> Vec<crate::docset::Docset> {
    state
        .loaded
        .lock()
        .map(|loaded| loaded.docsets.clone())
        .unwrap_or_default()
}

/// Carga una carpeta de docsets (escaneo + índices) sin bloquear la UI.
/// Devuelve el resumen para mostrar docsets e issues.
#[tauri::command]
pub async fn set_docsets_dir(
    state: State<'_, AppState>,
    path: String,
) -> Result<crate::docset::ScanReport, ApiError> {
    let loaded =
        tauri::async_runtime::spawn_blocking(move || service::load_docsets_dir(path.as_ref()))
            .await
            .map_err(|e| ApiError::LoadFailed {
                message: e.to_string(),
            })??;
    let report = service::load_report(&loaded);
    state
        .loaded
        .lock()
        .map(|mut guard| *guard = loaded)
        .map_err(|e| ApiError::LoadFailed {
            message: e.to_string(),
        })?;
    Ok(report)
}

/// Búsqueda rápida con eco de `request_id` (la UI descarta obsoletas).
#[tauri::command]
pub fn search(
    state: State<'_, AppState>,
    request: SearchRequest,
) -> Result<SearchResponse, ApiError> {
    state
        .loaded
        .lock()
        .map(|mut loaded| service::search_loaded(&mut loaded, &request))
        .map_err(|e| ApiError::LoadFailed {
            message: e.to_string(),
        })
}

/// URL `opendoc://<id>/<home>` (el protocolo se sirve en T8).
#[tauri::command]
pub fn get_docset_home(state: State<'_, AppState>, docset_id: String) -> Result<String, ApiError> {
    state
        .loaded
        .lock()
        .map_err(|e| ApiError::LoadFailed {
            message: e.to_string(),
        })
        .and_then(|loaded| service::docset_home_url(&loaded.docsets, &docset_id))
}
