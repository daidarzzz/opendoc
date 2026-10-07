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
}
