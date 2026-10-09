//! Escaneo de carpetas `.docset` (T2). La lectura de `Info.plist`
//! (T3) y de los índices SQLite (T4) viven en sus propios módulos.
//!
//! Toda la lógica es independiente de Tauri y está cubierta por tests.
//! Los docsets son entrada no confiable: lo corrupto se registra en
//! `ScanReport::issues` sin abortar el escaneo.

pub mod devicon;
pub mod icon;
pub mod index;
pub mod install;
pub mod model;
pub mod plist;
pub mod scanner;
pub mod tarix;

pub use icon::{icon_data_url_for, MAX_ICON_BYTES, MAX_ICON_DIM};
pub use index::{read_index, IndexData, IndexError, IndexSchema};
pub(crate) use install::folder_stem;
pub use install::{
    compare_versions, download_and_install, match_feed, update_available, FeedMatch, InstallError,
    InstalledDocset, ProgressReport, ProgressStage,
};
pub use model::{Docset, Entry, IssueKind, PendingTarix, ScanError, ScanIssue, ScanReport};
pub use plist::{apply_to_docset, read_info_plist};
pub use scanner::scan_dir;
pub use tarix::{
    cache_dir_for, cleanup_stale_cache, ensure_extracted, ExtractOutcome, ExtractStatus,
    TarixError, TarixLimits,
};

/// Ruta a una fixture real o `None` si no está descargada (con aviso).
/// Las fixtures están en `.gitignore`: quien clone sin ellas ve `SKIP`
/// (con `cargo test -- --nocapture`), no un fallo.
#[cfg(test)]
pub(crate) fn fixture_or_skip(relative: &str) -> Option<std::path::PathBuf> {
    let path = std::path::PathBuf::from("tests/fixtures").join(relative);
    if path.exists() {
        Some(path)
    } else {
        eprintln!("SKIP: falta la fixture {relative} (ver src-tauri/tests/fixtures/README.md)");
        None
    }
}
