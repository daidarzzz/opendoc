//! Instalación de docsets desde el catálogo (F2).
//!
//! - Solo `.tgz` clásico (con `Contents/` dentro): sin dependencias nuevas.
//! - La validación del tar se reutiliza de `tarix.rs` (`unpack_validated`)
//!   sin debilitarla: raíz única, sin escapes, sin enlaces, topes por
//!   bytes reales.
//! - Flujo seguro: descarga a `.part` → extrae a `.tmp-install-*` → valida
//!   layout + índice → reemplazo atómico (`final→old`, `tmp→final`). Un
//!   fallo nunca deja una instalación parcial como válida ni destruye la
//!   anterior (se restaura el `.old`).
//! - El progreso se informa por callback (`ProgressReport`); el comando
//!   Tauri lo reenvía como evento `docset-progress`. Sin porcentajes
//!   inventados: bytes reales en descarga, conteos en extracción.
//! - Matching estricto feed ↔ instalado: solo el nombre de la carpeta
//!   (sin `.docset`, insensible a mayúsculas). El slug/id NO se usa para
//!   no asociar docsets distintos (p. ej. feed `C` con carpeta
//!   `C++.docset`). Si varias carpetas coinciden, se informa ambigüedad
//!   en vez de elegir una.
//! - Versiones: solo se comparan versiones numéricas punteadas
//!   (`1.2.10` > `1.2.3`); cualquier otra cosa no es comparable con
//!   seguridad y da `None` (el estado lo expone como `null`).

use std::collections::HashSet;
use std::io::{Read, Write};
use std::path::{Path, PathBuf};
use std::time::{SystemTime, UNIX_EPOCH};

use serde::Serialize;

use crate::catalog::feed::FeedEntry;

use super::scanner::{slugify, unique_slug};
use super::tarix::unpack_validated;
use super::{apply_to_docset, icon_data_url_for, read_index, read_info_plist};
use super::{Docset, Entry, TarixError, TarixLimits};

/// Etapa del progreso (sin porcentajes: bytes y conteos reales).
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize)]
#[serde(rename_all = "snake_case")]
pub enum ProgressStage {
    /// Descargando el `.tgz` (`received_bytes`/`total_bytes` si se conoce).
    Downloading,
    /// Extrayendo el `.tgz` en temporal (`files` procesados).
    Extracting,
    /// Validando layout e índice del extraído.
    Verifying,
}

/// Informe de progreso para el callback (el comando lo emite a la UI).
#[derive(Debug, Clone, Copy, Serialize)]
pub struct ProgressReport {
    /// Etapa actual.
    pub stage: ProgressStage,
    /// Bytes descargados (solo en `Downloading`).
    pub received_bytes: u64,
    /// Total anunciado por el servidor, si lo hay.
    pub total_bytes: Option<u64>,
    /// Entradas del tar procesadas (solo en `Extracting`).
    pub files: u64,
}

/// Error de la operación de descarga/instalación. Las precondiciones
/// (catálogo ausente, feed desconocido, ya instalado, ambigüedad) se
/// comprueban antes en `service` con `ApiError`.
#[derive(Debug, thiserror::Error)]
pub enum InstallError {
    /// La carpeta de docsets no existe o no es un directorio.
    #[error("la carpeta de docsets no existe o no es un directorio: {}", path.display())]
    NoDocsetsDir {
        /// Ruta rechazada.
        path: PathBuf,
    },
    /// La entrada no trae ninguna URL.
    #[error("la entrada no trae URL de descarga utilizable: {id}")]
    NoDownloadUrl {
        /// Id del feed.
        id: String,
    },
    /// Ninguna URL es un `.tgz` (único formato de F2).
    #[error("formato no soportado (solo .tgz): {id}")]
    UnsupportedPackage {
        /// Id del feed.
        id: String,
    },
    /// Todas las URLs fallaron (red o HTTP).
    #[error("fallo descargando {id}: {message}")]
    DownloadFailed {
        /// Id del feed.
        id: String,
        /// Último error (incluye el HTTP si lo hubo).
        message: String,
    },
    /// El `.tgz` no se pudo extraer (corrupto, malicioso, límites...).
    #[error("fallo extrayendo {id}: {message}")]
    ExtractFailed {
        /// Id del feed.
        id: String,
        /// Detalle.
        message: String,
    },
    /// Extraído pero sin estructura de docset clásico.
    #[error("paquete inválido (no es un docset clásico): {id}: {message}")]
    InvalidPackage {
        /// Id del feed.
        id: String,
        /// Detalle.
        message: String,
    },
    /// Fallo de disco o en los renombrados atómicos.
    #[error("fallo instalando {id}: {message}")]
    InstallFailed {
        /// Id del feed.
        id: String,
        /// Detalle (incluye si la restauración del `.old` falló).
        message: String,
    },
}

/// Un docset recién instalado, listo para integrar en `Loaded`.
#[derive(Debug)]
pub struct InstalledDocset {
    /// Metadatos (id asignado con el mismo algoritmo del escáner).
    pub docset: Docset,
    /// Entradas leídas del `.dsidx` instalado.
    pub entries: Vec<Entry>,
    /// `true` si sustituyó una instalación previa.
    pub replaced: bool,
    /// URL de la que se descargó (`None` si se reutilizó lo instalado).
    pub source_url: Option<String>,
    /// Respaldo `.old` pendiente de borrar fuera del camino crítico
    /// (`None` si no quedó ninguno).
    pub stale_backup: Option<PathBuf>,
}

/// Coincidencia estricta entre un feed y los docsets instalados.
#[derive(Debug)]
pub enum FeedMatch<'a> {
    /// Ninguna carpeta coincide.
    None,
    /// Una sola carpeta coincide.
    One(&'a Docset),
    /// Varias carpetas coinciden (variantes de mayúsculas en Linux):
    /// no se elige ninguna.
    Ambiguous(Vec<&'a Docset>),
}

/// Busca la carpeta instalada de un feed: el stem de `root_path` (sin
/// `.docset`) igual al id del feed, insensible a mayúsculas. Solo eso:
/// ni slugs, ni nombres del plist, ni substrings.
pub fn match_feed<'a>(feed_id: &str, docsets: &'a [Docset]) -> FeedMatch<'a> {
    let wanted = feed_id.to_lowercase();
    let mut hits = Vec::new();
    for docset in docsets {
        if folder_stem(&docset.root_path).as_deref() == Some(wanted.as_str()) {
            hits.push(docset);
        }
    }
    match hits.len() {
        0 => FeedMatch::None,
        1 => FeedMatch::One(hits[0]),
        _ => FeedMatch::Ambiguous(hits),
    }
}

/// Stem de la carpeta sin la extensión `.docset` (insensible a
/// mayúsculas), en minúsculas. `None` si no es una carpeta `.docset`.
pub(crate) fn folder_stem(root_path: &Path) -> Option<String> {
    let name = root_path.file_name()?.to_string_lossy();
    if !name.to_lowercase().ends_with(".docset") {
        return None;
    }
    let stem_len = name.len().checked_sub(".docset".len())?;
    Some(name[..stem_len].to_lowercase())
}

/// Compara versiones numéricas punteadas (`1.2.10` > `1.2.3`, los
/// segmentos que faltan valen 0). `None` si alguna no es numérica
/// punteada (no comparable con seguridad).
pub fn compare_versions(a: &str, b: &str) -> Option<std::cmp::Ordering> {
    let pa = parse_numeric_version(a)?;
    let pb = parse_numeric_version(b)?;
    let n = pa.len().max(pb.len());
    for i in 0..n {
        let x = pa.get(i).copied().unwrap_or(0);
        let y = pb.get(i).copied().unwrap_or(0);
        match x.cmp(&y) {
            std::cmp::Ordering::Equal => continue,
            other => return Some(other),
        }
    }
    Some(std::cmp::Ordering::Equal)
}

/// Segmentos numéricos separados por `.`, `-` o `_`. Cualquier otra
/// cosa (vacío, letras, segmentos vacíos, desborde) → `None`.
fn parse_numeric_version(version: &str) -> Option<Vec<u64>> {
    let version = version.trim();
    if version.is_empty() {
        return None;
    }
    let parts: Option<Vec<u64>> = version
        .split(['.', '-', '_'])
        .map(|segment| {
            if segment.is_empty() || !segment.bytes().all(|b| b.is_ascii_digit()) {
                None
            } else {
                segment.parse::<u64>().ok()
            }
        })
        .collect();
    parts.filter(|parts| !parts.is_empty())
}

