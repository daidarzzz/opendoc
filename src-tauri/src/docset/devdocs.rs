//! Instalación de documentaciones de DevDocs.
//!
//! Descarga `index.json` + `db.json` y los convierte, con
//! `opendoc_core::devdocs::convert`, en un docset estándar dentro de la
//! carpeta de docsets (`devdocs-<slug>.docset`). El resultado se integra
//! igual que cualquier otro (mismo `InstalledDocset`), así que búsqueda,
//! navegación, pestañas y desinstalación no distinguen su origen.
//!
//! - Descarga reanudable y tope de tamaño (`TarixLimits`), como el `.tgz`.
//! - La conversión es atómica: si falla, la instalación anterior queda
//!   intacta (la garantiza `convert`).
//! - Una sola fuente de red (`documents.devdocs.io`): sin espejos.

use std::collections::HashSet;
use std::path::Path;

use opendoc_core::devdocs::{self, DevDocsError, DevDocsMeta};

use super::install::{
    assemble_docset, download_url_patient, part_path_for, sweep_stale_temps, InstallError,
    InstalledDocset, ProgressReport, ProgressStage,
};
use super::{icon_data_url_for, read_index, slugify, unique_slug, TarixLimits};
use crate::catalog::feed::FeedEntry;

/// Convierte un error del conversor en el error de instalación de la app.
fn map_convert_error(id: &str, error: DevDocsError) -> InstallError {
    match error {
        DevDocsError::Io(_) | DevDocsError::Sqlite(_) | DevDocsError::Plist(_) => {
            InstallError::InstallFailed {
                id: id.to_string(),
                message: error.to_string(),
            }
        }
        other => InstallError::InvalidPackage {
            id: id.to_string(),
            message: other.to_string(),
        },
    }
}

/// Descarga, convierte y coloca la documentación de `entry`.
///
/// Bloqueante: solo desde `spawn_blocking`. `entry.devdocs` debe estar
/// presente (si no, `UnsupportedPackage`).
pub fn install_devdocs(
    client: &reqwest::blocking::Client,
    entry: &FeedEntry,
    docsets_dir: &Path,
    devicon_base: &Path,
    used_ids: &HashSet<String>,
    limits: TarixLimits,
    on_progress: &(dyn Fn(ProgressReport) + Send + Sync),
) -> Result<InstalledDocset, InstallError> {
    // Las URLs salen del slug, nunca de `entry.urls`: un `catalog.json`
    // manipulado no puede apuntar la descarga a otro servidor.
    let slug = entry.devdocs.as_ref().map_or("", |m| m.slug.as_str());
    let urls = (devdocs::index_url(slug), devdocs::db_url(slug));
    install_from(
        client,
        entry,
        &urls,
        docsets_dir,
        devicon_base,
        used_ids,
        limits,
        on_progress,
    )
}

