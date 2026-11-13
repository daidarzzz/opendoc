//! Shared state owned by the desktop runtime.
//!
//! The library and search index are replaced together under the loaded-state
//! mutex. Search also needs mutable access because the matcher reuses scratch
//! space. Keep the lock scope short when an operation performs disk or network I/O.

use std::collections::HashSet;
use std::path::PathBuf;
use std::sync::Mutex;

use super::install_queue::InstallQueue;
use crate::docset::{Docset, PendingTarix, ScanIssue};
use crate::search::SearchIndex;
use crate::settings::Settings;

/// A consistent snapshot of the loaded library and its search index.
pub struct Loaded {
    /// Library directory, persisted after a successful load.
    pub source_dir: PathBuf,
    /// Valid docsets sorted by name.
    pub docsets: Vec<Docset>,
    /// Compressed docsets waiting to be extracted.
    pub pending: Vec<PendingTarix>,
    /// Skipped entries and the reasons they were skipped.
    pub issues: Vec<ScanIssue>,
    /// In-memory index for docsets available to open.
    pub index: SearchIndex,
}

impl Default for Loaded {
    fn default() -> Self {
        Self {
            source_dir: PathBuf::new(),
            docsets: Vec::new(),
            pending: Vec::new(),
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
            .field("pending", &self.pending)
            .field("issues", &self.issues)
            .field("entries", &self.index.len())
            .finish()
    }
}

/// Application state registered with Tauri during setup.
pub struct AppState {
    /// Library contents, initially empty until the first directory load.
    pub loaded: Mutex<Loaded>,
    /// Persistent application settings.
    pub settings: Mutex<Settings>,
    /// Docset IDs currently being extracted, used to reject duplicates.
    pub extracting: Mutex<HashSet<String>>,
    /// Reserved feed IDs prevent two concurrent requests for the same feed.
    pub installing: Mutex<HashSet<String>>,
    /// Running installs and the FIFO queue of waiting requests.
    pub install_queue: Mutex<InstallQueue>,
}

impl Default for AppState {
    fn default() -> Self {
        Self {
            loaded: Mutex::new(Loaded::default()),
            settings: Mutex::new(Settings::default()),
            extracting: Mutex::new(HashSet::new()),
            installing: Mutex::new(HashSet::new()),
            install_queue: Mutex::new(InstallQueue::default()),
        }
    }
}
