//! Comandos Tauri finos (contrato SPEC §4.4 + ajustes T9): `list_docsets`,
//! `set_docsets_dir`, `search`, `get_docset_home`, `get_settings`,
//! `set_theme`.
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

/// Traza de diagnóstico solo en debug (el terminal de `tauri dev` muestra
/// si el invoke llega al backend y qué devuelve).
#[cfg(debug_assertions)]
macro_rules! dlog {
    ($($t:tt)*) => {
        eprintln!($($t)*)
    };
}
#[cfg(not(debug_assertions))]
macro_rules! dlog {
    ($($t:tt)*) => {};
}

/// Lista los docsets cargados (vacío hasta el primer `set_docsets_dir`).
#[tauri::command]
pub fn list_docsets(state: State<'_, AppState>) -> Vec<crate::docset::Docset> {
    let docs = state
        .loaded
        .lock()
        .map(|loaded| loaded.docsets.clone())
        .unwrap_or_default();
    dlog!("[opendoc] list_docsets -> {} docsets", docs.len());
    docs
}

/// Carga una carpeta de docsets (escaneo + índices) sin bloquear la UI.
/// Devuelve el resumen para mostrar docsets e issues.
#[tauri::command]
pub async fn set_docsets_dir(
    state: State<'_, AppState>,
    app: tauri::AppHandle,
    path: String,
) -> Result<crate::docset::ScanReport, ApiError> {
    dlog!("[opendoc] set_docsets_dir <- {path}");
    let loaded =
        tauri::async_runtime::spawn_blocking(move || service::load_docsets_dir(path.as_ref()))
            .await
            .map_err(|e| ApiError::LoadFailed {
                message: e.to_string(),
            })??;
    dlog!(
        "[opendoc] cargados {} docsets, {} issues",
        loaded.docsets.len(),
        loaded.issues.len()
    );
    let report = service::load_report(&loaded);
    let source_dir = loaded.source_dir.clone();
    state
        .loaded
        .lock()
        .map(|mut guard| *guard = loaded)
        .map_err(|e| ApiError::LoadFailed {
            message: e.to_string(),
        })?;
    persist_docsets_dir(&state, &app, &source_dir);
    Ok(report)
}

/// Guarda `docsets_dir` en ajustes si cambió. Nunca falla hacia fuera
/// (un fallo de disco no debe tumbar una carga correcta).
fn persist_docsets_dir(
    state: &State<'_, AppState>,
    app: &tauri::AppHandle,
    source_dir: &std::path::Path,
) {
    use tauri::Manager;
    let Ok(data_dir) = app.path().app_data_dir() else {
        return;
    };
    let settings_path = crate::settings::settings_file(&data_dir);
    let settings = match state.settings.lock() {
        Ok(mut guard) => {
            if guard.docsets_dir.as_deref() == Some(source_dir) {
                return;
            }
            guard.docsets_dir = Some(source_dir.to_path_buf());
            guard.clone()
        }
        Err(_) => return,
    };
    let _ = crate::settings::save_if_changed(&settings_path, &settings);
}

/// Búsqueda rápida con eco de `request_id` (la UI descarta obsoletas).
#[tauri::command]
pub fn search(
    state: State<'_, AppState>,
    request: SearchRequest,
) -> Result<SearchResponse, ApiError> {
    let res = state
        .loaded
        .lock()
        .map(|mut loaded| service::search_loaded(&mut loaded, &request))
        .map_err(|e| ApiError::LoadFailed {
            message: e.to_string(),
        })?;
    dlog!(
        "[opendoc] search req={} q={:?} -> {} resultados",
        request.request_id,
        request.query,
        res.results.len()
    );
    Ok(res)
}

/// URL `opendoc://<id>/<home>` (el protocolo se sirve en T8).
#[tauri::command]
pub fn get_docset_home(state: State<'_, AppState>, docset_id: String) -> Result<String, ApiError> {
    let res = state
        .loaded
        .lock()
        .map_err(|e| ApiError::LoadFailed {
            message: e.to_string(),
        })
        .and_then(|loaded| service::docset_home_url(&loaded.docsets, &docset_id));
    match &res {
        Ok(url) => dlog!("[opendoc] home {docset_id} -> {url}"),
        Err(e) => dlog!("[opendoc] home {docset_id} -> ERROR {e}"),
    }
    res
}

/// Ajustes actuales (tema y carpeta de docsets).
#[tauri::command]
pub fn get_settings(state: State<'_, AppState>) -> crate::settings::Settings {
    state
        .settings
        .lock()
        .map(|settings| settings.clone())
        .unwrap_or_default()
}

/// Cambia el tema y lo persiste (solo si cambió).
#[tauri::command]
pub fn set_theme(
    state: State<'_, AppState>,
    app: tauri::AppHandle,
    theme: crate::settings::ThemeMode,
) -> Result<crate::settings::Settings, ApiError> {
    let settings = state
        .settings
        .lock()
        .map(|mut guard| {
            guard.theme = theme;
            guard.clone()
        })
        .map_err(|e| ApiError::LoadFailed {
            message: e.to_string(),
        })?;
    {
        use tauri::Manager;
        if let Ok(data_dir) = app.path().app_data_dir() {
            let path = crate::settings::settings_file(&data_dir);
            crate::settings::save_if_changed(&path, &settings).map_err(|e| {
                ApiError::LoadFailed {
                    message: e.to_string(),
                }
            })?;
        }
    }
    Ok(settings)
}