/// ¿Hay actualización disponible?
/// - `Some(true)`: ambas numéricas y la disponible es más reciente.
/// - `Some(false)`: iguales, o la instalada es más reciente.
/// - `None`: no comparable (instalada desconocida o no numéricas).
pub fn update_available(installed: Option<&str>, available: &str) -> Option<bool> {
    let installed = installed?.trim();
    let available_trimmed = available.trim();
    if installed == available_trimmed {
        return Some(false);
    }
    match compare_versions(installed, available_trimmed) {
        Some(std::cmp::Ordering::Less) => Some(true),
        Some(_) => Some(false),
        None => None,
    }
}

/// `true` si la URL apunta a un `.tgz` (ignora query/fragmento y
/// mayúsculas). Único formato que instala F2.
fn is_tgz_url(url: &str) -> bool {
    let path = url.split(['?', '#']).next().unwrap_or(url);
    path.to_lowercase().ends_with(".tgz")
}

/// Host de una URL en minúsculas (`None` si no hay esquema/host).
/// Sin dependencias: corte léxico en `://`, fin en `/`, `?`, `#` o `:`.
pub(crate) fn url_host(url: &str) -> Option<String> {
    let after_scheme = url.split("://").nth(1)?;
    let host = after_scheme.split(['/', '?', '#', ':']).next()?;
    (!host.is_empty()).then(|| host.to_lowercase())
}

/// Ordena mirrors poniendo primero el recordado (si sigue en la lista);
/// el resto conserva su orden. Estable y sin red.
pub(crate) fn order_mirrors(urls: &[String], prefer_host: Option<&str>) -> Vec<String> {
    let mut ordered: Vec<String> = urls.to_vec();
    if let Some(want) = prefer_host {
        ordered.sort_by_key(|u| url_host(u).as_deref() != Some(want));
    }
    ordered
}

/// Descarga, extrae, valida y coloca atómicamente el docset.
/// - `used_ids`: ids ya ocupados (para asignar el slug sin colisiones,
///   igual que el escáner).
/// - `devicon_base`: caché de iconos Devicon (`devicon-cache/` en datos
///   de la app; solo se usa si el paquete no trae icono propio).
/// - `on_progress`: callback de progreso (descarga real, sin porcentajes
///   inventados).
///   La instalación anterior (si la hay) se conserva hasta que la nueva
///   está validada; si el reemplazo falla, se restaura.
pub fn download_and_install(
    client: &reqwest::blocking::Client,
    entry: &FeedEntry,
    docsets_dir: &Path,
    devicon_base: &Path,
    used_ids: &HashSet<String>,
    limits: TarixLimits,
    on_progress: &(dyn Fn(ProgressReport) + Send + Sync),
) -> Result<InstalledDocset, InstallError> {
    if !docsets_dir.is_dir() {
        return Err(InstallError::NoDocsetsDir {
            path: docsets_dir.to_path_buf(),
        });
    }
    if entry.urls.is_empty() {
        return Err(InstallError::NoDownloadUrl {
            id: entry.id.clone(),
        });
    }
    if !entry.urls.iter().any(|url| is_tgz_url(url)) {
        return Err(InstallError::UnsupportedPackage {
            id: entry.id.clone(),
        });
    }
    sweep_stale_temps(docsets_dir);
    let slug = slugify(&entry.id);
    let final_dir = docsets_dir.join(format!("{}.docset", entry.id));
    // Había instalación previa si existe la carpeta o un respaldo `.old`
    // huérfano de un crash anterior (se recupera y sustituye).
    let had_previous = final_dir.is_dir() || final_dir.with_extension("docset.old").is_dir();
    // C8: si lo instalado coincide en versión y verifica, no se descarga
    // nada (ni siquiera con force: la reparación solo re-descarga lo
    // que no verifica).
    if let Some(fresh) = try_reuse_valid(client, entry, &final_dir, devicon_base, used_ids) {
        return Ok(fresh);
    }
    let tmp_dir = unique_temp_path(docsets_dir, &slug);
    let result = download_extract_replace(
        client,
        entry,
        &final_dir,
        &tmp_dir,
        docsets_dir,
        &slug,
        devicon_base,
        used_ids,
        limits,
        on_progress,
    );
    // Nunca dejar el temporal de extracción atrás. Los parciales de
    // descarga se conservan a propósito (reanudan reintentos); el
    // ganador se borra al instalar y el resto los barre el sweep.
    if tmp_dir.exists() {
        let _ = std::fs::remove_dir_all(&tmp_dir);
    }
    result.map(|mut installed| {
        installed.replaced = had_previous;
        installed
    })
}

/// ¿Son la misma versión? Igualdad exacta o numérica (`1.0` = `1.0.0`).
/// `None` instalada → no comparable → nunca reutiliza (se descarga).
fn same_version(installed: Option<&str>, available: &str) -> bool {
    let Some(installed) = installed.map(str::trim).filter(|s| !s.is_empty()) else {
        return false;
    };
    let available = available.trim();
    installed == available
        || compare_versions(installed, available) == Some(std::cmp::Ordering::Equal)
}

/// Reutiliza lo instalado sin descargar cuando coincide en versión y
/// verifica estrictamente (layout + índice legible con entradas).
/// Cualquier duda → `None` y se sigue el flujo normal de descarga.
fn try_reuse_valid(
    client: &reqwest::blocking::Client,
    entry: &FeedEntry,
    final_dir: &Path,
    devicon_base: &Path,
    used_ids: &HashSet<String>,
) -> Option<InstalledDocset> {
    if !final_dir.is_dir() {
        return None;
    }
    let contents = final_dir.join("Contents");
    let installed_version = read_info_plist(&contents).ok()??.version;
    if !same_version(installed_version.as_deref(), &entry.version) {
        return None;
    }
    let dsidx = contents.join("Resources/docSet.dsidx");
    if !dsidx.is_file() || !contents.join("Resources/Documents").is_dir() {
        return None;
    }
    let mut used = used_ids.clone();
    let id = unique_slug(&slugify(&entry.id), &mut used);
    let data = read_index(&dsidx, &id).ok()?;
    if data.entries.is_empty() {
        return None;
    }
    let (mut docset, entries) = assemble_docset(entry, final_dir, &contents, id, data);
    docset.icon = icon_data_url_for(final_dir);
    if docset.icon.is_none() {
        docset.icon = super::devicon::ensure_cached_or_fetch(client, devicon_base, &entry.id);
    }
    crate::profile::mark(
        "install",
        format_args!(
            "feed={} reutiliza_instalado entries={} (sin descarga)",
            entry.id,
            entries.len()
        ),
    );
    Some(InstalledDocset {
        docset,
        entries,
        replaced: false,
        source_url: None,
        stale_backup: None,
    })
}

/// Construye `Docset` + entradas desde un `Contents/` ya validado
/// (común al flujo de descarga y al de reutilización).
fn assemble_docset(
    entry: &FeedEntry,
    root_dir: &Path,
    contents_dir: &Path,
    id: String,
    data: crate::docset::IndexData,
) -> (Docset, Vec<Entry>) {
    let mut docset = Docset {
        id: id.clone(),
        name: entry.name.clone(),
        platform: None,
        version: None,
        bundle_id: None,
        home_path: None,
        icon: None,
        root_path: root_dir.to_path_buf(),
        contents_path: contents_dir.to_path_buf(),
    };
    if let Ok(Some(info)) = read_info_plist(contents_dir) {
        apply_to_docset(&mut docset, &info);
    }
    if docset.home_path.is_none() {
        if let Some(first) = data.entries.first() {
            docset.home_path = Some(first.path.clone());
        }
    }
    (docset, data.entries)
}

