//! Escaneo de carpetas `.docset` (T2). La lectura de `Info.plist`
//! (T3) y de los índices SQLite (T4) viven en sus propios módulos.
//!
//! Toda la lógica es independiente de Tauri y está cubierta por tests.
//! Los docsets son entrada no confiable: lo corrupto se registra en
//! `ScanReport::issues` sin abortar el escaneo.

pub mod index;
pub mod model;
pub mod plist;
pub mod scanner;

pub use index::{read_index, IndexData, IndexError, IndexSchema};
pub use model::{Docset, Entry, IssueKind, ScanError, ScanIssue, ScanReport};
pub use scanner::scan_dir;
