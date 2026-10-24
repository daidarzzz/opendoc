//! Escaneo de carpetas `.docset` (T2). La lectura de `Info.plist` (T3),
//! de los índices SQLite (T4) y la extracción tarix viven en el núcleo
//! compartido (`opendoc_core::docset`), re-exportado aquí.
//!
//! Solo la instalación desde catálogo (`install`) y el *fallback* de
//! iconos (`devicon`) son específicos de la app: usan red/caché local y
//! tipos de Tauri.

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
