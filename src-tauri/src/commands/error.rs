//! Errores serializables de los comandos Tauri (T6).
//!
//! Unión discriminada por `kind` para que el frontend la distinga sin
//! parsear strings. Mensajes claros en español; nunca `String` genérico.

use serde::Serialize;

/// Error de un comando de OpenDoc.
#[derive(Debug, thiserror::Error, Serialize)]
#[serde(tag = "kind", rename_all = "snake_case")]
pub enum ApiError {
    /// La ruta no existe o no es un directorio.
    #[error("la carpeta no existe o no es un directorio: {path}")]
    InvalidDir {
        /// Ruta rechazada.
        path: String,
    },
    /// Ningún docset cargado tiene ese id.
    #[error("docset desconocido: {id}")]
    UnknownDocset {
        /// Id solicitado.
        id: String,
    },
    /// El docset no tiene página de inicio conocida.
    #[error("el docset no tiene página de inicio: {id}")]
    NoHomePage {
        /// Id del docset.
        id: String,
    },
    /// Fallo interno cargando docsets (p. ej. el hilo de carga falló).
    #[error("fallo cargando docsets: {message}")]
    LoadFailed {
        /// Detalle del fallo.
        message: String,
    },
    /// Ya hay una extracción en curso para ese id.
    #[error("extracción en curso: {id}")]
    ExtractionInProgress {
        /// Id del docset.
        id: String,
    },
    /// No hay repositorio de feeds configurado.
    #[error("sin repositorio de feeds (configúralo primero)")]
    NoFeedRepo,
    /// Fallo descargando o parseando el catálogo de feeds.
    #[error("fallo del catálogo: {message}")]
    FeedFailed {
        /// Detalle del fallo.
        message: String,
    },
    /// Sin carpeta de docsets configurada (`path` nulo) o que dejó de
    /// existir (`path` con la ruta).
    #[error("sin carpeta de docsets (elige una primero)")]
    NoDocsetsDir {
        /// Ruta que falta (`None` = nunca se configuró).
        path: Option<String>,
    },
    /// El catálogo no se ha descargado todavía.
    #[error("sin catálogo descargado (refréscalo primero)")]
    CatalogMissing,
    /// Ninguna entrada del catálogo tiene ese id.
    #[error("entrada desconocida en el catálogo: {id}")]
    UnknownFeed {
        /// Id solicitado.
        id: String,
    },
    /// La entrada no trae URL de descarga utilizable.
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
    /// Ya instalado y sin `force` (reinstalar pide confirmación).
    #[error("el docset ya está instalado: {id} (usa force para reinstalar)")]
    AlreadyInstalled {
        /// Id del feed.
        id: String,
    },
    /// Varias carpetas coinciden con el feed: no se elige ninguna.
    #[error("instalación ambigua: {id} coincide con varios docsets")]
    AmbiguousMatch {
        /// Id del feed.
        id: String,
        /// Ids de los docsets candidatos.
        candidates: Vec<String>,
    },
    /// Ya hay una instalación en curso para ese feed.
    #[error("instalación en curso: {id}")]
    InstallInProgress {
        /// Id del feed.
        id: String,
    },
    /// Todas las URLs fallaron (red o HTTP).
    #[error("fallo descargando {id}: {message}")]
    DownloadFailed {
        /// Id del feed.
        id: String,
        /// Detalle.
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
    /// Fallo colocando la instalación (disco o renombrados).
    #[error("fallo instalando {id}: {message}")]
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
