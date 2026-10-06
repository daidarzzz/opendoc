//! Escaneo de primer nivel de la carpeta de docsets.
//!
//! - Solo mira el primer nivel: los docsets van directamente en la raíz.
//! - No sigue enlaces simbólicos.
//! - Orden determinista: los docsets se devuelven ordenados por nombre y
//!   los slugs de colisión se asignan en orden de nombre de carpeta, así
//!   que el resultado no depende del orden del sistema de archivos.
//!
//! La raíz se recibe por parámetro: el escáner no asume ninguna carpeta
//! fija (en v0.3 el gestor de docsets lo reutilizará sobre la carpeta de
//! instalación).

use std::collections::HashSet;
use std::fs;
use std::path::Path;
#[cfg(test)]
use std::path::PathBuf;

use super::model::{Docset, IssueKind, ScanError, ScanIssue, ScanReport};

/// Sufijo de carpeta que identifica un docset (insensible a mayúsculas).
const DOCSET_EXT: &str = ".docset";

/// Escanea `root` buscando carpetas `*.docset` en el primer nivel.
///
/// Devuelve error solo si la raíz no existe o no se puede leer; cualquier
/// problema dentro de la carpeta se registra en `ScanReport::issues`.
pub fn scan_dir(root: &Path) -> Result<ScanReport, ScanError> {
    let entries = fs::read_dir(root).map_err(|source| {
        if source.kind() == std::io::ErrorKind::NotFound {
            ScanError::RootNotFound {
                path: root.to_path_buf(),
            }
        } else {
            ScanError::RootUnreadable {
                path: root.to_path_buf(),
                source,
            }
        }
    })?;

    // Nombres de archivo ordenados para un resultado determinista.
    let mut names: Vec<String> = Vec::new();
    let mut entry_issues: Vec<ScanIssue> = Vec::new();
    for entry in entries {
        match entry {
            Ok(entry) => {
                // No seguir enlaces simbólicos.
                let is_symlink = entry.file_type().map(|t| t.is_symlink()).unwrap_or(false);
                if !is_symlink {
                    names.push(entry.file_name().to_string_lossy().into_owned());
                }
            }
            Err(_) => entry_issues.push(ScanIssue {
                path: root.to_path_buf(),
                kind: IssueKind::EntryUnreadable,
            }),
        }
    }
    names.sort_by(|a, b| {
        a.to_lowercase()
            .cmp(&b.to_lowercase())
            .then_with(|| a.cmp(b))
    });

    let mut report = ScanReport {
        docsets: Vec::new(),
        issues: entry_issues,
    };
    let mut used_slugs: HashSet<String> = HashSet::new();

    for name in names {
        let Some(stem) = strip_docset_ext(&name) else {
            continue; // Ruido: no es un *.docset, se ignora en silencio.
        };
        let root_path = root.join(&name);
        if !root_path.is_dir() {
            report.issues.push(ScanIssue {
                path: root_path,
                kind: IssueKind::NotDirectory,
            });
            continue;
        }
        let contents_path = root_path.join("Contents");
        if !contents_path.is_dir() {
            report.issues.push(ScanIssue {
                path: root_path,
                kind: IssueKind::MissingContents,
            });
            continue;
        }
        if !contents_path.join("Resources/Documents").is_dir() {
            report.issues.push(ScanIssue {
                path: root_path,
                kind: IssueKind::MissingDocuments,
            });
            continue;
        }
        if !contents_path.join("Resources/docSet.dsidx").is_file() {
            report.issues.push(ScanIssue {
                path: root_path,
                kind: IssueKind::MissingIndex,
            });
            continue;
        }
        let id = unique_slug(&slugify(stem), &mut used_slugs);
        report.docsets.push(Docset {
            id,
            name: stem.to_string(),
            platform: None, // T3: Info.plist.
            version: None,  // T3: Info.plist.
            root_path,
            contents_path,
        });
    }

    // Orden determinista por nombre para tests y UI.
    report.docsets.sort_by(|a, b| {
        a.name
            .to_lowercase()
            .cmp(&b.name.to_lowercase())
            .then_with(|| a.name.cmp(&b.name))
    });
    Ok(report)
}

