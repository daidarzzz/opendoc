//! Lógica de los comandos Tauri como funciones puras y testeables (T6).
//!
//! Sin tipos de Tauri aquí: los `#[tauri::command]` de `mod.rs` solo
//! delegan. La carga pesada (escaneo + lectura de índices) corre en
//! `spawn_blocking` desde el comando async.

use std::path::Path;

use serde::{Deserialize, Serialize};

use crate::browse::{KindInfo, NavEntry, DEFAULT_BROWSE_LIMIT, MAX_BROWSE_LIMIT};
use crate::catalog::feed::{fetch_catalog, http_client, normalize_repo, FeedEntry};
use crate::catalog::{catalog_file, load_catalog, now_epoch, save_catalog, Catalog};
use crate::docset::devicon::icon_for_folder;
use crate::docset::folder_stem;
use crate::docset::{
    apply_to_docset, match_feed, read_index, read_info_plist, scan_dir, update_available, Docset,
    Entry, FeedMatch, IssueKind, PendingTarix, ScanIssue, ScanReport, TarixLimits,
};
use crate::search::{parse_query, search as search_index, SearchIndex, SearchResult};

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
    /// Filtros del texto (`cpp:`) resueltos, en orden de escritura.
    pub applied: Vec<AppliedFilter>,
    /// Claves del texto que no resolvieron a ningún docset.
    pub unknown: Vec<String>,
}

/// Un filtro de texto resuelto a un docset (para pintar el chip).
#[derive(Debug, Clone, PartialEq, Eq, Serialize)]
pub struct AppliedFilter {
    /// Clave tal como se escribió (`cpp`).
    pub token: String,
    /// Id del docset.
    pub docset_id: String,
    /// `false` si es un tarix pendiente (chip "(sin instalar)", excluido).
    pub installed: bool,
}

/// Opciones de carga (la caché vive fuera de la carpeta del usuario).
pub struct LoadOptions {
    /// Base de `tarix-cache/<id>/` (datos de la app en producción).
    pub cache_base: std::path::PathBuf,
    /// Base de `devicon-cache/<nombre>.svg` (datos de la app; solo
    /// lectura en carga, sin red).
    pub devicon_base: std::path::PathBuf,
    /// Si es `false` solo se reutilizan cachés existentes (arranque rápido);
    /// si es `true` se extrae lo que falte (carga explícita, lenta la
    /// primera vez pero sin bloquear la UI: corre en `spawn_blocking`).
    pub extract_missing: bool,
}

