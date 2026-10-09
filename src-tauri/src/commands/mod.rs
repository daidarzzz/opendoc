//! Comandos Tauri finos (contrato SPEC §4.4 + ajustes T9 + navegación v0.2 + F2):
//! `list_docsets`, `set_docsets_dir`, `search`, `list_kinds`,
//! `list_entries`, `get_docset_home`, `get_settings`, `set_theme`,
//! `extract_tarix`, `get_catalog_status`, `set_feed_repo`,
//! `refresh_catalog`, `list_catalog`, `install_docset`,
//! `get_install_status`.
//!
//! Solo delegan en `service.rs` (testeable sin Tauri). Si se toca este
//! contrato, actualizar `src/lib/types.ts` y la tabla de SPEC §4.4.

pub mod error;
pub mod service;
pub mod state;

pub use error::ApiError;
pub use service::{SearchRequest, SearchResponse};
pub use state::{AppState, Loaded};

use std::collections::HashSet;

use tauri::Emitter;
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
    ($($t:tt)*) => {{}};
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

/// Carga una carpeta de docsets (escaneo + índices + tarix) sin bloquear.
/// Devuelve el resumen para mostrar docsets, pendientes e issues.
#[tauri::command]
pub async fn set_docsets_dir(
    state: State<'_, AppState>,
    app: tauri::AppHandle,
    path: String,
) -> Result<crate::docset::ScanReport, ApiError> {
    dlog!("[opendoc] set_docsets_dir <- {path}");
    let cache_base = cache_base_of(&app);
    let devicon_base = devicon_base_of(&app);
    let loaded = tauri::async_runtime::spawn_blocking(move || {
        service::load_docsets_dir(
            path.as_ref(),
            &service::LoadOptions {
                cache_base,
                devicon_base,
                extract_missing: true,
            },
        )
    })
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

/// Base de `tarix-cache/` en datos de la app (vacía si no se resuelve).
fn cache_base_of(app: &tauri::AppHandle) -> std::path::PathBuf {
    use tauri::Manager;
    app.path()
        .app_data_dir()
        .map(|d| d.join("tarix-cache"))
        .unwrap_or_default()
}

/// Base de `devicon-cache/` en datos de la app (vacía si no se resuelve;
/// con base vacía no se lee ni se escribe caché).
fn devicon_base_of(app: &tauri::AppHandle) -> std::path::PathBuf {
    use tauri::Manager;
    app.path()
        .app_data_dir()
        .map(|d| d.join("devicon-cache"))
        .unwrap_or_default()
}

/// Extrae un tarix pendiente sin bloquear la UI. Devuelve el resumen
/// actualizado. Si ya hay una extracción en curso para ese id, falla con
/// `ExtractionInProgress` (la UI desactiva el botón).
#[tauri::command]
pub async fn extract_tarix(
    state: State<'_, AppState>,
    app: tauri::AppHandle,
    docset_id: String,
) -> Result<crate::docset::ScanReport, ApiError> {
    dlog!("[opendoc] extract_tarix <- {docset_id}");
    // FASE 0: solo medida.
    let t_extract = std::time::Instant::now();
    {
        let mut extracting = state.extracting.lock().map_err(|e| ApiError::LoadFailed {
            message: e.to_string(),
        })?;
        if !extracting.insert(docset_id.clone()) {
            return Err(ApiError::ExtractionInProgress { id: docset_id });
        }
    }
    // Solo datos propios cruzan al hilo (State no es 'static).
    let pending = {
        let loaded = state.loaded.lock().map_err(|e| ApiError::LoadFailed {
            message: e.to_string(),
        })?;
        match loaded.pending.iter().find(|p| p.id == docset_id).cloned() {
            Some(pending) => pending,
            None => {
                if let Ok(mut set) = state.extracting.lock() {
                    set.remove(&docset_id);
                }
                return Err(ApiError::UnknownDocset { id: docset_id });
            }
        }
    };
    let cache_base = cache_base_of(&app);
    let installed = tauri::async_runtime::spawn_blocking(move || {
        service::install_pending(&cache_base, &pending)
    })
    .await;
    // El guard se libera siempre (también si el hilo muere).
    if let Ok(mut set) = state.extracting.lock() {
        set.remove(&docset_id);
    }
    let installed = installed.map_err(|e| ApiError::LoadFailed {
        message: e.to_string(),
    })?;
    let mut loaded = state.loaded.lock().map_err(|e| ApiError::LoadFailed {
        message: e.to_string(),
    })?;
    match installed {
        Ok(installed) => service::apply_installed(&mut loaded, installed),
        Err(_e) => {
            dlog!("[opendoc] tarix {docset_id}: {_e}");
            if let Some(pending) = loaded.pending.iter().find(|p| p.id == docset_id).cloned() {
                service::fail_pending(&mut loaded, &pending);
            }
        }
    }
    // FASE 0: solo medida.
    crate::profile::mark(
        "install",
        format_args!(
            "tarix id={docset_id} total_ms={}",
            crate::profile::ms_since(t_extract)
        ),
    );
    Ok(service::load_report(&loaded))
}

/// Directorio de datos de la app (caché del catálogo, ajustes...).
fn data_dir_of(app: &tauri::AppHandle) -> Result<std::path::PathBuf, ApiError> {
    use tauri::Manager;
    app.path().app_data_dir().map_err(|e| ApiError::LoadFailed {
        message: e.to_string(),
    })
}

/// Libera el guard de instalación de un feed. Nunca falla hacia fuera:
/// si el lock está envenenado, no hay nada útil que hacer (el siguiente
/// intento lo reportará como `LoadFailed`).
fn remove_installing(state: &State<'_, AppState>, feed_id: &str) {
    if let Ok(mut installing) = state.installing.lock() {
        installing.remove(feed_id);
    }
}

/// Máximo de instalaciones simultáneas (feeds distintos) para no
/// saturar CPU ni disco. El guard por feed ya frena duplicadas.
const MAX_CONCURRENT_INSTALLS: usize = 2;
/// Pausa entre comprobaciones de hueco (en el pool bloqueante, sin
/// detener el executor).
const SLOT_POLL: std::time::Duration = std::time::Duration::from_millis(250);

/// ¿Hay hueco global? La cuenta incluye la propia instalación (ya
/// registrada en el guard al comprobar).
fn install_slot_free(active: usize) -> bool {
    active <= MAX_CONCURRENT_INSTALLS
}

/// Espera un hueco global cediendo el executor (sin bloquear hilos).
/// El slot se libera junto al guard, en todos los caminos.
async fn wait_install_slot(state: &State<'_, AppState>) -> Result<(), ApiError> {
    loop {
        let full = state
            .installing
            .lock()
            .map(|installing| !install_slot_free(installing.len()))
            .unwrap_or(false);
        if !full {
            return Ok(());
        }
        dlog!("[opendoc] install en espera de hueco global");
        tauri::async_runtime::spawn_blocking(|| std::thread::sleep(SLOT_POLL))
            .await
            .map_err(|e| ApiError::LoadFailed {
                message: e.to_string(),
            })?;
    }
}

/// Estado del catálogo (repo, última descarga, entradas en caché). Sin red.
#[tauri::command]
pub fn get_catalog_status(
    state: State<'_, AppState>,
    app: tauri::AppHandle,
) -> Result<service::CatalogStatus, ApiError> {
    let data_dir = data_dir_of(&app)?;
    let settings = state
        .settings
        .lock()
        .map(|guard| guard.clone())
        .map_err(|e| ApiError::LoadFailed {
            message: e.to_string(),
        })?;
    Ok(service::catalog_status(&settings, &data_dir))
}

/// Configura el repo de feeds (`owner/repo` o URL). Valida y persiste.
#[tauri::command]
pub fn set_feed_repo(
    state: State<'_, AppState>,
    app: tauri::AppHandle,
    repo: String,
) -> Result<crate::settings::Settings, ApiError> {
    let normalized = crate::catalog::feed::normalize_repo(&repo)
        .map_err(|e| ApiError::FeedFailed {
            message: e.to_string(),
        })?
        .path();
    let data_dir = data_dir_of(&app)?;
    let settings = state
        .settings
        .lock()
        .map(|mut guard| {
            guard.feed_url = Some(normalized);
            guard.catalog_fetched_at = None;
            guard.clone()
        })
        .map_err(|e| ApiError::LoadFailed {
            message: e.to_string(),
        })?;
    crate::settings::save_if_changed(&crate::settings::settings_file(&data_dir), &settings)
        .map_err(|e| ApiError::LoadFailed {
            message: e.to_string(),
        })?;
    Ok(settings)
}

/// Descarga el catálogo (largo, no bloquea). Sin repo → `NoFeedRepo`.
/// En fallo de red se conserva la caché anterior.
#[tauri::command]
pub async fn refresh_catalog(
    state: State<'_, AppState>,
    app: tauri::AppHandle,
) -> Result<service::CatalogSummary, ApiError> {
    dlog!("[opendoc] refresh_catalog");
    let data_dir = data_dir_of(&app)?;
    let repo = state
        .settings
        .lock()
        .map_err(|e| ApiError::LoadFailed {
            message: e.to_string(),
        })?
        .feed_url
        .clone()
        .ok_or(ApiError::NoFeedRepo)?;
    let (catalog, skipped) = tauri::async_runtime::spawn_blocking(move || {
        service::refresh_catalog_data(&data_dir, &repo)
    })
    .await
    .map_err(|e| ApiError::LoadFailed {
        message: e.to_string(),
    })??;
    let summary = service::CatalogSummary {
        repo: catalog.repo.clone(),
        count: catalog.entries.len(),
        skipped,
        fetched_at: catalog.fetched_at,
    };
    let settings = state
        .settings
        .lock()
        .map(|mut guard| {
            guard.catalog_fetched_at = Some(catalog.fetched_at);
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
    Ok(summary)
}

/// Entradas en caché con búsqueda opcional (offline: sin red).
#[tauri::command]
pub fn list_catalog(
    app: tauri::AppHandle,
    query: Option<String>,
) -> Result<Vec<crate::catalog::FeedEntry>, ApiError> {
    let data_dir = data_dir_of(&app)?;
    Ok(service::list_catalog_entries(&data_dir, query.as_deref()))
}

/// Progreso de instalación para el evento `docset-progress` (F2, F3 lo
/// escucha con `listen`). Sin porcentajes: bytes y conteos reales.
#[derive(Debug, Clone, serde::Serialize)]
struct DocsetProgress {
    /// Id del feed que se instala.
    feed_id: String,
    /// Id del docset (solo en `done`, cuando ya se conoce).
    docset_id: Option<String>,
    /// Etapa (`downloading`/`extracting`/`verifying`/`done`/`error`).
    stage: ProgressStage,
    /// Bytes descargados (solo en `downloading`).
    received_bytes: u64,
    /// Total anunciado por el servidor, si lo hay.
    total_bytes: Option<u64>,
    /// Entradas del tar procesadas (solo en `extracting`).
    files: u64,
    /// Detalle (solo en `error`).
    message: Option<String>,
}

/// Etapa serializable del progreso (espejo de `docset::ProgressStage`
/// más los estados finales que emite el comando).
#[derive(Debug, Clone, Copy, serde::Serialize)]
#[serde(rename_all = "snake_case")]
enum ProgressStage {
    /// Descargando el `.tgz`.
    Downloading,
    /// Extrayendo el `.tgz` en temporal.
    Extracting,
    /// Validando layout e índice.
    Verifying,
    /// Instalado e integrado.
    Done,
    /// Fallo (ver `message`).
    Error,
}

/// Emite un informe de progreso de la instalación en curso.
fn emit_progress(
    app: &tauri::AppHandle,
    feed_id: &str,
    docset_id: Option<String>,
    report: crate::docset::ProgressReport,
) {
    crate::profile::note_event();
    let stage = match report.stage {
        crate::docset::ProgressStage::Downloading => ProgressStage::Downloading,
        crate::docset::ProgressStage::Extracting => ProgressStage::Extracting,
        crate::docset::ProgressStage::Verifying => ProgressStage::Verifying,
    };
    let _ = app.emit(
        "docset-progress",
        DocsetProgress {
            feed_id: feed_id.to_string(),
            docset_id,
            stage,
            received_bytes: report.received_bytes,
            total_bytes: report.total_bytes,
            files: report.files,
            message: None,
        },
    );
}

/// Instala un docset del catálogo (largo, no bloquea). Sin `force`, un
/// docset ya instalado o una coincidencia ambigua son error. El progreso
/// llega por el evento `docset-progress`. La instalación anterior se
/// conserva hasta que la nueva está validada.
#[tauri::command]
pub async fn install_docset(
    state: State<'_, AppState>,
    app: tauri::AppHandle,
    feed_id: String,
    force: Option<bool>,
) -> Result<service::InstallSummary, ApiError> {
    let force = force.unwrap_or(false);
    dlog!("[opendoc] install_docset <- {feed_id} force={force}");
    // FASE 0: solo medida (ningún cambio de lógica).
    let t_cmd = std::time::Instant::now();
    let data_dir = data_dir_of(&app)?;
    let (docsets_dir, fast_mirror) = state
        .settings
        .lock()
        .map_err(|e| ApiError::LoadFailed {
            message: e.to_string(),
        })
        .and_then(|settings| {
            settings
                .docsets_dir
                .clone()
                .map(|dir| (dir, settings.fast_mirror.clone()))
                .ok_or(ApiError::NoDocsetsDir { path: None })
        })?;
    let mut entry = service::resolve_install_entry(&data_dir, &feed_id)?;
    // El mirror que funcionó la última vez va primero (si sigue en lista).
    entry.urls = crate::docset::install::order_mirrors(&entry.urls, fast_mirror.as_deref());
    // Precondiciones con un lock breve (nada de red aquí dentro).
    let (old_ids, used_ids) = {
        let loaded = state.loaded.lock().map_err(|e| ApiError::LoadFailed {
            message: e.to_string(),
        })?;
        let old_ids = service::check_install_allowed(&loaded.docsets, &feed_id, force)?;
        let used_ids: HashSet<String> = loaded
            .docsets
            .iter()
            .map(|d| d.id.clone())
            .filter(|id| !old_ids.contains(id))
            .collect();
        (old_ids, used_ids)
    };
    {
        let mut installing = state.installing.lock().map_err(|e| ApiError::LoadFailed {
            message: e.to_string(),
        })?;
        if !installing.insert(feed_id.clone()) {
            return Err(ApiError::InstallInProgress { id: feed_id });
        }
    }
    // Tope global de instalaciones simultáneas (la cuenta incluye esta):
    // espera hueco sin bloquear el executor. Si falla, libera el guard
    // para no dejar el feed atascado.
    if let Err(e) = wait_install_slot(&state).await {
        remove_installing(&state, &feed_id);
        return Err(e);
    }
    // El cliente HTTP se construye DENTRO del hilo bloqueante: el
    // cliente `blocking` de reqwest crea un runtime tokio interno y
    // construirlo/dropearlo en el contexto async provoca un pánico
    // ("Cannot drop a runtime..."). F1 ya lo hace así y funciona.
    let app_task = app.clone();
    let feed_task = feed_id.clone();
    let dir_task = docsets_dir.clone();
    // Caché de iconos Devicon en datos de la app (best-effort).
    let devicon_task = data_dir.join("devicon-cache");
    crate::profile::mark(
        "install",
        format_args!(
            "feed={feed_id} queue_ms={} (click hasta inicio del trabajo)",
            crate::profile::ms_since(t_cmd)
        ),
    );
    let outcome = tauri::async_runtime::spawn_blocking(move || {
        let client = crate::catalog::feed::http_client().map_err(|e| {
            crate::docset::InstallError::DownloadFailed {
                id: feed_task.clone(),
                message: format!("no se pudo crear el cliente HTTP: {e}"),
            }
        })?;
        let emit = |report: crate::docset::ProgressReport| {
            emit_progress(&app_task, &feed_task, None, report);
        };
        crate::docset::download_and_install(
            &client,
            &entry,
            &dir_task,
            &devicon_task,
            &used_ids,
            crate::docset::TarixLimits::default(),
            &emit,
        )
    })
    .await;
    // El guard se libera SIEMPRE antes de interpretar el resultado,
    // también si el hilo muere (JoinError): si no, el feed quedaba
    // atascado en `InstallInProgress` para siempre.
    remove_installing(&state, &feed_id);
    let outcome = outcome.map_err(|e| ApiError::LoadFailed {
        message: e.to_string(),
    })?;
    let installed = match outcome {
        Ok(installed) => installed,
        Err(error) => {
            let message = error.to_string();
            dlog!("[opendoc] install_docset <- {feed_id} ERROR {message}");
            crate::profile::note_event();
            crate::profile::mark(
                "install",
                format_args!(
                    "feed={feed_id} resultado=error total_ms={} eventos={} error={message}",
                    crate::profile::ms_since(t_cmd),
                    crate::profile::take_events()
                ),
            );
            let _ = app.emit(
                "docset-progress",
                DocsetProgress {
                    feed_id: feed_id.clone(),
                    docset_id: None,
                    stage: ProgressStage::Error,
                    received_bytes: 0,
                    total_bytes: None,
                    files: 0,
                    message: Some(message),
                },
            );
            return Err(ApiError::from(error));
        }
    };
    let docset_id = installed.docset.id.clone();
    // El respaldo `.old` ya no protege nada (la nueva versión está viva):
    // se borra en fondo, fuera del camino crítico. Si la app se cierra
    // antes, el sweep o la próxima instalación lo recogen.
    if let Some(old) = installed.stale_backup.clone() {
        dlog!("[opendoc] install_docset <- {feed_id} borrando respaldo en fondo");
        std::thread::spawn(move || {
            let _ = std::fs::remove_dir_all(&old);
        });
    }
    // Recuerda el mirror que funcionó (best-effort: nunca tumba el éxito).
    if let Some(host) = installed
        .source_url
        .as_deref()
        .and_then(crate::docset::install::url_host)
    {
        if let Ok(mut guard) = state.settings.lock() {
            if guard.fast_mirror.as_deref() != Some(host.as_str()) {
                guard.fast_mirror = Some(host);
                let path = crate::settings::settings_file(&data_dir);
                let _ = crate::settings::save_if_changed(&path, &guard);
            }
        }
    }
    // FASE 0: se mide espera del lock + integración (sin cambiar el orden).
    let t_merge = std::time::Instant::now();
    let summary = {
        let mut loaded = state.loaded.lock().map_err(|e| ApiError::LoadFailed {
            message: e.to_string(),
        })?;
        if loaded.source_dir == docsets_dir || loaded.source_dir.as_os_str().is_empty() {
            service::apply_replaced(&mut loaded, &feed_id, &old_ids, installed)
        } else {
            // La carpeta cambió durante la instalación: el docset quedó
            // en disco y la próxima carga lo recogerá.
            service::summarize_install(&feed_id, &installed, &old_ids)
        }
    };
    crate::profile::mark(
        "install",
        format_args!(
            "feed={feed_id} merge_ms={} (lock+integración) entries={}",
            crate::profile::ms_since(t_merge),
            summary.entries
        ),
    );
    crate::profile::note_event();
    let _ = app.emit(
        "docset-progress",
        DocsetProgress {
            feed_id: feed_id.clone(),
            docset_id: Some(docset_id),
            stage: ProgressStage::Done,
            received_bytes: 0,
            total_bytes: None,
            files: 0,
            message: None,
        },
    );
    dlog!("[opendoc] install_docset -> {feed_id} ok");
    crate::profile::mark(
        "install",
        format_args!(
            "feed={feed_id} resultado=ok total_ms={} eventos={}",
            crate::profile::ms_since(t_cmd),
            crate::profile::take_events()
        ),
    );
    Ok(summary)
}

/// Estado de los feeds frente a los instalados (offline: caché F2).
/// Con `feed_id` devuelve solo esa entrada o `UnknownFeed`.
#[tauri::command]
pub fn get_install_status(
    state: State<'_, AppState>,
    app: tauri::AppHandle,
    feed_id: Option<String>,
) -> Result<Vec<service::InstallStatus>, ApiError> {
    let data_dir = data_dir_of(&app)?;
    let loaded = state.loaded.lock().map_err(|e| ApiError::LoadFailed {
        message: e.to_string(),
    })?;
    service::install_status_for(&data_dir, &loaded.docsets, feed_id.as_deref())
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

/// Tipos con conteo de un docset, en orden de muestra (navegación v0.2).
#[tauri::command]
pub fn list_kinds(
    state: State<'_, AppState>,
    docset_id: String,
) -> Result<Vec<crate::browse::KindInfo>, ApiError> {
    let res = state
        .loaded
        .lock()
        .map_err(|e| ApiError::LoadFailed {
            message: e.to_string(),
        })
        .and_then(|loaded| service::browse_kinds(&loaded, &docset_id));
    match &res {
        Ok(kinds) => dlog!("[opendoc] kinds {docset_id} -> {} tipos", kinds.len()),
        Err(e) => dlog!("[opendoc] kinds {docset_id} -> ERROR {e}"),
    }
    res
}

/// Página de entradas de un tipo (navegación v0.2). `offset`/`limit`
/// opcionales (defecto 0/100, tope 500).
#[tauri::command]
pub fn list_entries(
    state: State<'_, AppState>,
    docset_id: String,
    kind: String,
    offset: Option<usize>,
    limit: Option<usize>,
) -> Result<Vec<crate::browse::NavEntry>, ApiError> {
    let res = state
        .loaded
        .lock()
        .map_err(|e| ApiError::LoadFailed {
            message: e.to_string(),
        })
        .and_then(|loaded| service::browse_entries(&loaded, &docset_id, &kind, offset, limit));
    match &res {
        Ok(entries) => dlog!(
            "[opendoc] entries {docset_id}/{kind} -> {} entradas",
            entries.len()
        ),
        Err(e) => dlog!("[opendoc] entries {docset_id}/{kind} -> ERROR {e}"),
    }
    res
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

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn install_slot_caps_concurrent_installs() {
        assert!(install_slot_free(0));
        assert!(install_slot_free(1));
        assert!(install_slot_free(MAX_CONCURRENT_INSTALLS));
        assert!(!install_slot_free(MAX_CONCURRENT_INSTALLS + 1));
    }
}