/// Quita la extensión `.docset` (insensible a mayúsculas).
/// Devuelve `None` si el nombre no termina en ella.
fn strip_docset_ext(name: &str) -> Option<&str> {
    if name.len() >= DOCSET_EXT.len()
        && name[name.len() - DOCSET_EXT.len()..].eq_ignore_ascii_case(DOCSET_EXT)
    {
        Some(&name[..name.len() - DOCSET_EXT.len()])
    } else {
        None
    }
}

/// Convierte un nombre en slug seguro para URL: minúsculas, solo
/// `[a-z0-9]`, resto a `-` (colapsados, sin bordes). Si no queda nada
/// (p. ej. nombres no ASCII), devuelve `"docset"`.
pub fn slugify(raw: &str) -> String {
    let mut slug = String::with_capacity(raw.len());
    let mut prev_dash = true; // Recorta guiones iniciales.
    for c in raw.to_lowercase().chars() {
        if c.is_ascii_alphanumeric() {
            slug.push(c);
            prev_dash = false;
        } else if !prev_dash {
            slug.push('-');
            prev_dash = true;
        }
    }
    while slug.ends_with('-') {
        slug.pop();
    }
    if slug.is_empty() {
        String::from("docset")
    } else {
        slug
    }
}

/// Asigna un slug único de forma determinista: el primero usa la base y
/// las colisiones reciben `-2`, `-3`...
fn unique_slug(base: &str, used: &mut HashSet<String>) -> String {
    if used.insert(base.to_string()) {
        return base.to_string();
    }
    let mut n = 2_u32;
    loop {
        let candidate = format!("{base}-{n}");
        if used.insert(candidate.clone()) {
            return candidate;
        }
        n += 1;
    }
}

/// Une `parts` bajo `base` creando los directorios.
#[cfg(test)]
fn mkdirs(base: &Path, parts: &str) {
    fs::create_dir_all(base.join(parts)).expect("crear dirs de fixture");
}

/// Crea un esqueleto de docset. Con `complete = true` incluye
/// `Resources/Documents/` y un `docSet.dsidx` vacío (sin abrirlo: T4).
#[cfg(test)]
fn make_docset(root: &Path, name: &str, complete: bool) -> PathBuf {
    let docset = root.join(name);
    mkdirs(&docset, "Contents/Resources");
    if complete {
        mkdirs(&docset, "Contents/Resources/Documents");
        fs::write(docset.join("Contents/Resources/docSet.dsidx"), []).expect("dsidx");
    }
    docset
}

#[cfg(test)]
mod tests {
    use super::super::model::ScanError;
    use super::*;

    #[test]
    fn valid_docset_is_scanned() {
        let dir = tempfile::tempdir().expect("tempdir");
        make_docset(dir.path(), "Python_3.docset", true);

        let report = scan_dir(dir.path()).expect("scan");
        assert!(report.issues.is_empty());
        assert_eq!(report.docsets.len(), 1);
        let docset = &report.docsets[0];
        assert_eq!(docset.name, "Python_3");
        assert_eq!(docset.id, "python-3");
        assert_eq!(docset.platform, None);
        assert_eq!(docset.version, None);
        assert_eq!(docset.root_path, dir.path().join("Python_3.docset"));
        assert_eq!(
            docset.contents_path,
            dir.path().join("Python_3.docset/Contents")
        );
    }

    #[test]
    fn missing_root_returns_error() {
        let missing = PathBuf::from("definitivamente/no/existe");
        let err = scan_dir(&missing).expect_err("debe fallar");
        assert!(matches!(err, ScanError::RootNotFound { .. }));
    }

    #[test]
    fn file_as_root_returns_unreadable() {
        let dir = tempfile::tempdir().expect("tempdir");
        let file = dir.path().join("un-fichero.txt");
        fs::write(&file, b"hola").expect("write");
        let err = scan_dir(&file).expect_err("debe fallar");
        assert!(matches!(err, ScanError::RootUnreadable { .. }));
    }