/// Núcleo de la instalación con las URLs ya decididas (los tests usan un
/// servidor local).
#[allow(clippy::too_many_arguments)]
fn install_from(
    client: &reqwest::blocking::Client,
    entry: &FeedEntry,
    urls: &(String, String),
    docsets_dir: &Path,
    devicon_base: &Path,
    used_ids: &HashSet<String>,
    limits: TarixLimits,
    on_progress: &(dyn Fn(ProgressReport) + Send + Sync),
) -> Result<InstalledDocset, InstallError> {
    let meta: &DevDocsMeta =
        entry
            .devdocs
            .as_ref()
            .ok_or_else(|| InstallError::UnsupportedPackage {
                id: entry.id.clone(),
            })?;
    if !docsets_dir.is_dir() {
        return Err(InstallError::NoDocsetsDir {
            path: docsets_dir.to_path_buf(),
        });
    }
    sweep_stale_temps(docsets_dir);
    let slug = slugify(&entry.id);
    let final_dir = docsets_dir.join(format!("{}.docset", entry.id));
    let had_previous = final_dir.is_dir() || final_dir.with_extension("docset.old").is_dir();

    let (index_url, db_url) = (&urls.0, &urls.1);
    let index_part = part_path_for(docsets_dir, &slug, index_url);
    let db_part = part_path_for(docsets_dir, &slug, db_url);
    let cleanup = || {
        let _ = std::fs::remove_file(&index_part);
        let _ = std::fs::remove_file(&db_part);
    };
    let download_failed = |message: String| InstallError::DownloadFailed {
        id: entry.id.clone(),
        message,
    };

    // `index.json` es pequeño: sin progreso propio. `db.json` marca la barra.
    let silent = |_: ProgressReport| {};
    download_url_patient(client, index_url, &index_part, limits, &silent)
        .map_err(download_failed)?;
    if let Err(message) = download_url_patient(client, db_url, &db_part, limits, on_progress) {
        // El parcial de `db.json` se conserva: el reintento lo reanuda.
        let _ = std::fs::remove_file(&index_part);
        return Err(download_failed(message));
    }

    on_progress(ProgressReport {
        stage: ProgressStage::Extracting,
        received_bytes: 0,
        total_bytes: None,
        files: 0,
    });
    let read = |path: &Path| {
        std::fs::read(path).map_err(|e| InstallError::InstallFailed {
            id: entry.id.clone(),
            message: format!("cannot read {}: {e}", path.display()),
        })
    };
    let (index_json, db_json) = match (read(&index_part), read(&db_part)) {
        (Ok(i), Ok(d)) => (i, d),
        (Err(e), _) | (_, Err(e)) => {
            cleanup();
            return Err(e);
        }
    };
    let converted = devdocs::convert(&index_json, &db_json, meta, &final_dir);
    drop((index_json, db_json));
    // Con éxito o error, los parciales ya no sirven: o se usaron, o el
    // paquete era inválido y un reintento debe empezar de cero.
    cleanup();
    let report = converted.map_err(|e| map_convert_error(&entry.id, e))?;
    crate::profile::mark(
        "install",
        format_args!(
            "feed={} devdocs pages={} entries={} links_dead={} anchors_fixed={}",
            entry.id, report.pages, report.entries, report.links_dead, report.anchors_synthesized
        ),
    );

    on_progress(ProgressReport {
        stage: ProgressStage::Verifying,
        received_bytes: 0,
        total_bytes: None,
        files: 0,
    });
    let mut used = used_ids.clone();
    let id = unique_slug(&slug, &mut used);
    let contents = final_dir.join("Contents");
    let data = read_index(&contents.join("Resources/docSet.dsidx"), &id).map_err(|e| {
        InstallError::InvalidPackage {
            id: entry.id.clone(),
            message: format!("unreadable index: {e}"),
        }
    })?;
    let (mut docset, entries) = assemble_docset(entry, &final_dir, &contents, id, data);
    docset.icon = icon_data_url_for(&final_dir);
    if docset.icon.is_none() {
        let base = meta.slug.split('~').next().unwrap_or(&meta.slug);
        docset.icon = super::devicon::ensure_cached_or_fetch(client, devicon_base, base);
    }
    Ok(InstalledDocset {
        docset,
        entries,
        replaced: had_previous,
        // Sin espejos que recordar (`fast_mirror` es cosa de los `.tgz`).
        source_url: None,
        stale_backup: None,
    })
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::io::{Read, Write};
    use std::net::TcpListener;

    /// Servidor mínimo: `/index.json` y `/db.json` con cuerpos fijos
    /// (`None` → 404). Atiende conexiones hasta que se suelta el hilo.
    fn serve(index: Option<Vec<u8>>, db: Option<Vec<u8>>) -> String {
        let listener = TcpListener::bind("127.0.0.1:0").expect("bind");
        let base = format!("http://{}", listener.local_addr().expect("addr"));
        std::thread::spawn(move || {
            for stream in listener.incoming() {
                let Ok(mut stream) = stream else { continue };
                let mut buf = [0_u8; 2048];
                let n = stream.read(&mut buf).unwrap_or(0);
                let head = String::from_utf8_lossy(&buf[..n]).into_owned();
                let body = if head.starts_with("GET /index.json") {
                    index.clone()
                } else if head.starts_with("GET /db.json") {
                    db.clone()
                } else {
                    None
                };
                let reply = match body {
                    Some(b) => {
                        let mut r = format!(
                            "HTTP/1.1 200 OK\r\nContent-Length: {}\r\nConnection: close\r\n\r\n",
                            b.len()
                        )
                        .into_bytes();
                        r.extend(b);
                        r
                    }
                    None => {
                        b"HTTP/1.1 404 Not Found\r\nContent-Length: 0\r\nConnection: close\r\n\r\n"
                            .to_vec()
                    }
                };
                let _ = stream.write_all(&reply);
            }
        });
        base
    }

    fn entry(slug: &str) -> FeedEntry {
        let meta = DevDocsMeta {
            name: "Demo 1".into(),
            slug: slug.into(),
            release: Some("1.2.3".into()),
            mtime: Some(1_700_000_000),
            ..DevDocsMeta::default()
        };
        FeedEntry {
            id: format!("devdocs-{slug}"),
            name: "Demo 1".into(),
            version: "1.2.3".into(),
            urls: vec![devdocs::db_url(slug)],
            devdocs: Some(meta),
        }
    }

    fn package() -> (Vec<u8>, Vec<u8>) {
        let index = serde_json::json!({"entries": [
            {"name": "Home", "path": "index", "type": "Guide"},
            {"name": "grid", "path": "properties/grid", "type": "Layout"},
        ]});
        let db = serde_json::json!({
            "index": "<h1>Demo</h1><a href=\"properties/grid\">g</a>",
            "properties/grid": "<h1>grid</h1>",
        });
        (index.to_string().into_bytes(), db.to_string().into_bytes())
    }

    fn client() -> reqwest::blocking::Client {
        crate::catalog::feed::http_client().expect("client")
    }

    fn urls(base: &str) -> (String, String) {
        (format!("{base}/index.json"), format!("{base}/db.json"))
    }

    fn leftovers(dir: &Path) -> Vec<String> {
        std::fs::read_dir(dir)
            .expect("read")
            .map(|e| e.expect("entry").file_name().to_string_lossy().into_owned())
            .filter(|n| n != "devdocs-demo~1.docset")
            .collect()
    }

    #[test]
    fn installs_converts_and_leaves_no_temporaries() {
        let dir = tempfile::tempdir().expect("tmp");
        let (index, db) = package();
        let base = serve(Some(index), Some(db));
        let progress = std::sync::Mutex::new(Vec::new());
        let on = |r: ProgressReport| progress.lock().expect("lock").push(r.stage);
        let installed = install_from(
            &client(),
            &entry("demo~1"),
            &urls(&base),
            dir.path(),
            &dir.path().join("icons"),
            &HashSet::new(),
            TarixLimits::default(),
            &on,
        )
        .expect("install");
        assert_eq!(installed.docset.name, "Demo 1");
        assert_eq!(installed.docset.version.as_deref(), Some("1.2.3"));
        assert_eq!(installed.entries.len(), 2);
        assert_eq!(installed.docset.home_path.as_deref(), Some("index.html"));
        assert!(dir
            .path()
            .join("devdocs-demo~1.docset/Contents/Info.plist")
            .is_file());
        assert!(
            leftovers(dir.path()).is_empty(),
            "{:?}",
            leftovers(dir.path())
        );
        let stages = progress.lock().expect("lock");
        assert!(stages.contains(&ProgressStage::Extracting));
        assert!(stages.contains(&ProgressStage::Verifying));
        assert_eq!(
            opendoc_core::devdocs::installed_mtime(&installed.docset.root_path),
            Some(1_700_000_000)
        );
    }

    #[test]
    fn missing_db_fails_cleanly_without_a_docset() {
        let dir = tempfile::tempdir().expect("tmp");
        let (index, _) = package();
        let base = serve(Some(index), None);
        let err = install_from(
            &client(),
            &entry("demo~1"),
            &urls(&base),
            dir.path(),
            &dir.path().join("icons"),
            &HashSet::new(),
            TarixLimits::default(),
            &|_| {},
        )
        .expect_err("404");
        assert!(matches!(err, InstallError::DownloadFailed { .. }), "{err}");
        assert!(!dir.path().join("devdocs-demo~1.docset").exists());
        assert!(
            leftovers(dir.path()).iter().all(|n| !n.contains("index")),
            "{:?}",
            leftovers(dir.path())
        );
    }

    #[test]
    fn invalid_package_keeps_the_previous_install() {
        let dir = tempfile::tempdir().expect("tmp");
        let (index, db) = package();
        let good = serve(Some(index), Some(db));
        install_from(
            &client(),
            &entry("demo~1"),
            &urls(&good),
            dir.path(),
            &dir.path().join("icons"),
            &HashSet::new(),
            TarixLimits::default(),
            &|_| {},
        )
        .expect("first");
        let before = std::fs::read(
            dir.path()
                .join("devdocs-demo~1.docset/Contents/Resources/docSet.dsidx"),
        )
        .expect("dsidx");
        let bad = serve(Some(b"{\"entries\":[]}".to_vec()), Some(b"{}".to_vec()));
        let err = install_from(
            &client(),
            &entry("demo~1"),
            &urls(&bad),
            dir.path(),
            &dir.path().join("icons"),
            &HashSet::new(),
            TarixLimits::default(),
            &|_| {},
        )
        .expect_err("empty package");
        assert!(matches!(err, InstallError::InvalidPackage { .. }), "{err}");
        let after = std::fs::read(
            dir.path()
                .join("devdocs-demo~1.docset/Contents/Resources/docSet.dsidx"),
        )
        .expect("dsidx");
        assert_eq!(before, after);
        assert!(
            leftovers(dir.path()).is_empty(),
            "{:?}",
            leftovers(dir.path())
        );
    }

    #[test]
    fn entries_without_devdocs_meta_are_unsupported() {
        let dir = tempfile::tempdir().expect("tmp");
        let mut e = entry("demo~1");
        e.devdocs = None;
        let err = install_devdocs(
            &client(),
            &e,
            dir.path(),
            dir.path(),
            &HashSet::new(),
            TarixLimits::default(),
            &|_| {},
        )
        .expect_err("no meta");
        assert!(matches!(err, InstallError::UnsupportedPackage { .. }));
    }
}