/// Núcleo de la instalación (el llamador limpia el temporal de
/// extracción; el parcial ganador se borra aquí mismo al instalar).
#[allow(clippy::too_many_arguments)]
fn download_extract_replace(
    client: &reqwest::blocking::Client,
    entry: &FeedEntry,
    final_dir: &Path,
    tmp_dir: &Path,
    docsets_dir: &Path,
    slug: &str,
    devicon_base: &Path,
    used_ids: &HashSet<String>,
    limits: TarixLimits,
    on_progress: &(dyn Fn(ProgressReport) + Send + Sync),
) -> Result<InstalledDocset, InstallError> {
    // FASE 0: solo medida (ningún cambio de lógica).
    let t_dl = std::time::Instant::now();
    let (_bytes, url) = download_mirrors(client, entry, docsets_dir, slug, limits, on_progress)?;
    crate::profile::mark(
        "install",
        format_args!(
            "feed={} descarga_ms={} (red+escritura .part)",
            entry.id,
            crate::profile::ms_since(t_dl)
        ),
    );
    let dl_path = part_path_for(docsets_dir, slug, &url);
    on_progress(ProgressReport {
        stage: ProgressStage::Extracting,
        received_bytes: 0,
        total_bytes: None,
        files: 0,
    });
    unpack_validated(&dl_path, tmp_dir, limits).map_err(|e| InstallError::ExtractFailed {
        id: entry.id.clone(),
        message: tarix_message(&e),
    })?;
    // FASE 0: solo medida.
    let t_verify = std::time::Instant::now();
    on_progress(ProgressReport {
        stage: ProgressStage::Verifying,
        received_bytes: 0,
        total_bytes: None,
        files: 0,
    });
    // Id con el mismo algoritmo del escáner (sufijo en colisiones).
    let mut used = used_ids.clone();
    let id = unique_slug(&slugify(&entry.id), &mut used);
    let contents = tmp_dir.join("Contents");
    let dsidx = contents.join("Resources/docSet.dsidx");
    let documents = contents.join("Resources/Documents");
    if !dsidx.is_file() || !documents.is_dir() {
        let tarix_inside = contents.join("Resources/tarix.tgz").is_file();
        return Err(InstallError::InvalidPackage {
            id: entry.id.clone(),
            message: if tarix_inside {
                "es un paquete tarix anidado (no soportado en F2)".to_string()
            } else {
                "falta Contents/Resources/docSet.dsidx o Documents/".to_string()
            },
        });
    }
    let data = read_index(&dsidx, &id).map_err(|e| InstallError::InvalidPackage {
        id: entry.id.clone(),
        message: format!("índice ilegible: {e}"),
    })?;
    let (mut docset, entries) = assemble_docset(entry, final_dir, &contents, id, data);
    let entry_count = entries.len();
    // FASE 0: solo medida (verificación = layout + índice + plist).
    crate::profile::mark(
        "install",
        format_args!(
            "feed={} verificar_ms={} entries={entry_count}",
            entry.id,
            crate::profile::ms_since(t_verify)
        ),
    );
    // FASE 0: solo medida (swap atómico; el borrado del respaldo va
    // fuera del camino crítico, ver `stale_backup`).
    let t_replace = std::time::Instant::now();
    let stale_backup = atomic_replace(&entry.id, final_dir, tmp_dir)?;
    crate::profile::mark(
        "install",
        format_args!(
            "feed={} replace_ms={}",
            entry.id,
            crate::profile::ms_since(t_replace)
        ),
    );
    // El icono se lee DESPUÉS de colocar la carpeta final (antes no
    // existe). Vive en la raíz del `.docset` (`icon.png` sobrevive al
    // quitar la primera componente del tgz); si el paquete no trae,
    // fallback Devicon best-effort (caché o descarga, nunca tumba la
    // instalación ya validada); si no, `None` y la UI usa el genérico.
    docset.icon = icon_data_url_for(final_dir);
    if docset.icon.is_none() {
        docset.icon = super::devicon::ensure_cached_or_fetch(client, devicon_base, &entry.id);
    }
    // El parcial ganador ya no hace falta (los de otros espejos los
    // barre el sweep y sirven para reanudar).
    let _ = std::fs::remove_file(&dl_path);
    Ok(InstalledDocset {
        docset,
        entries,
        replaced: false,
        source_url: Some(url),
        stale_backup,
    })
}

/// Mensaje legible de un error de extracción (conserva el detalle del
/// motivo: seguridad, límites o corrupción).
fn tarix_message(error: &TarixError) -> String {
    error.to_string()
}

/// Prueba las URLs `.tgz` en orden (mirrors): la primera que descargue
/// completa gana. Si todas fallan, error con el último motivo.
/// Devuelve los bytes y la URL ganadora (para recordar el mejor espejo).
/// Pasada rápida con failover por espejo lento; si todo falla habiendo
/// espejos lentos, una pasada paciente final sin límite de velocidad.
fn download_mirrors(
    client: &reqwest::blocking::Client,
    entry: &FeedEntry,
    docsets_dir: &Path,
    slug: &str,
    limits: TarixLimits,
    on_progress: &(dyn Fn(ProgressReport) + Send + Sync),
) -> Result<(u64, String), InstallError> {
    let urls: Vec<&String> = entry.urls.iter().filter(|url| is_tgz_url(url)).collect();
    if urls.is_empty() {
        return Err(InstallError::UnsupportedPackage {
            id: entry.id.clone(),
        });
    }
    let mut last_error = String::from("sin mirrors utilizables");
    let mut slow_seen = false;
    for url in &urls {
        match download_one(
            client,
            url,
            &part_path_for(docsets_dir, slug, url),
            limits,
            on_progress,
            false,
        ) {
            Ok(bytes) => return Ok((bytes, (*url).to_string())),
            Err(fail) => {
                slow_seen = slow_seen || fail.slow;
                last_error = fail.message;
            }
        }
    }
    // Reintento paciente (sin corte por lentitud) sobre los espejos que
    // progresaron, reanudando sus parciales. Sin espejos lentos, fallar
    // ya (errores duros como 404 no mejoran reintentando).
    if slow_seen {
        for url in &urls {
            match download_one(
                client,
                url,
                &part_path_for(docsets_dir, slug, url),
                limits,
                on_progress,
                true,
            ) {
                Ok(bytes) => return Ok((bytes, (*url).to_string())),
                Err(fail) => last_error = fail.message,
            }
        }
    }
    Err(InstallError::DownloadFailed {
        id: entry.id.clone(),
        message: last_error,
    })
}

/// Fichero parcial propio de una URL (un espejo nunca mezcla bytes de
/// otro): `.dl-<slug>-<hash16(url)>.part`. Determinista entre intentos.
fn part_path_for(docsets_dir: &Path, slug: &str, url: &str) -> PathBuf {
    use std::collections::hash_map::DefaultHasher;
    use std::hash::{Hash, Hasher};
    let mut hasher = DefaultHasher::new();
    url.hash(&mut hasher);
    docsets_dir.join(format!(".dl-{slug}-{:016x}.part", hasher.finish()))
}

/// Fallo de un intento de descarga (mensaje + si fue por lentitud).
struct AttemptFail {
    message: String,
    slow: bool,
}

/// Velocidad mínima sostenida para no saltar de espejo (64 KB/s tras
/// 15 s de gracia). Solo en pasada rápida; la paciente no corta.
const SLOW_GRACE_SECS: u64 = 15;
const SLOW_MIN_BPS: u64 = 65_536;

/// `true` si con ese ritmo no merece seguir esperando otro espejo.
fn is_slow(elapsed_ms: u128, bytes: u64) -> bool {
    elapsed_ms >= u128::from(SLOW_GRACE_SECS * 1000)
        && (bytes as u128).saturating_mul(1000) / elapsed_ms.max(1) < u128::from(SLOW_MIN_BPS)
}

/// Descarga una URL a su parcial con tope de tamaño y progreso real.
/// Reanuda (`Range`) si hay parcial previo de la MISMA url y el servidor
/// colabora (206); si lo ignora (200) o lo rechaza (416), empieza de cero.
/// `patient=false` corta espejos lentos; `true` los tolera.
fn download_one(
    client: &reqwest::blocking::Client,
    url: &str,
    dl_path: &Path,
    limits: TarixLimits,
    on_progress: &(dyn Fn(ProgressReport) + Send + Sync),
    patient: bool,
) -> Result<u64, AttemptFail> {
    // FASE 0: solo medida (red+escritura van en el mismo bucle).
    let t_dl = std::time::Instant::now();
    let fail = |message: String, slow: bool| AttemptFail { message, slow };
    let from = std::fs::metadata(dl_path)
        .map(|m| m.len())
        .unwrap_or(0)
        .min(limits.max_bytes);
    let mut request = client.get(url);
    if from > 0 {
        request = request.header("Range", format!("bytes={from}-"));
    }
    let response = request
        .send()
        .map_err(|e| fail(format!("red en {url}: {e}"), false))?;
    let status = response.status();
    // 206 = reanuda; 200 = servidor sin rangos (o sin parcial): de cero.
    // 416 = el parcial no encaja: se borra y se reintenta en limpio
    // (sin Range ya no puede repetirse el 416).
    if status.as_u16() == 206 && from > 0 {
        download_one_body(
            response,
            url,
            dl_path,
            limits,
            on_progress,
            patient,
            t_dl,
            from,
        )
    } else if status.as_u16() == 416 && from > 0 {
        let _ = std::fs::remove_file(dl_path);
        download_one(client, url, dl_path, limits, on_progress, patient)
    } else if !status.is_success() {
        Err(fail(format!("HTTP {} en {url}", status.as_u16()), false))
    } else {
        download_one_body(
            response,
            url,
            dl_path,
            limits,
            on_progress,
            patient,
            t_dl,
            0,
        )
    }
}

