//! Modelo de datos del inventario de docsets.
//!
//! En T2 el escáner solo deriva `id` y `name` del nombre de la carpeta;
//! `platform` y `version` quedan en `None` y las rellena T3 desde
//! `Info.plist`.

use serde::{Deserialize, Serialize};
use std::path::PathBuf;

/// Un docset detectado en disco.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub struct Docset {
    /// Slug estable y seguro para URL, derivado del nombre de la carpeta.
    /// Colisiones resueltas con sufijo `-2`, `-3`... (ver `scanner`).
    pub id: String,
    /// Nombre derivado de la carpeta sin la extensión `.docset` (T2).
    /// T3 puede refinarlo con `CFBundleName` de `Info.plist`.
    pub name: String,
    /// Familia de plataforma (`DocSetPlatformFamily`). La rellena T3.
    pub platform: Option<String>,
    /// Versión del docset. La rellena T3.
    pub version: Option<String>,
    /// Ruta a `<Nombre>.docset/`.
    pub root_path: PathBuf,
    /// Ruta a `<Nombre>.docset/Contents/`.
    pub contents_path: PathBuf,
}

/// Motivo por el que una entrada `*.docset` se saltó durante el escaneo.
#[derive(Debug, Clone, PartialEq, Eq)]
pub enum IssueKind {
    /// Existe un `*.docset` que no es un directorio.
    NotDirectory,
    /// Falta `Contents/`.
    MissingContents,
    /// Falta `Contents/Resources/Documents/`.
    MissingDocuments,
    /// Falta `Contents/Resources/docSet.dsidx`.
    MissingIndex,
    /// No se pudo leer una entrada de la carpeta raíz.
    EntryUnreadable,
}

impl std::fmt::Display for IssueKind {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        match self {
            IssueKind::NotDirectory => write!(f, "no es un directorio"),
            IssueKind::MissingContents => write!(f, "falta Contents/"),
            IssueKind::MissingDocuments => {
                write!(f, "falta Contents/Resources/Documents/")
            }
            IssueKind::MissingIndex => {
                write!(f, "falta Contents/Resources/docSet.dsidx")
            }
            IssueKind::EntryUnreadable => {
                write!(f, "no se pudo leer la entrada")
            }
        }
    }
}

/// Entrada problemática registrada sin abortar el escaneo.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct ScanIssue {
    /// Ruta de la entrada que causó el problema.
    pub path: PathBuf,
    /// Motivo del salto.
    pub kind: IssueKind,
}

/// Resultado del escaneo de una carpeta de docsets.
#[derive(Debug, Clone, Default)]
pub struct ScanReport {
    /// Docsets válidos, ordenados por nombre (orden determinista).
    pub docsets: Vec<Docset>,
    /// Entradas saltadas con su motivo.
    pub issues: Vec<ScanIssue>,
}

/// Error fatal del escaneo: solo si la raíz no existe o no se puede leer.
/// Cualquier problema *dentro* de la carpeta va a `ScanReport::issues`.
#[derive(Debug, thiserror::Error)]
pub enum ScanError {
    /// La carpeta raíz no existe.
    #[error("la carpeta de docsets no existe: {}", path.display())]
    RootNotFound {
        /// Ruta raíz que se intentó escanear.
        path: PathBuf,
    },
    /// La carpeta raíz no se puede leer.
    #[error("no se puede leer la carpeta de docsets: {}", path.display())]
    RootUnreadable {
        /// Ruta raíz que se intentó escanear.
        path: PathBuf,
        /// Error de E/S subyacente.
        #[source]
        source: std::io::Error,
    },
}
