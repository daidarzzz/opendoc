//! Errores serializables de los comandos Tauri (T6).
//!
//! Unión discriminada por `kind` para que el frontend la distinga sin
//! parsear strings. Mensajes claros en inglés (el frontend los traduce por
//! `kind`); nunca `String` genérico.

use serde::Serialize;

/// Error de un comando de OpenDoc.
#[derive(Debug, thiserror::Error, Serialize)]
#[serde(tag = "kind", rename_all = "snake_case")]
pub enum ApiError {
    /// La ruta no existe o no es un directorio.
    #[error("directory does not exist or is not a directory: {path}")]
    InvalidDir {
        /// Ruta rechazada.
        path: String,
    },
    /// Ningún docset cargado tiene ese id.
    #[error("unknown docset: {id}")]
    UnknownDocset {
        /// Id solicitado.
        id: String,
    },
    /// El docset no tiene página de inicio conocida.
    #[error("docset has no home page: {id}")]
    NoHomePage {
        /// Id del docset.
        id: String,
    },
    /// Fallo interno cargando docsets (p. ej. el hilo de carga falló).
    #[error("failed loading docsets: {message}")]
    LoadFailed {
        /// Detalle del fallo.
        message: String,
    },
    /// Ya hay una extracción en curso para ese id.
    #[error("extraction in progress: {id}")]
    ExtractionInProgress {
        /// Id del docset.
        id: String,
    },
    /// No hay repositorio de feeds configurado.
    #[error("no feed repository configured")]
    NoFeedRepo,
    /// Fallo descargando o parseando el catálogo de feeds.
    #[error("catalog failed: {message}")]
    FeedFailed {
        /// Detalle del fallo.
        message: String,
    },
    /// Sin carpeta de docsets configurada (`path` nulo) o que dejó de
    /// existir (`path` con la ruta).
    #[error("no docsets folder configured")]
    NoDocsetsDir {
        /// Ruta que falta (`None` = nunca se configuró).
        path: Option<String>,
    },
    /// El catálogo no se ha descargado todavía.
    #[error("catalog not downloaded yet")]
    CatalogMissing,
    /// Ninguna entrada del catálogo tiene ese id.
    #[error("unknown catalog entry: {id}")]
    UnknownFeed {
        /// Id solicitado.
        id: String,
    },
    /// La entrada no trae URL de descarga utilizable.
    #[error("entry has no usable download URL: {id}")]
    NoDownloadUrl {
        /// Id del feed.
        id: String,
    },
    /// Ninguna URL es un `.tgz` (único formato de F2).
    #[error("unsupported format (only .tgz): {id}")]
    UnsupportedPackage {
        /// Id del feed.
        id: String,
    },
    /// Ya instalado y sin `force` (reinstalar pide confirmación).
    #[error("docset already installed: {id} (use force to reinstall)")]
    AlreadyInstalled {
        /// Id del feed.
        id: String,
    },
    /// Varias carpetas coinciden con el feed: no se elige ninguna.
    #[error("ambiguous install: {id} matches several docsets")]
    AmbiguousMatch {
        /// Id del feed.
        id: String,
        /// Ids de los docsets candidatos.
        candidates: Vec<String>,
    },
    /// Ya hay una instalación en curso para ese feed.
    #[error("install already in progress: {id}")]
    InstallInProgress {
        /// Id del feed.
        id: String,
    },
    /// Todas las URLs fallaron (red o HTTP).
    #[error("download failed for {id}: {message}")]
    DownloadFailed {
        /// Id del feed.
        id: String,
        /// Detalle.
        message: String,
    },
    /// El `.tgz` no se pudo extraer (corrupto, malicioso, límites...).
    #[error("extraction failed for {id}: {message}")]
    ExtractFailed {
        /// Id del feed.
        id: String,
        /// Detalle.
        message: String,
    },
    /// Extraído pero sin estructura de docset clásico.
    #[error("invalid package (not a classic docset): {id}: {message}")]
    InvalidPackage {
        /// Id del feed.
        id: String,
        /// Detalle.
        message: String,
    },
    /// Fallo colocando la instalación (disco o renombrados).
    #[error("install failed for {id}: {message}")]
    InstallFailed {
        /// Id del feed.
        id: String,
        /// Detalle.
        message: String,
    },
}

/// Errores de `docset::install` tal cual hacia el frontend (mismos
/// nombres y campos: el contrato no cambia entre capas).
impl From<crate::docset::InstallError> for ApiError {
    fn from(error: crate::docset::InstallError) -> Self {
        match error {
            crate::docset::InstallError::NoDocsetsDir { path } => ApiError::NoDocsetsDir {
                path: Some(path.display().to_string()),
            },
            crate::docset::InstallError::NoDownloadUrl { id } => ApiError::NoDownloadUrl { id },
            crate::docset::InstallError::UnsupportedPackage { id } => {
                ApiError::UnsupportedPackage { id }
            }
            crate::docset::InstallError::DownloadFailed { id, message } => {
                ApiError::DownloadFailed { id, message }
            }
            crate::docset::InstallError::ExtractFailed { id, message } => {
                ApiError::ExtractFailed { id, message }
            }
            crate::docset::InstallError::InvalidPackage { id, message } => {
                ApiError::InvalidPackage { id, message }
            }
            crate::docset::InstallError::InstallFailed { id, message } => {
                ApiError::InstallFailed { id, message }
            }
        }
    }
}