/// Cuerpo de la descarga: vuelca el flujo a `dl_path` (anexa si
/// `resume_from > 0`, trunca si es 0), con tope, progreso y corte por
/// espejo lento (salvo pasada paciente). Al terminar exige el total
/// anunciado: si no cuadra, el parcial se borra (no se mezcla basura).
#[allow(clippy::too_many_arguments)]
fn download_one_body(
    mut response: reqwest::blocking::Response,
    url: &str,
    dl_path: &Path,
    limits: TarixLimits,
    on_progress: &(dyn Fn(ProgressReport) + Send + Sync),
    patient: bool,
    t_dl: std::time::Instant,
    resume_from: u64,
) -> Result<u64, AttemptFail> {
    let fail = |message: String, slow: bool| AttemptFail { message, slow };
    // Total real esperado (en 206, lo anunciado es solo lo restante).
    let total = response
        .content_length()
        .map(|rest| rest.saturating_add(resume_from));
    if let Some(announced) = total {
        if announced > limits.max_bytes {
            return Err(fail(
                format!(
                    "tamaño anunciado {announced} supera el tope {} en {url}",
                    limits.max_bytes
                ),
                false,
            ));
        }
    }
    let mut out = if resume_from > 0 {
        std::fs::OpenOptions::new()
            .append(true)
            .open(dl_path)
            .map_err(|e| {
                fail(
                    format!("no se puede anexar a {}: {e}", dl_path.display()),
                    false,
                )
            })?
    } else {
        std::fs::File::create(dl_path).map_err(|e| {
            fail(
                format!("no se puede escribir en {}: {e}", dl_path.display()),
                false,
            )
        })?
    };
    on_progress(ProgressReport {
        stage: ProgressStage::Downloading,
        received_bytes: resume_from,
        total_bytes: total,
        files: 0,
    });
    let mut received: u64 = resume_from;
    let mut attempt_bytes: u64 = 0;
    let mut last_emit: u64 = resume_from;
    let mut buffer = [0_u8; 65536];
    loop {
        let n = response
            .read(&mut buffer)
            .map_err(|e| fail(format!("corte de red en {url}: {e}"), false))?;
        if n == 0 {
            break;
        }
        received += n as u64;
        attempt_bytes += n as u64;
        if received > limits.max_bytes {
            return Err(fail(
                format!(
                    "tamaño descargado supera el tope {} en {url}",
                    limits.max_bytes
                ),
                false,
            ));
        }
        out.write_all(&buffer[..n]).map_err(|e| {
            fail(
                format!("fallo de disco en {}: {e}", dl_path.display()),
                false,
            )
        })?;
        if !patient && is_slow(t_dl.elapsed().as_millis(), attempt_bytes) {
            let kb_s =
                (attempt_bytes as u128).saturating_mul(1000) / t_dl.elapsed().as_millis().max(1);
            return Err(fail(
                format!(
                    "espejo lento ({} KB/s) en {url}, probando siguiente",
                    kb_s / 1024
                ),
                true,
            ));
        }
        if received - last_emit >= 262_144 {
            last_emit = received;
            on_progress(ProgressReport {
                stage: ProgressStage::Downloading,
                received_bytes: received,
                total_bytes: total,
                files: 0,
            });
        }
    }
    drop(out);
    // Si el total anunciado no cuadra, el parcial no sirve: fuera.
    if let Some(announced) = total {
        if received != announced {
            let _ = std::fs::remove_file(dl_path);
            return Err(fail(
                format!("descarga incompleta en {url}: {received} de {announced} bytes"),
                false,
            ));
        }
    }
    on_progress(ProgressReport {
        stage: ProgressStage::Downloading,
        received_bytes: received,
        total_bytes: total.or(Some(received)),
        files: 0,
    });
    // FASE 0: solo medida.
    let ms = crate::profile::ms_since(t_dl).max(1);
    crate::profile::mark(
        "install",
        format_args!(
            "descarga url={url} bytes={received} ms={ms} mbs={:.1} reanudado={resume_from}",
            received as f64 / 1_048_576.0 / (ms as f64 / 1000.0)
        ),
    );
    Ok(received)
}

/// Sustitución segura: `final→old`, `tmp→final`. Devuelve el respaldo
/// `.old` pendiente de borrar FUERA del camino crítico (el llamador lo
/// elimina en fondo o lo barre al arrancar; la versión nueva ya está
/// viva tras el rename). Si el rename final falla, restaura el `.old`.
/// También recupera un `.old` huérfano de un crash anterior (final ausente).
fn atomic_replace(
    id: &str,
    final_dir: &Path,
    tmp_dir: &Path,
) -> Result<Option<PathBuf>, InstallError> {
    let fail = |message: String| InstallError::InstallFailed {
        id: id.to_string(),
        message,
    };
    let old_dir = final_dir.with_extension("docset.old");
    if !final_dir.exists() && old_dir.exists() {
        std::fs::rename(&old_dir, final_dir)
            .map_err(|e| fail(format!("recuperando respaldo previo: {e}")))?;
    }
    if old_dir.exists() {
        std::fs::remove_dir_all(&old_dir)
            .map_err(|e| fail(format!("limpiando respaldo obsoleto: {e}")))?;
    }
    let had_previous = final_dir.exists();
    if had_previous {
        std::fs::rename(final_dir, &old_dir)
            .map_err(|e| fail(format!("apartando la instalación anterior: {e}")))?;
    }
    match std::fs::rename(tmp_dir, final_dir) {
        Ok(()) => Ok(had_previous.then_some(old_dir)),
        Err(rename_error) => {
            if had_previous && old_dir.exists() && !final_dir.exists() {
                if let Err(restore_error) = std::fs::rename(&old_dir, final_dir) {
                    return Err(fail(format!(
                        "colocando la nueva versión: {rename_error}; \
                         la anterior no se pudo restaurar: {restore_error}"
                    )));
                }
            }
            Err(fail(format!("colocando la nueva versión: {rename_error}")))
        }
    }
}

/// Ruta temporal única dentro de la carpeta de docsets (mismo sistema
/// de ficheros: los renames son atómicos). Solo para extracción (las
/// descargas usan un `.part` por URL para poder reanudar).
fn unique_temp_path(docsets_dir: &Path, slug: &str) -> PathBuf {
    let pid = std::process::id();
    let nanos = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|d| d.as_nanos())
        .unwrap_or(0);
    for attempt in 0..100_u32 {
        let candidate = docsets_dir.join(format!(".tmp-install-{slug}-{pid}-{nanos}-{attempt}"));
        if !candidate.exists() {
            return candidate;
        }
    }
    docsets_dir.join(format!(".tmp-install-{slug}-{pid}-{nanos}-99"))
}

