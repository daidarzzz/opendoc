//! Desktop docset integration and re-exports from `opendoc-core`.
//!
//! The core owns filesystem discovery, metadata, SQLite indexes and tarix
//! extraction. The desktop crate adds catalog installers and icon fallback.

pub mod devdocs;
pub mod devicon;
pub mod install;

pub use opendoc_core::docset::*;

pub(crate) use install::folder_stem;
pub use install::{
    compare_versions, download_and_install, match_feed, update_available, FeedMatch, InstallError,
    InstalledDocset, ProgressReport, ProgressStage,
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
