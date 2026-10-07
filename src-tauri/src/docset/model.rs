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
    /// `CFBundleIdentifier`. Lo rellena T3.
    pub bundle_id: Option<String>,
    /// Página de inicio relativa a `Documents/` (`dashIndexFilePath` o
    /// `index.html`). Lo rellena T3; T4 lo completa si falta.
    pub home_path: Option<String>,
    /// Ruta a `<Nombre>.docset/`.
    pub root_path: PathBuf,
    /// Ruta a `<Nombre>.docset/Contents/`.
    pub contents_path: PathBuf,
}

/// Una entrada del índice normalizada (SPEC §3.3, ambos esquemas).
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub struct Entry {
    /// Slug del docset al que pertenece.
    pub docset_id: String,
    /// Nombre mostrado.
    pub name: String,
    /// Tipo normalizado (`Class`, `Function`...) u original si no se reconoce.
    pub kind: String,
    /// Ruta relativa a `Documents/`, con ancla `#...` si la hay.
    pub path: String,
}

/// Motivo por el que una entrada `*.docset` se saltó durante el escaneo.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub enum IssueKind {
    /// Existe un `*.docset` que no es un directorio.
    NotDirectory,
    /// Falta `Contents/`.
    MissingContents,
    /// Falta `Contents/Resources/Documents/`.
    MissingDocuments,
    /// Falta `Contents/Resources/docSet.dsidx`.
    MissingIndex,
    /// `Contents/Info.plist` existe pero es ilegible (se conservan los
    /// valores por defecto del escaneo).
    InvalidInfoPlist,
    /// El `docSet.dsidx` es ilegible o su esquema no se reconoce (el
    /// docset se conserva sin página de inicio del índice).
    InvalidIndex,
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
            IssueKind::InvalidInfoPlist => {
                write!(f, "Contents/Info.plist ilegible")
            }
            IssueKind::InvalidIndex => {
                write!(f, "índice ilegible o no reconocido")
            }
            IssueKind::EntryUnreadable => {
                write!(f, "no se pudo leer la entrada")
            }
        }
    }
}

/// Entrada problemática registrada sin abortar el escaneo.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub struct ScanIssue {
    /// Ruta de la entrada que causó el problema.
    pub path: PathBuf,
    /// Motivo del salto.
    pub kind: IssueKind,
}

/// Resultado del escaneo de una carpeta de docsets.
#[derive(Debug, Clone, Default, Serialize, Deserialize)]
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