/// Limpieza conservadora al empezar: borra temporales de descargas,
/// extracciones o respaldos `.old` con más de una hora (nunca los
/// recientes: podría haber otra instalación en curso en este u otro
/// proceso). Un `.old` solo se borra si su final existe y es válido.
fn sweep_stale_temps(docsets_dir: &Path) {
    // FASE 0: solo medida.
    let t_sweep = std::time::Instant::now();
    let entries = match std::fs::read_dir(docsets_dir) {
        Ok(entries) => entries,
        Err(_) => return,
    };
    let old_enough = |path: &Path| {
        std::fs::metadata(path)
            .and_then(|meta| meta.modified())
            .ok()
            .and_then(|modified| SystemTime::now().duration_since(modified).ok())
            .is_some_and(|age| age.as_secs() > 3600)
    };
    for entry in entries.flatten() {
        let path = entry.path();
        if !path.is_dir() && !is_temp_file(&path) {
            continue;
        }
        let name = entry.file_name().to_string_lossy().into_owned();
        let is_tmp_dir = entry.file_type().map(|kind| kind.is_dir()).unwrap_or(false)
            && name.starts_with(".tmp-install-");
        // Respaldo de una instalación anterior: solo si el final sigue
        // en su sitio (el borrado diferido pudo no llegar a correr).
        let is_stale_old =
            name.ends_with(".docset.old") && path.is_dir() && sibling_final_exists(&path);
        if (is_tmp_dir || is_temp_file(&path) || is_stale_old) && old_enough(&path) {
            if path.is_dir() {
                let _ = std::fs::remove_dir_all(&path);
            } else {
                let _ = std::fs::remove_file(&path);
            }
        }
    }
    // FASE 0: solo medida.
    crate::profile::mark(
        "install",
        format_args!(
            "sweep dir={} ms={}",
            docsets_dir.display(),
            crate::profile::ms_since(t_sweep)
        ),
    );
}

/// `true` si junto a `<X>.docset.old` existe `<X>.docset` como
/// directorio (el respaldo ya no protege nada y puede barrerse).
fn sibling_final_exists(old_path: &Path) -> bool {
    let name = old_path
        .file_name()
        .map(|n| n.to_string_lossy())
        .unwrap_or_default();
    let Some(stem) = name.strip_suffix(".docset.old") else {
        return false;
    };
    let Some(parent) = old_path.parent() else {
        return false;
    };
    parent.join(format!("{stem}.docset")).is_dir()
}

/// Ficheros temporales propios (descargas a medias).
fn is_temp_file(path: &Path) -> bool {
    let name = path
        .file_name()
        .map(|n| n.to_string_lossy())
        .unwrap_or_default();
    (name.starts_with(".dl-") && name.ends_with(".part")) && path.is_file()
}

#[cfg(test)]
mod tests {
    use super::*;

    /// Docset falso mínimo (solo importan `id` y `root_path`).
    fn fake_docset(folder: &str, id: &str) -> Docset {
        Docset {
            id: id.to_string(),
            name: folder.to_string(),
            platform: None,
            version: None,
            bundle_id: None,
            home_path: None,
            icon: None,
            root_path: PathBuf::from(folder),
            contents_path: PathBuf::from(folder).join("Contents"),
        }
    }

    #[test]
    fn match_is_strict_on_folder_stem() {
        let installed = vec![
            fake_docset("/docs/C++.docset", "c"),
            fake_docset("/docs/Python_3.docset", "python-3"),
        ];
        // Coincide la carpeta exacta (insensible a mayúsculas).
        assert!(matches!(
            match_feed("C++", &installed),
            FeedMatch::One(d) if d.id == "c"
        ));
        assert!(matches!(
            match_feed("python_3", &installed),
            FeedMatch::One(d) if d.id == "python-3"
        ));
        // El slug NO vale: el feed `C` no debe reclamar el `C++` instalado.
        assert!(matches!(match_feed("C", &installed), FeedMatch::None));
        // Ni substrings ni nombres inventados.
        assert!(matches!(match_feed("Python", &installed), FeedMatch::None));
        assert!(matches!(match_feed("c++-2", &installed), FeedMatch::None));
    }

    #[test]
    fn match_reports_ambiguity() {
        // Dos variantes de mayúsculas solo coexisten en Linux; si el
        // sistema no las distingue, se salta (no es un fallo).
        let dir = tempfile::tempdir().expect("tempdir");
        let first = dir.path().join("Demo.docset");
        let second = dir.path().join("DEMO.docset");
        std::fs::create_dir(&first).expect("primera");
        if std::fs::create_dir(&second).is_err() {
            eprintln!("SKIP: el sistema no distingue mayúsculas");
            return;
        }
        let installed = vec![
            fake_docset(first.to_str().expect("utf8"), "demo"),
            fake_docset(second.to_str().expect("utf8"), "demo-2"),
        ];
        match match_feed("demo", &installed) {
            FeedMatch::Ambiguous(list) => assert_eq!(list.len(), 2),
            other => panic!("debería ser ambigua, fue {other:?}"),
        }
    }

    #[test]
    fn versions_compare_numerically_or_not_at_all() {
        use std::cmp::Ordering::*;
        assert_eq!(compare_versions("1.2.3", "1.2.3"), Some(Equal));
        assert_eq!(compare_versions("1.2.3", "1.2.10"), Some(Less));
        assert_eq!(compare_versions("3.12", "3.9"), Some(Greater));
        assert_eq!(compare_versions("1.0", "1.0.1"), Some(Less));
        // Letras, vacíos o basura: no comparable.
        assert_eq!(compare_versions("1.0a", "1.0b"), None);
        assert_eq!(compare_versions("abc", "def"), None);
        assert_eq!(compare_versions("", "1.0"), None);
        assert_eq!(compare_versions("1..2", "1.0"), None);
        assert_eq!(compare_versions("99999999999999999999.0", "1.0"), None);
    }

    #[test]
    fn update_available_is_tristate() {
        // Iguales → false (nunca "distinto = actualizar").
        assert_eq!(update_available(Some("1.0"), "1.0"), Some(false));
        // Disponible más reciente → true; instalada más reciente → false.
        assert_eq!(update_available(Some("1.2.3"), "1.2.10"), Some(true));
        assert_eq!(update_available(Some("2.0"), "1.9"), Some(false));
        // Instalada desconocida o no numéricas → null.
        assert_eq!(update_available(None, "1.0"), None);
        assert_eq!(update_available(Some("beta"), "rc"), None);
        assert_eq!(update_available(Some("1.0"), "beta"), None);
    }

    #[test]
    fn tgz_urls_only() {
        assert!(is_tgz_url("https://x.example/A.tgz"));
        assert!(is_tgz_url("https://x.example/A.TGZ?mirror=1"));
        assert!(is_tgz_url("https://x.example/A.tgz#frag"));
        assert!(!is_tgz_url("https://x.example/A.zip"));
        assert!(!is_tgz_url("https://x.example/A.tgz.txt"));
    }

    // --- Helpers de integración (servidor HTTP local + tgz sintético) ---

    /// Servidor HTTP mínimo con respuestas encoladas (una por conexión).
    struct MockServer {
        base: String,
    }

    impl MockServer {
        /// Lee una petición hasta fin de cabeceras.
        fn read_head(stream: &mut std::net::TcpStream) -> Vec<u8> {
            use std::io::Read;
            let _ = stream.set_read_timeout(Some(std::time::Duration::from_secs(5)));
            let mut request = Vec::new();
            let mut chunk = [0_u8; 1024];
            loop {
                match stream.read(&mut chunk) {
                    Ok(0) => break,
                    Ok(n) => {
                        request.extend_from_slice(&chunk[..n]);
                        if request.len() > 65_536 || request.windows(4).any(|w| w == b"\r\n\r\n") {
                            break;
                        }
                    }
                    Err(_) => break,
                }
            }
            request
        }