    #[test]
    fn corrupt_docsets_become_issues() {
        let dir = tempfile::tempdir().expect("tempdir");
        fs::create_dir(dir.path().join("SinContents.docset")).expect("mkdir");
        let no_docs = make_docset(dir.path(), "SinDocuments.docset", false);
        mkdirs(&no_docs, "Contents");
        let no_index = make_docset(dir.path(), "SinIndice.docset", false);
        mkdirs(&no_index, "Contents/Resources/Documents");
        fs::write(dir.path().join("Fichero.docset"), b"no soy un dir").expect("write");

        let report = scan_dir(dir.path()).expect("scan");
        assert!(report.docsets.is_empty());
        assert_eq!(report.issues.len(), 4);
        let kinds: Vec<IssueKind> = report.issues.iter().map(|i| i.kind.clone()).collect();
        assert!(kinds.contains(&IssueKind::MissingContents));
        assert!(kinds.contains(&IssueKind::MissingDocuments));
        assert!(kinds.contains(&IssueKind::MissingIndex));
        assert!(kinds.contains(&IssueKind::NotDirectory));
    }

    #[test]
    fn noise_is_ignored_silently() {
        let dir = tempfile::tempdir().expect("tempdir");
        fs::write(dir.path().join("random.txt"), b"x").expect("write");
        fs::create_dir(dir.path().join("otra-carpeta")).expect("mkdir");

        let report = scan_dir(dir.path()).expect("scan");
        assert!(report.docsets.is_empty());
        assert!(report.issues.is_empty());
    }

    #[test]
    fn slug_collisions_get_deterministic_suffix() {
        let dir = tempfile::tempdir().expect("tempdir");
        make_docset(dir.path(), "Python 3.docset", true);
        make_docset(dir.path(), "Python_3.docset", true);
        make_docset(dir.path(), "PYTHON-3.docset", true);

        let report = scan_dir(dir.path()).expect("scan");
        let ids: Vec<&str> = report.docsets.iter().map(|d| d.id.as_str()).collect();
        assert_eq!(ids, vec!["python-3", "python-3-2", "python-3-3"]);
    }

    #[test]
    fn non_ascii_name_falls_back_to_docset_slug() {
        let dir = tempfile::tempdir().expect("tempdir");
        make_docset(dir.path(), "日本語.docset", true);

        let report = scan_dir(dir.path()).expect("scan");
        assert_eq!(report.docsets.len(), 1);
        assert_eq!(report.docsets[0].id, "docset");
    }

    #[test]
    fn docsets_are_sorted_by_name() {
        let dir = tempfile::tempdir().expect("tempdir");
        // Creados en orden inverso a propósito.
        for name in ["Zebra.docset", "mango.docset", "CSS.docset"] {
            make_docset(dir.path(), name, true);
        }

        let report = scan_dir(dir.path()).expect("scan");
        let names: Vec<&str> = report.docsets.iter().map(|d| d.name.as_str()).collect();
        assert_eq!(names, vec!["CSS", "mango", "Zebra"]);
    }

    #[test]
    fn slugify_cases() {
        assert_eq!(slugify("Python_3"), "python-3");
        assert_eq!(slugify("  C++  "), "c");
        assert_eq!(slugify("--Hola--Mundo--"), "hola-mundo");
        assert_eq!(slugify("日本語"), "docset");
        assert_eq!(slugify(""), "docset");
    }

    #[test]
    fn issue_kind_messages_are_clear() {
        assert_eq!(IssueKind::MissingContents.to_string(), "falta Contents/");
        assert_eq!(
            IssueKind::MissingDocuments.to_string(),
            "falta Contents/Resources/Documents/"
        );
        assert_eq!(
            IssueKind::MissingIndex.to_string(),
            "falta Contents/Resources/docSet.dsidx"
        );
    }
}
