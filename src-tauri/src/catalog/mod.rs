//! Catálogo de docsets descargables (F1): caché local en JSON.
//!
//! Sin SQLite propia: son cientos de registros y la caché se regenera del
//! repo (ausente o corrupta → `None`, el siguiente refresco la recrea).
//! El repo configurado vive en `Settings::feed_url`; aquí solo el fichero.

use std::path::{Path, PathBuf};

use serde::{Deserialize, Serialize};

pub mod feed;

pub use feed::{FeedEntry, FeedError, RepoRef};

/// Catálogo descargado de un repo de feeds.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub struct Catalog {
    /// Repo normalizado (`owner/name`).
    pub repo: String,
    /// Segundos epoch de la descarga.
    pub fetched_at: u64,
    /// Entradas ordenadas por nombre.
    pub entries: Vec<FeedEntry>,
}

/// Fichero de caché dentro del directorio de datos de la app.
pub fn catalog_file(base_dir: &Path) -> PathBuf {
    base_dir.join("catalog.json")
}

/// Carga la caché o `None` (ausente, ilegible o corrupta: regenerable).
pub fn load_catalog(path: &Path) -> Option<Catalog> {
    let bytes = std::fs::read(path).ok()?;
    serde_json::from_slice::<Catalog>(&bytes).ok()
}

/// Guarda la caché (atómica: temporal + rename, crea el padre).
pub fn save_catalog(path: &Path, catalog: &Catalog) -> std::io::Result<()> {
    let json = serde_json::to_string_pretty(catalog).map_err(std::io::Error::other)?;
    if let Some(parent) = path.parent() {
        std::fs::create_dir_all(parent)?;
    }
    let tmp = path.with_extension("json.tmp");
    std::fs::write(&tmp, json)?;
    std::fs::rename(&tmp, path)?;
    Ok(())
}

/// Segundos epoch actuales (para `fetched_at`).
pub fn now_epoch() -> u64 {
    std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .map(|d| d.as_secs())
        .unwrap_or(0)
}

#[cfg(test)]
mod tests {
    use super::*;

    fn sample() -> Catalog {
        Catalog {
            repo: "zealdocs/feeds".to_string(),
            fetched_at: 1_700_000_000,
            entries: vec![super::feed::FeedEntry {
                id: "CSS".to_string(),
                name: "CSS".to_string(),
                version: "1".to_string(),
                urls: vec!["https://a.example/CSS.tgz".to_string()],
            }],
        }
    }

    #[test]
    fn roundtrip_and_missing_is_none() {
        let dir = tempfile::tempdir().expect("tempdir");
        let path = dir.path().join("catalog.json");
        assert!(load_catalog(&path).is_none());
        save_catalog(&path, &sample()).expect("guardar");
        assert_eq!(load_catalog(&path), Some(sample()));
    }

    #[test]
    fn corrupt_is_none_not_error() {
        let dir = tempfile::tempdir().expect("tempdir");
        let path = dir.path().join("catalog.json");
        std::fs::write(&path, "{ roto").expect("escribir");
        assert!(load_catalog(&path).is_none());
    }
}