        fn start(responses: Vec<(u16, Vec<u8>)>) -> Self {
            use std::io::Write;
            use std::net::TcpListener;
            let listener = TcpListener::bind("127.0.0.1:0").expect("bind");
            let addr = listener.local_addr().expect("addr");
            listener.set_nonblocking(true).expect("nonblocking");
            std::thread::spawn(move || {
                let mut pending = responses.into_iter();
                let deadline = std::time::Instant::now() + std::time::Duration::from_secs(30);
                let mut served = 0_usize;
                let total = pending.len();
                while served < total && std::time::Instant::now() < deadline {
                    let (mut stream, _) = match listener.accept() {
                        Ok(pair) => pair,
                        Err(_) => {
                            std::thread::sleep(std::time::Duration::from_millis(5));
                            continue;
                        }
                    };
                    // El aceptado hereda el no-bloqueante en Windows:
                    // a bloqueante para leer/escribir sin carreras.
                    let _ = stream.set_nonblocking(false);
                    let Some((status, body)) = pending.next() else {
                        break;
                    };
                    let _ = Self::read_head(&mut stream);
                    let reason = if status == 200 { "OK" } else { "Not Found" };
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

        /// Sirve `body` con soporte de `Range` (206 + `Content-Range`).
        /// Sin `Range` responde 416 (obliga al cliente a pedir rangos y
        /// demuestra la reanudación). Hasta 4 conexiones.
        fn start_ranged(body: Vec<u8>) -> Self {
            use std::io::Write;
            use std::net::TcpListener;
            let listener = TcpListener::bind("127.0.0.1:0").expect("bind");
            let addr = listener.local_addr().expect("addr");
            listener.set_nonblocking(true).expect("nonblocking");
            std::thread::spawn(move || {
                let deadline = std::time::Instant::now() + std::time::Duration::from_secs(30);
                let mut served = 0_usize;
                while served < 4 && std::time::Instant::now() < deadline {
                    let (mut stream, _) = match listener.accept() {
                        Ok(pair) => pair,
                        Err(_) => {
                            std::thread::sleep(std::time::Duration::from_millis(5));
                            continue;
                        }
                    };
                    let _ = stream.set_nonblocking(false);
                    let head = String::from_utf8_lossy(&Self::read_head(&mut stream)).into_owned();
                    // Nombres de cabecera insensibles a mayúsculas
                    // (reqwest las envía en minúsculas).
                    let from: Option<u64> = head.lines().find_map(|line| {
                        let (name, value) = line.split_once(':')?;
                        if !name.eq_ignore_ascii_case("range") {
                            return None;
                        }
                        let rest = value.trim().strip_prefix("bytes=")?;
                        rest.split('-').next()?.parse::<u64>().ok()
                    });
                    let (status, chunk, extra) = match from {
                        Some(n) if (n as usize) < body.len() => (
                            206,
                            &body[n as usize..],
                            format!(
                                "Content-Range: bytes {}-{}/{}\r\n",
                                n,
                                body.len() - 1,
                                body.len()
                            ),
                        ),
                        _ => (416, &[][..], String::new()),
                    };
                    let reason = if status == 206 {
                        "Partial Content"
                    } else {
                        "Range Required"
                    };
                    let head = format!(
                        "HTTP/1.1 {status} {reason}\r\n{extra}Content-Length: {}\r\nConnection: close\r\n\r\n",
                        chunk.len()
                    );
                    let _ = stream.write_all(head.as_bytes());
                    let _ = stream.write_all(chunk);
                    served += 1;
                }
            });
            Self {
                base: format!("http://{addr}"),
            }
        }
    }

    /// Construye un `.tgz` clásico (`Raíz.docset/Contents/...`) y devuelve
    /// sus bytes. Con `valid = false` genera basura no-gzip.
    fn classic_tgz_bytes(root: &str, valid: bool) -> Vec<u8> {
        use flate2::write::GzEncoder;
        use flate2::Compression;
        if !valid {
            return b"esto no es un gzip".to_vec();
        }
        // dsidx mínimo real en un temporal.
        let dir = tempfile::tempdir().expect("tempdir");
        let dsidx_path = dir.path().join("docSet.dsidx");
        let conn = rusqlite::Connection::open(&dsidx_path).expect("dsidx");
        conn.execute_batch(
            "CREATE TABLE searchIndex(id INTEGER PRIMARY KEY, name TEXT, type TEXT, path TEXT);
             INSERT INTO searchIndex(name, type, path) VALUES ('cosa', 'Guide', 'cosa.html');",
        )
        .expect("poblar");
        drop(conn);
        let dsidx_bytes = std::fs::read(&dsidx_path).expect("leer dsidx");
        let plist = r#"<?xml version="1.0" encoding="UTF-8"?><plist version="1.0"><dict>
<key>CFBundleName</key><string>Demo</string>
<key>CFBundleShortVersionString</key><string>1.0</string>
<key>dashIndexFilePath</key><string>home.html</string>
</dict></plist>"#;
        // PNG mínimo válido en la raíz (como los feeds reales con icono).
        let mut icon = vec![0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A];
        icon.extend_from_slice(&13_u32.to_be_bytes());
        icon.extend_from_slice(b"IHDR");
        icon.extend_from_slice(&16_u32.to_be_bytes());
        icon.extend_from_slice(&16_u32.to_be_bytes());
        icon.extend_from_slice(&[8, 2, 0, 0, 0, 0, 0, 0, 0]);
        icon.extend_from_slice(b"IEND");
        let mut enc = GzEncoder::new(Vec::new(), Compression::fast());
        {
            let mut archive = tar::Builder::new(&mut enc);
            for (name, content) in [
                (
                    format!("{root}/Contents/Info.plist"),
                    plist.as_bytes().to_vec(),
                ),
                (
                    format!("{root}/Contents/Resources/docSet.dsidx"),
                    dsidx_bytes,
                ),
                (
                    format!("{root}/Contents/Resources/Documents/home.html"),
                    b"<html>home</html>".to_vec(),
                ),
                (
                    format!("{root}/Contents/Resources/Documents/cosa.html"),
                    b"<html>cosa</html>".to_vec(),
                ),
                (format!("{root}/icon.png"), icon),
            ] {
                let mut header = tar::Header::new_gnu();
                header.set_size(content.len() as u64);
                header.set_mode(0o644);
                header.set_cksum();
                archive
                    .append_data(&mut header, name, content.as_slice())
                    .expect("añadir");
            }
            archive.into_inner().expect("cerrar");
        }
        enc.finish().expect("finish")
    }

    fn test_entry(id: &str, urls: Vec<String>) -> FeedEntry {
        FeedEntry {
            id: id.to_string(),
            name: id.to_string(),
            version: "1.0".to_string(),
            urls,
        }
    }

    #[test]
    fn full_install_from_mock_mirror() {
        use std::sync::{Arc, Mutex};
        let tgz = classic_tgz_bytes("Demo.docset", true);
        let server = MockServer::start(vec![(200, tgz)]);
        let dir = tempfile::tempdir().expect("tempdir");
        let entry = test_entry("Demo", vec![format!("{}/Demo.tgz", server.base)]);
        let client = crate::catalog::feed::http_client().expect("cliente");
        let events: Arc<Mutex<Vec<ProgressReport>>> = Arc::new(Mutex::new(Vec::new()));
        let events_in = Arc::clone(&events);
        let installed = download_and_install(
            &client,
            &entry,
            dir.path(),
            // Misma base temporal: estos tests o traen icono propio o
            // fallan antes del paso Devicon (sin red en unitarios).
            dir.path(),
            &HashSet::new(),
            TarixLimits::default(),
            &move |report| {
                events_in.lock().expect("lock").push(report);
            },
        )
        .expect("instalar");
        // Carpeta canónica + metadatos del plist + índice reconocido.
        assert_eq!(installed.docset.id, "demo");
        assert_eq!(installed.docset.name, "Demo");
        assert_eq!(installed.docset.version.as_deref(), Some("1.0"));
        assert_eq!(installed.docset.home_path.as_deref(), Some("home.html"));
        assert_eq!(installed.entries.len(), 1);
        assert!(!installed.replaced);
        // El icono de la raíz del tgz sobrevive y se detecta.
        let icon = installed.docset.icon.as_deref().expect("icono");
        assert!(icon.starts_with("data:image/png;base64,"), "{icon}");
        assert!(dir.path().join("Demo.docset/icon.png").is_file());
        assert!(dir
            .path()
            .join("Demo.docset/Contents/Resources/Documents/home.html")
            .is_file());
        // Sin temporales propios atrás.
        assert!(std::fs::read_dir(dir.path()).expect("leer").all(|e| {
            let name = e
                .expect("entrada")
                .file_name()
                .to_string_lossy()
                .into_owned();
            !name.starts_with(".tmp-install-") && !name.starts_with(".dl-")
        }));
        // Progreso real: descarga con bytes y verificación.
        let events = events.lock().expect("lock");
        assert!(events
            .iter()
            .any(|e| e.stage == ProgressStage::Downloading && e.received_bytes > 0));
        assert!(events.iter().any(|e| e.stage == ProgressStage::Verifying));
    }

    #[test]
    fn mirrors_fall_through_and_fail_together() {
        let tgz = classic_tgz_bytes("Demo.docset", true);
        let server = MockServer::start(vec![(404, b"no".to_vec()), (200, tgz)]);
        let dir = tempfile::tempdir().expect("tempdir");
        let entry = test_entry(
            "Demo",
            vec![
                format!("{}/caido.tgz", server.base),
                format!("{}/Demo.tgz", server.base),
            ],
        );
        let client = crate::catalog::feed::http_client().expect("cliente");
        let installed = download_and_install(
            &client,
            &entry,
            dir.path(),
            // Misma base temporal: estos tests o traen icono propio o
            // fallan antes del paso Devicon (sin red en unitarios).
            dir.path(),
            &HashSet::new(),
            TarixLimits::default(),
            &|_| {},
        )
        .expect("el segundo mirror vale");
        assert_eq!(installed.docset.id, "demo");

        // Todos caídos → DownloadFailed con el HTTP.
        let server = MockServer::start(vec![(404, b"no".to_vec()), (500, b"mal".to_vec())]);
        let dir = tempfile::tempdir().expect("tempdir");
        let entry = test_entry(
            "Demo",
            vec![
                format!("{}/a.tgz", server.base),
                format!("{}/b.tgz", server.base),
            ],
        );
        let err = download_and_install(
            &client,
            &entry,
            dir.path(),
            // Misma base temporal: estos tests o traen icono propio o
            // fallan antes del paso Devicon (sin red en unitarios).
            dir.path(),
            &HashSet::new(),
            TarixLimits::default(),
            &|_| {},
        )
        .expect_err("debe fallar");
        assert!(matches!(err, InstallError::DownloadFailed { .. }), "{err}");
        assert!(err.to_string().contains("HTTP"), "{err}");
    }

    #[test]
    fn preconditions_reject_early() {
        let client = crate::catalog::feed::http_client().expect("cliente");
        let dir = tempfile::tempdir().expect("tempdir");
        // Carpeta inexistente.
        let err = download_and_install(
            &client,
            &test_entry("Demo", vec!["https://x.example/A.tgz".to_string()]),
            &dir.path().join("no-existe"),
            dir.path(),
            &HashSet::new(),
            TarixLimits::default(),
            &|_| {},
        )
        .expect_err("sin carpeta");
        assert!(matches!(err, InstallError::NoDocsetsDir { .. }));
        // Sin URLs.
        let err = download_and_install(
            &client,
            &test_entry("Demo", Vec::new()),
            dir.path(),
            // Misma base temporal: estos tests o traen icono propio o
            // fallan antes del paso Devicon (sin red en unitarios).
            dir.path(),
            &HashSet::new(),
            TarixLimits::default(),
            &|_| {},
        )
        .expect_err("sin urls");
        assert!(matches!(err, InstallError::NoDownloadUrl { .. }));
        // Solo zip → no soportado sin tocar la red.
        let err = download_and_install(
            &client,
            &test_entry("Demo", vec!["https://x.example/A.zip".to_string()]),
            dir.path(),
            // Misma base temporal: estos tests o traen icono propio o
            // fallan antes del paso Devicon (sin red en unitarios).
            dir.path(),
            &HashSet::new(),
            TarixLimits::default(),
            &|_| {},
        )
        .expect_err("zip");
        assert!(matches!(err, InstallError::UnsupportedPackage { .. }));
    }

    #[test]
    fn corrupt_package_never_becomes_valid() {
        let tgz = classic_tgz_bytes("Demo.docset", false);
        let server = MockServer::start(vec![(200, tgz)]);
        let dir = tempfile::tempdir().expect("tempdir");
        let entry = test_entry("Demo", vec![format!("{}/Demo.tgz", server.base)]);
        let client = crate::catalog::feed::http_client().expect("cliente");
        let err = download_and_install(
            &client,
            &entry,
            dir.path(),
            // Misma base temporal: estos tests o traen icono propio o
            // fallan antes del paso Devicon (sin red en unitarios).
            dir.path(),
            &HashSet::new(),
            TarixLimits::default(),
            &|_| {},
        )
        .expect_err("corrupto");
        assert!(matches!(err, InstallError::ExtractFailed { .. }), "{err}");
        assert!(
            !dir.path().join("Demo.docset").exists(),
            "nada parcial válido"
        );
    }

    #[test]
    fn non_docset_tgz_is_rejected() {
        // tgz válido pero sin estructura de docset.
        use flate2::write::GzEncoder;
        use flate2::Compression;
        let enc = GzEncoder::new(Vec::new(), Compression::fast());
        let mut archive = tar::Builder::new(enc);
        let content = b"hola";
        let mut header = tar::Header::new_gnu();
        header.set_size(content.len() as u64);
        header.set_mode(0o644);
        header.set_cksum();
        archive
            .append_data(&mut header, "Raiz/notas.txt", content.as_slice())
            .expect("añadir");
        let tgz = archive
            .into_inner()
            .expect("cerrar")
            .finish()
            .expect("finish");
        let server = MockServer::start(vec![(200, tgz)]);
        let dir = tempfile::tempdir().expect("tempdir");
        let entry = test_entry("Demo", vec![format!("{}/Demo.tgz", server.base)]);
        let client = crate::catalog::feed::http_client().expect("cliente");
        let err = download_and_install(
            &client,
            &entry,
            dir.path(),
            // Misma base temporal: estos tests o traen icono propio o
            // fallan antes del paso Devicon (sin red en unitarios).
            dir.path(),
            &HashSet::new(),
            TarixLimits::default(),
            &|_| {},
        )
        .expect_err("sin Contents");
        assert!(matches!(err, InstallError::InvalidPackage { .. }), "{err}");
    }

    #[test]
    fn malicious_roots_abort_without_final() {
        // Raíz múltiple: la validación de tarix aborta toda la extracción.
        use flate2::write::GzEncoder;
        use flate2::Compression;
        let enc = GzEncoder::new(Vec::new(), Compression::fast());
        let mut archive = tar::Builder::new(enc);
        for name in ["A/x.txt", "B/y.txt"] {
            let mut header = tar::Header::new_gnu();
            header.set_size(1);
            header.set_mode(0o644);
            header.set_cksum();
            archive
                .append_data(&mut header, name, b"x".as_slice())
                .expect("añadir");
        }
        let tgz = archive
            .into_inner()
            .expect("cerrar")
            .finish()
            .expect("finish");
        let server = MockServer::start(vec![(200, tgz)]);
        let dir = tempfile::tempdir().expect("tempdir");
        let entry = test_entry("Demo", vec![format!("{}/Demo.tgz", server.base)]);
        let client = crate::catalog::feed::http_client().expect("cliente");
        let err = download_and_install(
            &client,
            &entry,
            dir.path(),
            // Misma base temporal: estos tests o traen icono propio o
            // fallan antes del paso Devicon (sin red en unitarios).
            dir.path(),
            &HashSet::new(),
            TarixLimits::default(),
            &|_| {},
        )
        .expect_err("raíz múltiple");
        assert!(matches!(err, InstallError::ExtractFailed { .. }), "{err}");
        assert!(!dir.path().join("Demo.docset").exists());
    }

    /// Instalación previa válida en la carpeta destino.
    fn seed_previous_install(dir: &Path) {
        let tgz = classic_tgz_bytes("Seed.docset", true);
        // Extrae el tgz semilla (la raíz se quita: queda `tmp/Contents`).
        let tmp_tgz = dir.join("seed.tgz");
        std::fs::write(&tmp_tgz, tgz).expect("semilla");
        let tmp = dir.join("seed-tmp");
        unpack_validated(&tmp_tgz, &tmp, TarixLimits::default()).expect("extraer semilla");
        let target_parent = dir.join("Demo.docset");
        std::fs::create_dir(&target_parent).expect("padre");
        std::fs::rename(tmp.join("Contents"), target_parent.join("Contents")).expect("colocar");
        let _ = std::fs::remove_dir_all(&tmp);
        let _ = std::fs::remove_file(&tmp_tgz);
        // Marca reconocible de la versión anterior.
        let contents = target_parent.join("Contents");
        std::fs::write(
            contents.join("Resources/Documents/viejo.html"),
            "<html>v</html>",
        )
        .expect("marca");
        assert!(dir
            .join("Demo.docset/Contents/Resources/docSet.dsidx")
            .is_file());
    }

    #[test]
    fn failed_update_keeps_previous_install() {
        let dir = tempfile::tempdir().expect("tempdir");
        seed_previous_install(dir.path());
        // La "nueva versión" (2.0, distinta de la 1.0 instalada) llega corrupta:
        // no hay reutilización posible y debe fallar la extracción.
        let tgz = classic_tgz_bytes("Demo.docset", false);
        let server = MockServer::start(vec![(200, tgz)]);
        let mut entry = test_entry("Demo", vec![format!("{}/Demo.tgz", server.base)]);
        entry.version = "2.0".to_string();
        let client = crate::catalog::feed::http_client().expect("cliente");
        let err = download_and_install(
            &client,
            &entry,
            dir.path(),
            // Misma base temporal: estos tests o traen icono propio o
            // fallan antes del paso Devicon (sin red en unitarios).
            dir.path(),
            &HashSet::new(),
            TarixLimits::default(),
            &|_| {},
        )
        .expect_err("update corrupto");
        assert!(matches!(err, InstallError::ExtractFailed { .. }), "{err}");
        // La anterior sigue intacta (marca + índice).
        assert!(dir
            .path()
            .join("Demo.docset/Contents/Resources/Documents/viejo.html")
            .is_file());
        assert!(dir
            .path()
            .join("Demo.docset/Contents/Resources/docSet.dsidx")
            .is_file());
        assert!(
            !dir.path().join("Demo.docset.old").exists(),
            "sin restos del swap"
        );
    }

    #[test]
    fn orphan_old_is_recovered_then_replaced() {
        let dir = tempfile::tempdir().expect("tempdir");
        // Simula un crash entre renames: sin final, con `.old` válido.
        seed_previous_install(dir.path());
        std::fs::rename(
            dir.path().join("Demo.docset"),
            dir.path().join("Demo.docset.old"),
        )
        .expect("simular crash");
        let tgz = classic_tgz_bytes("Demo.docset", true);
        let server = MockServer::start(vec![(200, tgz)]);
        let entry = test_entry("Demo", vec![format!("{}/Demo.tgz", server.base)]);
        let client = crate::catalog::feed::http_client().expect("cliente");
        let installed = download_and_install(
            &client,
            &entry,
            dir.path(),
            // Misma base temporal: estos tests o traen icono propio o
            // fallan antes del paso Devicon (sin red en unitarios).
            dir.path(),
            &HashSet::new(),
            TarixLimits::default(),
            &|_| {},
        )
        .expect("recupera y sustituye");
        assert!(installed.replaced, "había instalación previa (restaurada)");
        assert!(dir
            .path()
            .join("Demo.docset/Contents/Resources/docSet.dsidx")
            .is_file());
        // B4: el respaldo ya no se borra en el camino crítico; viaja en
        // `stale_backup` para borrado diferido (el comando lo hace en fondo).
        assert_eq!(
            installed.stale_backup.as_deref(),
            Some(dir.path().join("Demo.docset.old").as_path()),
            "respaldo pendiente de borrado diferido"
        );
        assert!(dir.path().join("Demo.docset.old").is_dir());
    }

    #[test]
    fn same_version_valid_install_reuses_without_download() {
        let dir = tempfile::tempdir().expect("tempdir");
        seed_previous_install(dir.path()); // 1.0 válida en disco
                                           // Servidor sin respuestas: cualquier intento de red fallaría.
        let server = MockServer::start(vec![]);
        let entry = test_entry("Demo", vec![format!("{}/Demo.tgz", server.base)]);
        let client = crate::catalog::feed::http_client().expect("cliente");
        let installed = download_and_install(
            &client,
            &entry,
            dir.path(),
            dir.path(),
            &HashSet::new(),
            TarixLimits::default(),
            &|_| {},
        )
        .expect("reutiliza sin descargar");
        assert_eq!(installed.docset.version.as_deref(), Some("1.0"));
        assert_eq!(installed.entries.len(), 1);
        assert!(!installed.replaced, "mismos bits: nada sustituido");
        assert!(installed.source_url.is_none());
        // Sin descarga no hay parciales nuevos.
        let parts: Vec<_> = std::fs::read_dir(dir.path())
            .expect("leer")
            .flatten()
            .filter(|e| e.file_name().to_string_lossy().ends_with(".part"))
            .collect();
        assert!(parts.is_empty(), "{parts:?}");
    }

    #[test]
    fn resume_continues_partial_from_same_mirror() {
        let tgz = classic_tgz_bytes("Demo.docset", true);
        // Solo sirve rangos: sin `Range` responde 416 (así se demuestra
        // que el cliente reanuda en vez de descargar entero).
        let server = MockServer::start_ranged(tgz.clone());
        let dir = tempfile::tempdir().expect("tempdir");
        let url = format!("{}/Demo.tgz", server.base);
        let entry = test_entry("Demo", vec![url.clone()]);
        // Parcial previo: primera mitad del tgz.
        let part = part_path_for(dir.path(), "demo", &url);
        std::fs::write(&part, &tgz[..tgz.len() / 2]).expect("parcial");
        let client = crate::catalog::feed::http_client().expect("cliente");
        let installed = download_and_install(
            &client,
            &entry,
            dir.path(),
            dir.path(),
            &HashSet::new(),
            TarixLimits::default(),
            &|_| {},
        )
        .expect("reanuda");
        assert_eq!(installed.entries.len(), 1);
        assert!(installed.source_url.as_deref() == Some(url.as_str()));
        // El parcial ganador se borra al instalar.
        assert!(!part.exists());
    }

    #[test]
    fn unsatisfiable_range_fails_without_leftovers() {
        let dir = tempfile::tempdir().expect("tempdir");
        // Dos 416: el intento con Range y el reintento en limpio.
        let server = MockServer::start(vec![
            (416, b"fuera de rango".to_vec()),
            (416, b"fuera de rango".to_vec()),
        ]);
        let url = format!("{}/Demo.tgz", server.base);
        let entry = test_entry("Demo", vec![url.clone()]);
        let part = part_path_for(dir.path(), "demo", &url);
        std::fs::write(&part, b"basura previa").expect("parcial");
        let client = crate::catalog::feed::http_client().expect("cliente");
        let err = download_and_install(
            &client,
            &entry,
            dir.path(),
            dir.path(),
            &HashSet::new(),
            TarixLimits::default(),
            &|_| {},
        )
        .expect_err("416");
        assert!(matches!(err, InstallError::DownloadFailed { .. }), "{err}");
        assert!(err.to_string().contains("416"), "{err}");
        assert!(!part.exists(), "el parcial inservible se borra");
        assert!(!dir.path().join("Demo.docset").exists());
    }

    #[test]
    fn slow_threshold_marks_trickles() {
        assert!(!is_slow(0, 0));
        assert!(!is_slow(14_999, 0));
        assert!(is_slow(15_000, 0), "parado tras la gracia");
        assert!(!is_slow(20_000, 2_000_000), "100 KB/s sigue");
        assert!(is_slow(20_000, 100_000), "5 KB/s se abandona");
        assert!(!is_slow(20_000, 1_310_720), "justo en el umbral sigue");
    }

    #[test]
    fn mirror_helpers_route_and_isolate() {
        assert_eq!(
            url_host("https://SANFRANCISCO.kapeli.com/feeds/X.tgz").as_deref(),
            Some("sanfrancisco.kapeli.com")
        );
        assert_eq!(url_host("http://h:8080/x").as_deref(), Some("h"));
        for bad in ["", "sin-esquema", "https://", "https:///x"] {
            assert_eq!(url_host(bad), None, "{bad}");
        }
        let urls = vec![
            "http://london.kapeli.com/feeds/A.tgz".to_string(),
            "http://sanfrancisco.kapeli.com/feeds/A.tgz".to_string(),
            "http://newyork.kapeli.com/feeds/A.tgz".to_string(),
        ];
        let ordered = order_mirrors(&urls, Some("sanfrancisco.kapeli.com"));
        assert_eq!(
            ordered,
            vec![urls[1].clone(), urls[0].clone(), urls[2].clone()]
        );
        // Sin dato o con host ausente: orden intacto.
        assert_eq!(order_mirrors(&urls, None), urls);
        assert_eq!(order_mirrors(&urls, Some("tokyo.kapeli.com")), urls);
        // Un parcial por URL: sin mezclas entre espejos.
        let dir = tempfile::tempdir().expect("tempdir");
        let a = part_path_for(dir.path(), "demo", &urls[0]);
        let b = part_path_for(dir.path(), "demo", &urls[1]);
        assert_ne!(a, b);
        assert_eq!(part_path_for(dir.path(), "demo", &urls[0]), a);
        let name = a
            .file_name()
            .map(|n| n.to_string_lossy().into_owned())
            .unwrap_or_default();
        assert!(
            name.starts_with(".dl-demo-") && name.ends_with(".part"),
            "{name}"
        );
    }
}