/// Carga una carpeta de docsets: escanea, lee índices, instala tarix según
/// opciones y construye el índice en memoria. Solo los docsets abribles
/// entran en la búsqueda; el resto queda en `issues`/`pending` sin tumbarla.
pub fn load_docsets_dir(dir: &Path, opts: &LoadOptions) -> Result<Loaded, ApiError> {
    // FASE 0: solo medida (escaneo + índices + índice en memoria).
    let t_load = std::time::Instant::now();
    if !dir.is_dir() {
        return Err(ApiError::InvalidDir {
            path: dir.display().to_string(),
        });
    }
    let report = scan_dir(dir).map_err(|e| ApiError::InvalidDir {
        path: format!("{}: {e}", dir.display()),
    })?;
    // FASE 0: solo medida (escaneo de carpetas, sin índices aún).
    crate::profile::mark(
        "load",
        format_args!(
            "scan dir={} docsets={} pending={} issues={} ms={}",
            dir.display(),
            report.docsets.len(),
            report.pending_tarix.len(),
            report.issues.len(),
            crate::profile::ms_since(t_load)
        ),
    );
    let mut entries: Vec<Entry> = Vec::new();
    let mut issues = report.issues;
    let mut docsets = report.docsets;
    // Entradas que el escáner ya leyó (fallback de home, F1): se
    // reutilizan sin reabrir esos índices.
    let mut scanned: std::collections::HashMap<String, Vec<Entry>> =
        std::collections::HashMap::new();
    for entry in report.index_entries {
        scanned
            .entry(entry.docset_id.clone())
            .or_default()
            .push(entry);
    }
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
    // C7: las cachés que nadie referencia (docset borrado o convertido
    // a clásico) se barren; las pendientes e instaladas se conservan.
    {
        let mut referenced: std::collections::HashSet<String> =
            pending.iter().map(|p| p.id.clone()).collect();
        for docset in &docsets {
            if let Ok(rel) = docset.contents_path.strip_prefix(&opts.cache_base) {
                if let Some(id) = rel.components().next() {
                    referenced.insert(id.as_os_str().to_string_lossy().into_owned());
                }
            }
        }
        crate::docset::tarix::sweep_unreferenced_caches(&opts.cache_base, &referenced);
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
        // F1: el escáner ya abrió este índice para el home → se reutiliza
        // sin releer. Si el escáner lo intentó y falló, el issue ya está
        // registrado y no se reintenta. Solo se abre aquí si el escáner
        // no lo necesitó (home conocido por plist/index.html).
        if let Some(known) = scanned.remove(&docset.id) {
            entries.extend(known);
            continue;
        }
        if has_issue(&issues, &docset.root_path, &IssueKind::InvalidIndex) {
            continue;
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
    // Fallback Devicon (solo lectura de caché local, sin red): los
    // docsets sin icono propio resuelven por nombre de carpeta.
    apply_devicon_fallback(&mut docsets, &opts.devicon_base);
    // FASE 0: solo medida.
    crate::profile::mark(
        "load",
        format_args!(
            "dir={} docsets={} pending={} issues={} ms={}",
            dir.display(),
            docsets.len(),
            pending.len(),
            issues.len(),
            crate::profile::ms_since(t_load)
        ),
    );
    Ok(Loaded {
        source_dir: dir.to_path_buf(),
        docsets,
        pending,
        issues,
        index: SearchIndex::build(entries),
    })
}

/// Rellena el icono de los docsets que no traen propio con la caché
/// Devicon local (por stem de carpeta). No toca los que ya tienen, no
/// descarga nada y nunca falla.
pub fn apply_devicon_fallback(docsets: &mut [Docset], devicon_base: &Path) {
    for docset in docsets.iter_mut() {
        if docset.icon.is_some() {
            continue;
        }
        let Some(stem) = folder_stem(&docset.root_path) else {
            continue;
        };
        docset.icon = icon_for_folder(devicon_base, &stem);
    }
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
        icon: pending.icon.clone(),
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

/// Busca en lo cargado. El texto crudo puede traer filtros (`cpp:…`):
/// se resuelven, se intersectan con `docset_ids` explícitos y viajan en
/// la respuesta para los chips. Nunca falla: sin coincidencias, vacío.
pub fn search_loaded(loaded: &mut Loaded, req: &SearchRequest) -> SearchResponse {
    let resolved = resolve_query(loaded, &req.query, req.docset_ids.as_deref());
    let limit = req.limit.unwrap_or(DEFAULT_LIMIT).clamp(1, MAX_LIMIT);
    let results = search_index(
        &mut loaded.index,
        &resolved.query,
        resolved.ids.as_deref(),
        limit,
    );
    SearchResponse {
        request_id: req.request_id,
        results,
        applied: resolved.applied,
        unknown: resolved.unknown,
    }
}

/// Consulta resuelta: texto efectivo + filtros + ids instalados a buscar.
struct ResolvedQuery {
    /// Texto sin el prefijo de filtros (o el crudo si nada resolvió).
    query: String,
    /// Filtros resueltos en orden (instalados y pendientes).
    applied: Vec<AppliedFilter>,
    /// Claves sin docset (vacío si nada resolvió: búsqueda normal).
    unknown: Vec<String>,
    /// Ids instalados a buscar (`None` = sin restricción).
    ids: Option<Vec<String>>,
}

/// Resuelve los filtros del texto contra cargados y pendientes.
/// Niveles por token (primero que case gana): platform
/// (`DocSetPlatformFamily`), nombre en minúsculas (conserva `+`, así
/// `c++` funciona), y slug SOLO si los dos anteriores no dieron nada para
/// ese token (el slug de C++ es `c`: `c:` no lo activa si hay familia `c`).
/// Si NINGUNO resuelve, el texto completo es búsqueda normal sin chips.
fn resolve_query(loaded: &Loaded, raw: &str, explicit: Option<&[String]>) -> ResolvedQuery {
    let parsed = parse_query(raw);
    if parsed.filters.is_empty() {
        return ResolvedQuery {
            query: parsed.query,
            applied: Vec::new(),
            unknown: Vec::new(),
            ids: explicit.map(<[String]>::to_vec),
        };
    }
    let mut applied: Vec<AppliedFilter> = Vec::new();
    let mut unknown: Vec<String> = Vec::new();
    for token in &parsed.filters {
        match resolve_token(&loaded.docsets, &loaded.pending, token) {
            Some((docset_id, installed)) => {
                if !applied.iter().any(|a| a.docset_id == docset_id) {
                    applied.push(AppliedFilter {
                        token: token.clone(),
                        docset_id,
                        installed,
                    });
                }
            }
            None => {
                if !unknown.contains(token) {
                    unknown.push(token.clone());
                }
            }
        }
    }
    if applied.is_empty() {
        return ResolvedQuery {
            query: raw.trim().to_string(),
            applied: Vec::new(),
            unknown: Vec::new(),
            ids: explicit.map(<[String]>::to_vec),
        };
    }
    let mut ids: Vec<String> = applied
        .iter()
        .filter(|a| a.installed)
        .map(|a| a.docset_id.clone())
        .collect();
    if let Some(explicit) = explicit {
        ids.retain(|id| explicit.contains(id));
    }
    ResolvedQuery {
        query: parsed.query,
        applied,
        unknown,
        ids: Some(ids),
    }
}

/// Resuelve un token a (id, instalado) o `None`.
fn resolve_token(
    docsets: &[Docset],
    pending: &[PendingTarix],
    token: &str,
) -> Option<(String, bool)> {
    // Nivel 1: platform (familia del Info.plist).
    if let Some(d) = docsets
        .iter()
        .find(|d| d.platform.as_deref().map(str::to_lowercase).as_deref() == Some(token))
    {
        return Some((d.id.clone(), true));
    }
    // Nivel 2: nombre en minúsculas (con `+`: `c++` vale).
    if let Some(d) = docsets.iter().find(|d| d.name.to_lowercase() == token) {
        return Some((d.id.clone(), true));
    }
    if let Some(p) = pending.iter().find(|p| p.name.to_lowercase() == token) {
        return Some((p.id.clone(), false));
    }
    // Nivel 3: slug, solo si 1-2 fallaron para este token.
    if let Some(d) = docsets.iter().find(|d| d.id == token) {
        return Some((d.id.clone(), true));
    }
    if let Some(p) = pending.iter().find(|p| p.id == token) {
        return Some((p.id.clone(), false));
    }
    None
}

/// Tipos con conteo de un docset, en orden de muestra. Docset
/// desconocido → `UnknownDocset`; sin entradas → vacío (no error).
pub fn browse_kinds(loaded: &Loaded, docset_id: &str) -> Result<Vec<KindInfo>, ApiError> {
    find_docset(&loaded.docsets, docset_id)?;
    Ok(loaded.index.browse_kinds(docset_id))
}

/// Página de entradas de un tipo (`limit` con tope 500). Tipo
/// inexistente → vacío; docset desconocido → `UnknownDocset`.
pub fn browse_entries(
    loaded: &Loaded,
    docset_id: &str,
    kind: &str,
    offset: Option<usize>,
    limit: Option<usize>,
) -> Result<Vec<NavEntry>, ApiError> {
    find_docset(&loaded.docsets, docset_id)?;
    let offset = offset.unwrap_or(0);
    let limit = limit
        .unwrap_or(DEFAULT_BROWSE_LIMIT)
        .clamp(1, MAX_BROWSE_LIMIT);
    Ok(loaded.index.browse_entries(docset_id, kind, offset, limit))
}

/// Docset por id o `UnknownDocset`.
fn find_docset<'a>(docsets: &'a [Docset], docset_id: &str) -> Result<&'a Docset, ApiError> {
    docsets
        .iter()
        .find(|d| d.id == docset_id)
        .ok_or_else(|| ApiError::UnknownDocset {
            id: docset_id.to_string(),
        })
}

/// Estado del catálogo para la UI (repo, última descarga, entradas).
#[derive(Debug, Clone, Serialize)]
pub struct CatalogStatus {
    /// Repo configurado (`owner/name`).
    pub repo: Option<String>,
    /// Epoch de la última descarga.
    pub fetched_at: Option<u64>,
    /// Entradas en caché (0 sin caché).
    pub count: usize,
    /// Profiling FASE 0 activo (`OPENDOC_PROFILE=1` al arrancar).
    pub profile_enabled: bool,
}

/// Resumen tras refrescar el catálogo.
#[derive(Debug, Clone, Serialize)]
pub struct CatalogSummary {
    /// Repo normalizado descargado.
    pub repo: String,
    /// Entradas guardadas.
    pub count: usize,
    /// XML saltados (ilegibles o sin versión/URLs).
    pub skipped: usize,
    /// Epoch de la descarga.
    pub fetched_at: u64,
}

/// Lee el estado sin red (caché local; offline funciona).
pub fn catalog_status(settings: &crate::settings::Settings, data_dir: &Path) -> CatalogStatus {
    let cached = load_catalog(&catalog_file(data_dir));
    CatalogStatus {
        repo: settings.feed_url.clone(),
        fetched_at: settings.catalog_fetched_at,
        count: cached.map(|c| c.entries.len()).unwrap_or(0),
        profile_enabled: crate::profile::enabled(),
    }
}

/// Entradas en caché con filtro opcional por nombre (insensible a caso).
/// Sin caché → vacío (no error).
pub fn list_catalog_entries(data_dir: &Path, query: Option<&str>) -> Vec<FeedEntry> {
    let mut entries = load_catalog(&catalog_file(data_dir))
        .map(|c| c.entries)
        .unwrap_or_default();
    if let Some(q) = query.map(str::trim).filter(|q| !q.is_empty()) {
        let lower = q.to_lowercase();
        entries.retain(|e| e.name.to_lowercase().contains(&lower));
    }
    entries
}

/// Descarga y guarda el catálogo (lento: solo desde `spawn_blocking`).
/// No toca ajustes: el comando actualiza `catalog_fetched_at` al guardar.
pub fn refresh_catalog_data(data_dir: &Path, repo_raw: &str) -> Result<(Catalog, usize), ApiError> {
    let repo = normalize_repo(repo_raw).map_err(|e| ApiError::FeedFailed {
        message: e.to_string(),
    })?;
    let client = http_client().map_err(|e| ApiError::FeedFailed {
        message: e.to_string(),
    })?;
    let (entries, skipped) = fetch_catalog(&client, &repo).map_err(|e| ApiError::FeedFailed {
        message: e.to_string(),
    })?;
    let catalog = Catalog {
        repo: repo.path(),
        fetched_at: now_epoch(),
        entries,
    };
    save_catalog(&catalog_file(data_dir), &catalog).map_err(|e| ApiError::FeedFailed {
        message: e.to_string(),
    })?;
    Ok((catalog, skipped))
}

/// Estado de un feed frente a los docsets instalados (F2, offline).
#[derive(Debug, Clone, Serialize)]
pub struct InstallStatus {
    /// Id del feed (stem del XML).
    pub feed_id: String,
    /// Nombre visible del feed.
    pub name: String,
    /// `true` si hay exactamente una carpeta instalada.
    pub installed: bool,
    /// Id del docset instalado (`None` si no hay o hay ambigüedad).
    pub docset_id: Option<String>,
    /// Versión del instalado (`None` si no hay o el plist no la trae).
    pub installed_version: Option<String>,
    /// Versión disponible en el catálogo.
    pub available_version: String,
    /// `Some(true)` si la disponible es más reciente, `Some(false)` si
    /// son iguales o la instalada es más reciente, `None` si no se
    /// puede comparar con seguridad (instalada desconocida o versiones
    /// no numéricas).
    pub update_available: Option<bool>,
    /// `true` si varias carpetas coinciden (no se eligió ninguna).
    pub ambiguous: bool,
    /// Ids candidatos cuando hay ambigüedad.
    pub ambiguous_ids: Vec<String>,
}

/// Resumen tras instalar un docset.
#[derive(Debug, Clone, Serialize)]
pub struct InstallSummary {
    /// Id del feed instalado.
    pub feed_id: String,
    /// Id asignado al docset (algoritmo del escáner).
    pub docset_id: String,
    /// Nombre del docset (del plist o del feed).
    pub name: String,
    /// Versión del instalado, si el plist la trae.
    pub version: Option<String>,
    /// Entradas indexadas del nuevo docset.
    pub entries: usize,
    /// `true` si sustituyó una instalación previa.
    pub reinstalled: bool,
}

/// Calcula el estado de los feeds (caché local, sin red). Con
/// `feed_id` devuelve solo esa entrada o `UnknownFeed`.
pub fn install_status_for(
    data_dir: &Path,
    docsets: &[Docset],
    feed_id: Option<&str>,
) -> Result<Vec<InstallStatus>, ApiError> {
    let catalog = load_catalog(&catalog_file(data_dir)).ok_or(ApiError::CatalogMissing)?;
    if let Some(wanted) = feed_id {
        if !catalog.entries.iter().any(|e| e.id == wanted) {
            return Err(ApiError::UnknownFeed {
                id: wanted.to_string(),
            });
        }
    }
    let mut statuses = Vec::new();
    for entry in &catalog.entries {
        if feed_id.is_some_and(|wanted| entry.id != wanted) {
            continue;
        }
        statuses.push(match match_feed(&entry.id, docsets) {
            FeedMatch::None => InstallStatus {
                feed_id: entry.id.clone(),
                name: entry.name.clone(),
                installed: false,
                docset_id: None,
                installed_version: None,
                available_version: entry.version.clone(),
                update_available: Some(false),
                ambiguous: false,
                ambiguous_ids: Vec::new(),
            },
            FeedMatch::One(docset) => InstallStatus {
                feed_id: entry.id.clone(),
                name: entry.name.clone(),
                installed: true,
                docset_id: Some(docset.id.clone()),
                installed_version: docset.version.clone(),
                available_version: entry.version.clone(),
                update_available: update_available(docset.version.as_deref(), &entry.version),
                ambiguous: false,
                ambiguous_ids: Vec::new(),
            },
            FeedMatch::Ambiguous(candidates) => InstallStatus {
                feed_id: entry.id.clone(),
                name: entry.name.clone(),
                installed: false,
                docset_id: None,
                installed_version: None,
                available_version: entry.version.clone(),
                update_available: None,
                ambiguous: true,
                ambiguous_ids: candidates.iter().map(|d| d.id.clone()).collect(),
            },
        });
    }
    Ok(statuses)
}

/// Entrada del catálogo para instalar (caché local, sin red).
pub fn resolve_install_entry(data_dir: &Path, feed_id: &str) -> Result<FeedEntry, ApiError> {
    let catalog = load_catalog(&catalog_file(data_dir)).ok_or(ApiError::CatalogMissing)?;
    catalog
        .entries
        .into_iter()
        .find(|e| e.id == feed_id)
        .ok_or_else(|| ApiError::UnknownFeed {
            id: feed_id.to_string(),
        })
}

/// Comprueba si se puede instalar: sin `force`, un instalado o una
/// ambigüedad son error. Devuelve los ids a sustituir tras instalar.
pub fn check_install_allowed(
    docsets: &[Docset],
    feed_id: &str,
    force: bool,
) -> Result<Vec<String>, ApiError> {
    match match_feed(feed_id, docsets) {
        FeedMatch::None => Ok(Vec::new()),
        FeedMatch::One(docset) if force => Ok(vec![docset.id.clone()]),
        FeedMatch::One(_) => Err(ApiError::AlreadyInstalled {
            id: feed_id.to_string(),
        }),
        FeedMatch::Ambiguous(candidates) if force => {
            Ok(candidates.iter().map(|d| d.id.clone()).collect())
        }
        FeedMatch::Ambiguous(candidates) => Err(ApiError::AmbiguousMatch {
            id: feed_id.to_string(),
            candidates: candidates.iter().map(|d| d.id.clone()).collect(),
        }),
    }
}

/// Resumen sin mutar (cuando la carpeta cambió durante la instalación).
pub fn summarize_install(
    feed_id: &str,
    installed: &crate::docset::InstalledDocset,
    old_ids: &[String],
) -> InstallSummary {
    InstallSummary {
        feed_id: feed_id.to_string(),
        docset_id: installed.docset.id.clone(),
        name: installed.docset.name.clone(),
        version: installed.docset.version.clone(),
        entries: installed.entries.len(),
        reinstalled: !old_ids.is_empty(),
    }
}

/// Integra un docset recién instalado: quita los sustituidos (docsets +
/// sus entradas del índice) e incorpora el nuevo con orden determinista.
/// Además de `old_ids`, se quita cualquier docset con el mismo id o la
/// misma carpeta (la carga pudo cambiar durante la descarga).
pub fn apply_replaced(
    loaded: &mut Loaded,
    feed_id: &str,
    old_ids: &[String],
    installed: crate::docset::InstalledDocset,
) -> InstallSummary {
    let summary = summarize_install(feed_id, &installed, old_ids);
    let new_id = installed.docset.id.clone();
    let new_root = installed.docset.root_path.clone();
    let dropped: Vec<String> = loaded
        .docsets
        .iter()
        .filter(|d| old_ids.contains(&d.id) || d.id == new_id || d.root_path == new_root)
        .map(|d| d.id.clone())
        .collect();
    loaded.docsets.retain(|d| !dropped.contains(&d.id));
    // F1: una sola reconstrucción (mismo estado final que N removes +
    // un extend: el intermedio no era observable bajo el lock).
    loaded.index.replace_docset(&dropped, installed.entries);
    loaded.docsets.push(installed.docset);
    loaded.docsets.sort_by(|a, b| {
        a.name
            .to_lowercase()
            .cmp(&b.name.to_lowercase())
            .then_with(|| a.name.cmp(&b.name))
    });
    summary
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
        // Las entradas viven en el índice en memoria, no viajan al
        // frontend (el informe solo lleva docsets/pendientes/issues).
        index_entries: Vec::new(),
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
            devicon_base: dir.path().join("devicon-cache"),
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
        // CSS y Swift son abribles; C++ y Python_3 quedan pendientes (no issues).
        let mut ids: Vec<&str> = loaded.docsets.iter().map(|d| d.id.as_str()).collect();
        ids.sort_unstable();
        assert_eq!(ids, vec!["css", "swift"]);
        assert_eq!(loaded.index.len(), 1249 + 9467);
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
                docset_ids: Some(vec!["css".to_string()]),
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
            icon: None,
            root_path: PathBuf::from("x"),
            contents_path: PathBuf::from("x/Contents"),
        }];
        let err = docset_home_url(&docsets, "sinhome").expect_err("sin home");
        assert!(matches!(err, ApiError::NoHomePage { .. }));
    }

    /// `Loaded` mínimo con un docset y tres entradas (dos tipos).
    fn loaded_with_entries() -> Loaded {
        use crate::search::SearchIndex;
        let docset = Docset {
            id: "d".to_string(),
            name: "D".to_string(),
            platform: None,
            version: None,
            bundle_id: None,
            home_path: Some("home.html".to_string()),
            icon: None,
            root_path: PathBuf::from("x"),
            contents_path: PathBuf::from("x/Contents"),
        };
        let index = SearchIndex::build(vec![
            Entry {
                docset_id: "d".to_string(),
                name: "b".to_string(),
                kind: "Method".to_string(),
                path: "b.html".to_string(),
            },
            Entry {
                docset_id: "d".to_string(),
                name: "a".to_string(),
                kind: "Method".to_string(),
                path: "a.html".to_string(),
            },
            Entry {
                docset_id: "d".to_string(),
                name: "g".to_string(),
                kind: "Guide".to_string(),
                path: "g.html".to_string(),
            },
        ]);
        Loaded {
            source_dir: PathBuf::from("x"),
            docsets: vec![docset],
            pending: Vec::new(),
            issues: Vec::new(),
            index,
        }
    }

    #[test]
    fn browse_kinds_counts_and_unknown_docset() {
        let loaded = loaded_with_entries();
        let kinds = browse_kinds(&loaded, "d").expect("tipos");
        assert_eq!(kinds.len(), 2);
        assert_eq!(kinds[0].kind, "Method");
        assert_eq!(kinds[0].label, "Methods");
        assert_eq!(kinds[0].count, 2);
        assert_eq!(kinds[1].kind, "Guide");
        assert_eq!(kinds[1].count, 1);
        let err = browse_kinds(&loaded, "nope").expect_err("desconocido");
        assert!(matches!(err, ApiError::UnknownDocset { .. }));
    }

    #[test]
    fn browse_entries_pages_and_clamps() {
        let loaded = loaded_with_entries();
        // Orden plegado: a, b.
        let page = browse_entries(&loaded, "d", "Method", Some(0), Some(1)).expect("página");
        assert_eq!(page.len(), 1);
        assert_eq!(page[0].name, "a");
        assert_eq!(page[0].url, "opendoc://d/a.html");
        let rest = browse_entries(&loaded, "d", "Method", Some(1), None).expect("resto");
        assert_eq!(rest.len(), 1);
        assert_eq!(rest[0].name, "b");
        // Tipo inexistente → vacío; docset inexistente → error.
        let empty = browse_entries(&loaded, "d", "Clase", None, None).expect("vacío");
        assert!(empty.is_empty());
        let err = browse_entries(&loaded, "nope", "Method", None, None).expect_err("desconocido");
        assert!(matches!(err, ApiError::UnknownDocset { .. }));
        // El tope se aplica (500 aunque se pidan más).
        let many = browse_entries(&loaded, "d", "Method", None, Some(9999)).expect("tope");
        assert_eq!(many.len(), 2);
    }

    /// `Loaded` con conflicto de claves: A con familia `c`, B sin
    /// familia y un pendiente `C++` con slug `c`.
    fn loaded_for_filters() -> Loaded {
        use crate::search::SearchIndex;
        let docset = |id: &str, name: &str, platform: Option<&str>| Docset {
            id: id.to_string(),
            name: name.to_string(),
            platform: platform.map(str::to_string),
            version: None,
            bundle_id: None,
            home_path: None,
            icon: None,
            root_path: PathBuf::from("x"),
            contents_path: PathBuf::from("x/Contents"),
        };
        Loaded {
            source_dir: PathBuf::from("x"),
            docsets: vec![docset("a", "Alpha", Some("c")), docset("b", "Beta", None)],
            pending: vec![PendingTarix {
                id: "c".to_string(),
                name: "C++".to_string(),
                icon: None,
                root_path: PathBuf::from("x"),
            }],
            issues: Vec::new(),
            index: SearchIndex::new(),
        }
    }

    #[test]
    fn filter_levels_platform_name_then_slug() {
        let loaded = loaded_for_filters();
        // Nivel 1: familia gana al slug del pendiente (`c:` → A, no C++).
        let (id, installed) =
            super::resolve_token(&loaded.docsets, &loaded.pending, "c").expect("familia c");
        assert_eq!(id, "a");
        assert!(installed);
        // Nivel 2: nombre (`beta`, `c++` pendiente sin instalar).
        let (id, installed) =
            super::resolve_token(&loaded.docsets, &loaded.pending, "beta").expect("nombre");
        assert_eq!(id, "b");
        assert!(installed);
        let (id, installed) =
            super::resolve_token(&loaded.docsets, &loaded.pending, "c++").expect("pendiente");
        assert_eq!(id, "c");
        assert!(!installed);
        // Nivel 3: slug solo si 1-2 fallan (`b` no es familia ni nombre).
        let (id, _) = super::resolve_token(&loaded.docsets, &loaded.pending, "b").expect("slug");
        assert_eq!(id, "b");
        assert!(super::resolve_token(&loaded.docsets, &loaded.pending, "zzz").is_none());
    }

    #[test]
    fn resolve_query_partial_and_fallback() {
        let loaded = loaded_for_filters();
        // Parcial: resueltas con chip, desconocidas aparte.
        let r = super::resolve_query(&loaded, "a,zzz:x", None);
        assert_eq!(r.query, "x");
        assert_eq!(r.applied.len(), 1);
        assert_eq!(r.applied[0].docset_id, "a");
        assert_eq!(r.unknown, vec!["zzz"]);
        assert_eq!(r.ids, Some(vec!["a".to_string()]));
        // Pendiente: chip sin instalar, fuera de la búsqueda.
        let r = super::resolve_query(&loaded, "c++:x", None);
        assert_eq!(r.applied.len(), 1);
        assert!(!r.applied[0].installed);
        assert_eq!(r.ids, Some(vec![]));
        // Nada resuelve: texto completo como búsqueda normal, sin chips.
        let r = super::resolve_query(&loaded, "zzz:x", None);
        assert_eq!(r.query, "zzz:x");
        assert!(r.applied.is_empty());
        assert!(r.unknown.is_empty());
        assert_eq!(r.ids, None);
        // Intersección con explícitos.
        let r = super::resolve_query(&loaded, "a,b:x", Some(&["b".to_string()]));
        assert_eq!(r.ids, Some(vec!["b".to_string()]));
        // La cola con `:` llega íntegra al último segmento de T5.
        let r = super::resolve_query(&loaded, "a:std::vector", None);
        assert_eq!(r.query, "std::vector");
    }

    #[test]
    fn prefix_filter_costs_like_plain_search() {
        use crate::search::index::entry;
        use crate::search::SearchIndex;
        use std::time::Instant;
        // 4 docsets x 25k entradas con familias f1..f4.
        let mut docsets = Vec::new();
        let mut raw = Vec::with_capacity(100_000);
        for d in 0..4 {
            let id = format!("ds{d}");
            docsets.push(Docset {
                id: id.clone(),
                name: format!("Doc{d}"),
                platform: Some(format!("f{}", d + 1)),
                version: None,
                bundle_id: None,
                home_path: None,
                icon: None,
                root_path: PathBuf::from("x"),
                contents_path: PathBuf::from("x/Contents"),
            });
            for i in 0..25_000_u32 {
                raw.push(entry(&id, &format!("item_{i:05}"), "Function"));
            }
        }
        let mut loaded = Loaded {
            source_dir: PathBuf::from("x"),
            docsets,
            pending: Vec::new(),
            issues: Vec::new(),
            index: SearchIndex::build(raw),
        };
        let run = |loaded: &mut Loaded, query: &str, limit: usize| {
            let start = Instant::now();
            let res = search_loaded(
                loaded,
                &SearchRequest {
                    request_id: 1,
                    query: query.to_string(),
                    docset_ids: None,
                    limit: Some(limit),
                },
            );
            (res, start.elapsed())
        };
        let (plain, plain_t) = run(&mut loaded, "item_001", 500);
        let (pref, pref_t) = run(&mut loaded, "f1:item_001", 20);
        eprintln!("100k: plana={plain_t:?} con prefijo={pref_t:?}");
        assert!(!pref.results.is_empty());
        assert!(pref.results.iter().all(|r| r.docset_id == "ds0"));
        assert_eq!(pref.applied.len(), 1);
        assert_eq!(pref.applied[0].token, "f1");
        assert!(pref.unknown.is_empty());
        // El prefijo solo recorta: mismos 20 primeros que la plana
        // filtrada a ese docset (mismo orden).
        let plain_names: Vec<&str> = plain
            .results
            .iter()
            .filter(|r| r.docset_id == "ds0")
            .take(20)
            .map(|r| r.name.as_str())
            .collect();
        let pref_names: Vec<&str> = pref.results.iter().map(|r| r.name.as_str()).collect();
        assert_eq!(pref_names, plain_names);
        // Cota amplia (debug es lento): el filtro no debe multiplicar el coste.
        assert!(
            pref_t.as_secs() < 5,
            "búsqueda con prefijo lenta: {pref_t:?} (plana: {plain_t:?})"
        );
    }

    #[test]
    fn docset_url_keeps_anchor() {
        assert_eq!(
            docset_url("css", "a/b.html#frag"),
            "opendoc://css/a/b.html#frag"
        );
    }

    /// Caché sintética en Temp para status/listado.
    fn write_sample_catalog(dir: &Path) {
        use crate::catalog::feed::FeedEntry;
        use crate::catalog::{save_catalog, Catalog};
        let catalog = Catalog {
            repo: "alguien/feeds".to_string(),
            fetched_at: 1_700_000_000,
            entries: vec![
                FeedEntry {
                    id: "CSS".to_string(),
                    name: "CSS".to_string(),
                    version: "1".to_string(),
                    urls: vec!["https://a.example/CSS.tgz".to_string()],
                },
                FeedEntry {
                    id: "Python_3".to_string(),
                    name: "Python_3".to_string(),
                    version: "2".to_string(),
                    urls: vec!["https://a.example/Python.tgz".to_string()],
                },
            ],
        };
        save_catalog(&crate::catalog::catalog_file(dir), &catalog).expect("guardar caché");
    }

    #[test]
    fn catalog_status_empty_without_cache() {
        let dir = tempfile::tempdir().expect("tempdir");
        let status = catalog_status(&crate::settings::Settings::default(), dir.path());
        assert_eq!(status.repo, None);
        assert_eq!(status.fetched_at, None);
        assert_eq!(status.count, 0);
    }

    #[test]
    fn catalog_status_and_list_from_cache() {
        use crate::settings::Settings;
        let dir = tempfile::tempdir().expect("tempdir");
        write_sample_catalog(dir.path());
        let settings = Settings {
            feed_url: Some("alguien/feeds".to_string()),
            catalog_fetched_at: Some(1_700_000_000),
            ..Settings::default()
        };
        let status = catalog_status(&settings, dir.path());
        assert_eq!(status.repo.as_deref(), Some("alguien/feeds"));
        assert_eq!(status.fetched_at, Some(1_700_000_000));
        assert_eq!(status.count, 2);
        // Sin filtro: todo; con filtro: substring insensible a caso.
        assert_eq!(list_catalog_entries(dir.path(), None).len(), 2);
        let found = list_catalog_entries(dir.path(), Some("pyt"));
        assert_eq!(found.len(), 1);
        assert_eq!(found[0].id, "Python_3");
        assert!(list_catalog_entries(dir.path(), Some("  ")).len() == 2);
        assert!(list_catalog_entries(dir.path(), Some("zzz")).is_empty());
    }

    #[test]
    fn refresh_without_network_fails_typed() {
        let dir = tempfile::tempdir().expect("tempdir");
        // Repo con formato imposible: falla antes de tocar la red.
        let err = refresh_catalog_data(dir.path(), "///").expect_err("repo inválido");
        assert!(matches!(err, ApiError::FeedFailed { .. }));
        // Sin caché previa no se crea nada en el fallo.
        assert!(!crate::catalog::catalog_file(dir.path()).exists());
    }

    /// Docset falso mínimo (solo importan id, versión y carpeta).
    fn fake_status_docset(folder: &str, id: &str, version: Option<&str>) -> Docset {
        Docset {
            id: id.to_string(),
            name: folder.to_string(),
            platform: None,
            version: version.map(str::to_string),
            bundle_id: None,
            home_path: None,
            icon: None,
            root_path: PathBuf::from(folder),
            contents_path: PathBuf::from(folder).join("Contents"),
        }
    }

    #[test]
    fn install_status_tristate_and_filters() {
        let dir = tempfile::tempdir().expect("tempdir");
        write_sample_catalog(dir.path());
        // CSS instalado con versión antigua numérica, Python_3 sin versión.
        let docsets = vec![
            fake_status_docset("/docs/CSS.docset", "css", Some("0.9")),
            fake_status_docset("/docs/Python_3.docset", "python-3", None),
        ];
        let statuses = install_status_for(dir.path(), &docsets, None).expect("estado");
        assert_eq!(statuses.len(), 2);
        let css = statuses.iter().find(|s| s.feed_id == "CSS").expect("css");
        assert!(css.installed);
        assert_eq!(css.docset_id.as_deref(), Some("css"));
        assert_eq!(css.update_available, Some(true), "0.9 < 1 disponible");
        let python = statuses
            .iter()
            .find(|s| s.feed_id == "Python_3")
            .expect("py");
        assert!(python.installed);
        assert_eq!(
            python.update_available, None,
            "instalada desconocida → null"
        );
        // Filtro exacto y desconocido.
        let one = install_status_for(dir.path(), &docsets, Some("CSS")).expect("una");
        assert_eq!(one.len(), 1);
        let err = install_status_for(dir.path(), &docsets, Some("Nadie")).expect_err("desconocido");
        assert!(matches!(err, ApiError::UnknownFeed { .. }));
        // Sin catálogo → CatalogMissing.
        let empty = tempfile::tempdir().expect("tempdir");
        let err = install_status_for(empty.path(), &docsets, None).expect_err("sin caché");
        assert!(matches!(err, ApiError::CatalogMissing));
    }

    #[test]
    fn install_status_ambiguous_and_missing() {
        let dir = tempfile::tempdir().expect("tempdir");
        write_sample_catalog(dir.path());
        // Dos carpetas que reclaman el mismo feed (solo posible en Linux).
        let docsets = vec![
            fake_status_docset("/docs/CSS.docset", "css", Some("1")),
            fake_status_docset("/docs/Css.docset", "css-2", Some("1")),
        ];
        let statuses = install_status_for(dir.path(), &docsets, Some("CSS")).expect("estado");
        assert_eq!(statuses.len(), 1);
        let css = &statuses[0];
        assert!(!css.installed, "ambigua: no se elige ninguna");
        assert!(css.ambiguous);
        assert_eq!(css.ambiguous_ids.len(), 2);
        assert_eq!(css.update_available, None);
        // Feed sin instalar: update_available false (no "distinto").
        let statuses = install_status_for(dir.path(), &[], Some("CSS")).expect("estado");
        assert!(!statuses[0].installed);
        assert_eq!(statuses[0].update_available, Some(false));
    }

    #[test]
    fn check_install_allowed_matrix() {
        let docsets = vec![fake_status_docset("/docs/CSS.docset", "css", Some("1"))];
        // Libre → ids vacíos.
        assert!(check_install_allowed(&[], "CSS", false)
            .expect("libre")
            .is_empty());
        // Instalado sin force → AlreadyInstalled; con force → sustituye.
        let err = check_install_allowed(&docsets, "CSS", false).expect_err("instalado");
        assert!(matches!(err, ApiError::AlreadyInstalled { .. }));
        assert_eq!(
            check_install_allowed(&docsets, "CSS", true).expect("force"),
            vec!["css".to_string()]
        );
        // Ambiguo sin force → AmbiguousMatch con candidatos.
        let both = vec![
            fake_status_docset("/docs/CSS.docset", "css", Some("1")),
            fake_status_docset("/docs/Css.docset", "css-2", Some("1")),
        ];
        let err = check_install_allowed(&both, "CSS", false).expect_err("ambigua");
        match err {
            ApiError::AmbiguousMatch { candidates, .. } => assert_eq!(candidates.len(), 2),
            other => panic!("otra: {other:?}"),
        }
    }

    #[test]
    fn apply_replaced_swaps_index_entries() {
        use crate::search::SearchIndex;
        let mut loaded = Loaded {
            source_dir: PathBuf::from("x"),
            docsets: vec![fake_status_docset("/docs/Demo.docset", "demo", Some("0.5"))],
            pending: Vec::new(),
            issues: Vec::new(),
            index: SearchIndex::build(vec![Entry {
                docset_id: "demo".to_string(),
                name: "vieja".to_string(),
                kind: "Guide".to_string(),
                path: "vieja.html".to_string(),
            }]),
        };
        let installed = crate::docset::InstalledDocset {
            docset: fake_status_docset("/docs/Demo.docset", "demo", Some("1.0")),
            entries: vec![Entry {
                docset_id: "demo".to_string(),
                name: "nueva".to_string(),
                kind: "Guide".to_string(),
                path: "nueva.html".to_string(),
            }],
            replaced: true,
            source_url: None,
            stale_backup: None,
        };
        let summary = apply_replaced(&mut loaded, "Demo", &["demo".to_string()], installed);
        assert_eq!(summary.docset_id, "demo");
        assert_eq!(summary.version.as_deref(), Some("1.0"));
        assert_eq!(summary.entries, 1);
        assert!(summary.reinstalled);
        assert_eq!(loaded.docsets.len(), 1);
        assert_eq!(loaded.index.len(), 1, "la entrada vieja sale del índice");
        let kinds = browse_kinds(&loaded, "demo").expect("tipos del docset instalado");
        assert_eq!(kinds.len(), 1);
        assert_eq!(kinds[0].kind, "Guide");
        let entries = browse_entries(&loaded, "demo", "Guide", None, None)
            .expect("entradas del docset instalado");
        assert_eq!(entries.len(), 1);
        assert_eq!(entries[0].name, "nueva");
        let res = search_loaded(
            &mut loaded,
            &SearchRequest {
                request_id: 1,
                query: "nueva".to_string(),
                docset_ids: None,
                limit: None,
            },
        );
        assert_eq!(res.results.len(), 1);
        assert_eq!(res.results[0].name, "nueva");
    }

    #[test]
    fn devicon_fallback_fills_only_missing_icons() {
        let dir = tempfile::tempdir().expect("tempdir");
        let base = dir.path().join("devicon-cache");
        std::fs::create_dir_all(&base).expect("caché");
        // Caché válida solo para lua.
        std::fs::write(
            base.join("lua.svg"),
            "<svg xmlns=\"http://www.w3.org/2000/svg\"><g/></svg>",
        )
        .expect("semilla");
        let mut docsets = vec![
            fake_status_docset("/docs/Lua.docset", "lua", None),
            fake_status_docset("/docs/CobolXYZ.docset", "cobolxyz", None),
        ];
        // Uno ya trae icono propio: no se toca.
        docsets.push(Docset {
            icon: Some("data:image/png;base64,AAA".to_string()),
            ..fake_status_docset("/docs/Go.docset", "go", None)
        });
        apply_devicon_fallback(&mut docsets, &base);
        let lua = docsets.iter().find(|d| d.id == "lua").expect("lua");
        assert!(
            lua.icon
                .as_deref()
                .is_some_and(|u| u.starts_with("data:image/svg+xml;base64,")),
            "caché Devicon aplicada"
        );
        let unknown = docsets.iter().find(|d| d.id == "cobolxyz").expect("cobol");
        assert_eq!(unknown.icon, None, "sin coincidencia → genérico");
        let own = docsets.iter().find(|d| d.id == "go").expect("go");
        assert_eq!(
            own.icon.as_deref(),
            Some("data:image/png;base64,AAA"),
            "el propio no se sobrescribe"
        );
    }

    /// Docset clásico sintético en `root/<folder>`: `Documents/` +
    /// `docSet.dsidx` con dos entradas; con `plist_home` añade un
    /// `Info.plist` con esa página de inicio.
    fn make_classic_docset(root: &Path, folder: &str, plist_home: Option<&str>) {
        let base = root.join(folder);
        std::fs::create_dir_all(base.join("Contents/Resources/Documents")).expect("dirs");
        let conn = rusqlite::Connection::open(base.join("Contents/Resources/docSet.dsidx"))
            .expect("dsidx");
        conn.execute_batch(
            "CREATE TABLE searchIndex(id INTEGER PRIMARY KEY, name TEXT, type TEXT, path TEXT);
             INSERT INTO searchIndex(name, type, path) VALUES
               ('primera', 'Guide', 'primera.html'),
               ('segunda', 'Function', 'segunda.html');",
        )
        .expect("poblar");
        drop(conn);
        if let Some(home) = plist_home {
            std::fs::write(
                base.join("Contents/Info.plist"),
                format!(
                    r#"<?xml version="1.0" encoding="UTF-8"?><plist version="1.0"><dict>
<key>CFBundleName</key><string>Demo</string>
<key>dashIndexFilePath</key><string>{home}</string>
</dict></plist>"#
                ),
            )
            .expect("plist");
        }
    }

    #[test]
    fn load_reuses_scanner_entries_without_home() {
        // F1 camino 1: sin home en plist el escáner ya abrió el índice;
        // la carga reutiliza esas entradas sin perder información.
        let dir = tempfile::tempdir().expect("tempdir");
        make_classic_docset(dir.path(), "Reuse.docset", None);
        let (_tmp, opts) = test_options();
        let mut loaded = load_docsets_dir(dir.path(), &opts).expect("cargar");
        assert!(loaded.issues.is_empty());
        assert_eq!(loaded.docsets.len(), 1);
        assert_eq!(loaded.docsets[0].home_path.as_deref(), Some("primera.html"));
        assert_eq!(loaded.index.len(), 2);
        let res = search_loaded(
            &mut loaded,
            &SearchRequest {
                request_id: 1,
                query: "segunda".to_string(),
                docset_ids: None,
                limit: None,
            },
        );
        assert_eq!(res.results.len(), 1);
        assert_eq!(res.results[0].name, "segunda");
    }

    #[test]
    fn load_reads_index_when_scanner_skipped_it() {
        // F1 camino 2: con home en plist el escáner no abre el índice;
        // la carga lo lee como antes, con el home del plist intacto.
        let dir = tempfile::tempdir().expect("tempdir");
        make_classic_docset(dir.path(), "Demo.docset", Some("guia/inicio.html"));
        let (_tmp, opts) = test_options();
        let loaded = load_docsets_dir(dir.path(), &opts).expect("cargar");
        assert!(loaded.issues.is_empty());
        assert_eq!(
            loaded.docsets[0].home_path.as_deref(),
            Some("guia/inicio.html")
        );
        assert_eq!(loaded.index.len(), 2);
    }

    #[test]
    fn load_sweeps_unreferenced_tarix_caches() {
        let dir = tempfile::tempdir().expect("tempdir");
        make_tarix_docset(dir.path(), "Demo.docset"); // pendiente demo
        let cache = dir.path().join("cache");
        std::fs::create_dir_all(&cache).expect("cache");
        // Referenciada por el pendiente: se conserva aunque esté vacía.
        std::fs::create_dir_all(cache.join("demo")).expect("demo");
        // Huérfanas: solo manifest (caso real python-3) y con contenido.
        std::fs::create_dir_all(cache.join("viejo")).expect("viejo");
        std::fs::write(cache.join("viejo/manifest.json"), "{}").expect("m");
        std::fs::create_dir_all(cache.join("otro/Contents")).expect("otro");
        let opts = LoadOptions {
            cache_base: cache.clone(),
            devicon_base: dir.path().join("devicon-cache"),
            extract_missing: false,
        };
        let loaded = load_docsets_dir(dir.path(), &opts).expect("cargar");
        assert_eq!(loaded.pending.len(), 1, "demo sigue pendiente");
        assert!(cache.join("demo").is_dir(), "referenciada intacta");
        assert!(!cache.join("viejo").exists(), "huérfana fuera");
        assert!(!cache.join("otro").exists(), "huérfana fuera");
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
            icon: None,
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
            icon: None,
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
            devicon_base: dir.path().join("devicon-cache"),
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
