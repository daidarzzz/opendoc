//! Catálogo de DevDocs: la fuente por defecto de OpenDoc.
//!
//! `https://devdocs.io/docs.json` lista todas las documentaciones con su
//! versión, fecha de actualización, tamaño y atribución. Cada una se ofrece
//! como una [`FeedEntry`] con `devdocs: Some(..)`; al instalarla, la app
//! descarga `index.json` + `db.json` y los convierte a un docset estándar
//! (ver `opendoc_core::devdocs`).
//!
//! Es una sola petición (sin límite de la API de GitHub), por eso se
//! refresca siempre y no necesita configuración.

use std::io::Read;

use opendoc_core::devdocs::{self, DevDocsMeta};

use super::feed::{FeedEntry, FeedError};

/// Catálogo oficial de DevDocs.
pub const DOCS_URL: &str = "https://devdocs.io/docs.json";
/// Prefijo del id de feed (y de la carpeta `.docset`) de DevDocs. Evita
/// choques con los feeds estilo Kapeli (`CSS`, `Python_3`...).
pub const FEED_ID_PREFIX: &str = "devdocs-";
/// Tope del `docs.json` (hoy ~370 KB).
const MAX_CATALOG_BYTES: u64 = 16 * 1024 * 1024;

/// Id de feed de un slug (`python~3.12` → `devdocs-python~3.12`).
pub fn feed_id(slug: &str) -> String {
    format!("{FEED_ID_PREFIX}{slug}")
}

/// Nombre visible: `Python` + `3.12` → `Python 3.12`.
pub fn display_name(meta: &DevDocsMeta) -> String {
    let name = meta.name.trim();
    let name = if name.is_empty() { &meta.slug } else { name };
    match meta.version.as_deref().map(str::trim) {
        Some(v) if !v.is_empty() && !name.ends_with(v) => format!("{name} {v}"),
        _ => name.to_string(),
    }
}

/// Versión visible: `release` → `version` → fecha de actualización.
fn display_version(meta: &DevDocsMeta) -> String {
    [&meta.release, &meta.version]
        .into_iter()
        .flatten()
        .map(|v| v.trim())
        .find(|v| !v.is_empty())
        .map(str::to_string)
        .unwrap_or_else(|| meta.mtime.unwrap_or(0).to_string())
}

/// Convierte el catálogo de DevDocs en entradas del catálogo de OpenDoc.
/// Devuelve cuántas se saltaron (slug inválido o nombre vacío).
pub fn entries_from(metas: Vec<DevDocsMeta>) -> (Vec<FeedEntry>, usize) {
    let mut entries = Vec::with_capacity(metas.len());
    let mut skipped = 0;
    for mut meta in metas {
        if !devdocs::is_valid_slug(&meta.slug) {
            skipped += 1;
            continue;
        }
        let name = display_name(&meta);
        let entry = FeedEntry {
            id: feed_id(&meta.slug),
            name: name.clone(),
            version: display_version(&meta),
            urls: vec![devdocs::db_url(&meta.slug)],
            devdocs: Some({
                // El nombre del docset instalado es el visible.
                meta.name = name;
                meta
            }),
        };
        entries.push(entry);
    }
    entries.sort_by(|a, b| {
        a.name
            .to_lowercase()
            .cmp(&b.name.to_lowercase())
            .then_with(|| a.name.cmp(&b.name))
    });
    (entries, skipped)
}

/// Descarga y parsea `docs.json` (bloqueante: solo desde `spawn_blocking`).
pub fn fetch_devdocs_catalog(
    client: &reqwest::blocking::Client,
) -> Result<(Vec<FeedEntry>, usize), FeedError> {
    let res = client
        .get(DOCS_URL)
        .send()
        .map_err(|e| FeedError::Network {
            url: DOCS_URL.to_string(),
            message: e.to_string(),
        })?;
    if !res.status().is_success() {
        return Err(FeedError::Api {
            url: DOCS_URL.to_string(),
            status: res.status().as_u16(),
        });
    }
    let mut body = Vec::new();
    res.take(MAX_CATALOG_BYTES + 1)
        .read_to_end(&mut body)
        .map_err(|e| FeedError::Network {
            url: DOCS_URL.to_string(),
            message: e.to_string(),
        })?;
    if body.len() as u64 > MAX_CATALOG_BYTES {
        return Err(FeedError::Parse {
            url: DOCS_URL.to_string(),
            message: "catalog too large".to_string(),
        });
    }
    let metas = devdocs::parse_catalog(&body).map_err(|e| FeedError::Parse {
        url: DOCS_URL.to_string(),
        message: e.to_string(),
    })?;
    let (entries, skipped) = entries_from(metas);
    if entries.is_empty() {
        return Err(FeedError::Parse {
            url: DOCS_URL.to_string(),
            message: "catalog is empty".to_string(),
        });
    }
    Ok((entries, skipped))
}

#[cfg(test)]
mod tests {
    use super::*;

    fn meta(name: &str, slug: &str, version: &str, release: Option<&str>) -> DevDocsMeta {
        DevDocsMeta {
            name: name.into(),
            slug: slug.into(),
            version: Some(version.into()),
            release: release.map(String::from),
            mtime: Some(1_700_000_000),
            ..DevDocsMeta::default()
        }
    }

    #[test]
    fn names_ids_and_versions() {
        let (entries, skipped) = entries_from(vec![
            meta("Python", "python~3.12", "3.12", Some("3.12.9")),
            meta("CSS", "css", "", None),
            meta("Bad", "../evil", "", None),
            meta("Vue", "vue~3", "3", Some("3.5.1")),
        ]);
        assert_eq!(skipped, 1);
        let ids: Vec<&str> = entries.iter().map(|e| e.id.as_str()).collect();
        assert_eq!(ids, ["devdocs-css", "devdocs-python~3.12", "devdocs-vue~3"]);
        let py = &entries[1];
        assert_eq!(py.name, "Python 3.12");
        assert_eq!(py.version, "3.12.9");
        assert_eq!(
            py.urls,
            ["https://documents.devdocs.io/python~3.12/db.json"]
        );
        assert_eq!(
            py.devdocs.as_ref().map(|m| m.name.as_str()),
            Some("Python 3.12")
        );
        // Sin release ni versión: la fecha de actualización hace de versión.
        assert_eq!(entries[0].version, "1700000000");
    }

    #[test]
    fn version_not_repeated_in_name() {
        assert_eq!(display_name(&meta("Vue 3", "vue~3", "3", None)), "Vue 3");
        assert_eq!(display_name(&meta("", "x", "", None)), "x");
    }

    #[test]
    fn old_catalog_json_without_devdocs_still_loads() {
        let json = r#"{"id":"CSS","name":"CSS","version":"1","urls":["https://a/CSS.tgz"]}"#;
        let entry: FeedEntry = serde_json::from_str(json).expect("compat");
        assert!(entry.devdocs.is_none());
        let back = serde_json::to_string(&entry).expect("ser");
        assert!(!back.contains("devdocs"), "{back}");
    }
}
