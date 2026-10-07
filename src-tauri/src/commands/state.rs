//! Estado compartido de Tauri (T6): docsets cargados + índice en memoria.
//!
//! Todo vive tras un `Mutex`: la búsqueda necesita `&mut SearchIndex`
//! (reutiliza el scratch de nucleo) y las cargas sustituyen el contenido.
//! Los comandos solo leen o sustituyen este estado; la lógica está en
//! `service.rs`.

use std::path::PathBuf;
use std::sync::Mutex;

use crate::docset::{Docset, ScanIssue};
use crate::search::SearchIndex;
use crate::settings::Settings;

/// Docsets cargados, issues del escaneo e índice de búsqueda.
pub struct Loaded {
    /// Carpeta de la que se cargó (persistida en ajustes al cargar OK).
    pub source_dir: PathBuf,
    /// Docsets válidos ordenados por nombre.
    pub docsets: Vec<Docset>,
    /// Entradas saltadas con su motivo.
    pub issues: Vec<ScanIssue>,
    /// Índice en memoria de los docsets abribles.
    pub index: SearchIndex,
}

impl Default for Loaded {
    fn default() -> Self {
        Self {
            source_dir: PathBuf::new(),
            docsets: Vec::new(),
            issues: Vec::new(),
            index: SearchIndex::new(),
        }
    }
}

impl std::fmt::Debug for Loaded {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        f.debug_struct("Loaded")
            .field("source_dir", &self.source_dir)
            .field("docsets", &self.docsets)
            .field("issues", &self.issues)
            .field("entries", &self.index.len())
            .finish()
    }
}

/// Estado gestionado por Tauri (`manage` en `lib.rs`).
pub struct AppState {
    /// Contenido cargado; vacío hasta el primer `set_docsets_dir`.
    pub loaded: Mutex<Loaded>,
    /// Ajustes persistentes (T9).
    pub settings: Mutex<Settings>,
}

impl Default for AppState {
    fn default() -> Self {
        Self {
            loaded: Mutex::new(Loaded::default()),
            settings: Mutex::new(Settings::default()),
        }
    }
}
