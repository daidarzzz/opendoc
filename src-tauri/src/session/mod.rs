//! Versioned tab session stored separately from desktop settings.
//!
//! The saved format records docset-relative paths and optional fragments.
//! The frontend reconstructs viewer URLs for the current platform on restore.
//! Treat persisted data as untrusted and validate individual fields so a
//! damaged entry does not discard unrelated tabs. The current schema is
//! version 1. Corrupt or newer session files are backed up on load.

use serde::{Deserialize, Serialize};
use std::path::{Path, PathBuf};

use crate::persist::{backup_rotating, save_if_changed_json};

/// Latest supported session version.
pub const SESSION_VERSION: u32 = 1;
/// Maximum number of saved tabs.
pub const MAX_SESSION_TABS: usize = 30;
/// Maximum saved history entries per tab. Live history can hold 100.
pub const MAX_SESSION_HISTORY: usize = 50;
/// Maximum stored path length, including its optional fragment.
pub const MAX_NAV_URL_LEN: usize = 4096;
/// Maximum stored title length in characters.
pub const MAX_TITLE_LEN: usize = 200;
/// Maximum stored vertical scroll offset in CSS pixels.
pub const MAX_SCROLL_Y: f64 = 10_000_000.0;
/// Maximum length of a docset ID or lookup hint in characters.
pub const MAX_ID_LEN: usize = 200;

/// A history entry independent of the platform-specific viewer scheme.
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
pub struct SavedEntry {
    /// Path relative to `Documents/`, with an optional fragment (`a/b.html#x`).
    /// The enclosing tab supplies the docset ID.
    pub path: String,
    /// Plain text title with control characters removed.
    pub title: String,
}

/// A saved tab. Restore assigns a new runtime tab ID.
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
pub struct SavedTab {
    /// Identifier of the docset associated with this tab.
    pub docset_id: String,
    /// Folder-name hint for case-insensitive lookup among loaded docsets.
    /// Do not use it to construct filesystem paths.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub docset_name: Option<String>,
    /// Bundle identifier hint for lookup among loaded docsets.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub bundle_id: Option<String>,
    /// A bounded slice of the linear history around the current entry.
    #[serde(default)]
    pub history: Vec<SavedEntry>,
    /// Index of the current entry within `history`.
    #[serde(default)]
    pub history_index: usize,
    /// Vertical scroll offset of the current entry. `None` restores the top.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub scroll: Option<f64>,
}

/// Ordered tab snapshot and active-tab index.
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
pub struct Session {
    /// Schema version.
    #[serde(default)]
    pub version: u32,
    /// Saved tabs in display order.
    #[serde(default)]
    pub tabs: Vec<SavedTab>,
    /// Index of the active tab within `tabs`.
    #[serde(default)]
    pub active: usize,
}

impl Session {
    /// Empty session for the welcome screen.
    pub fn empty() -> Self {
        Self {
            version: SESSION_VERSION,
            tabs: Vec::new(),
            active: 0,
        }
    }
}

/// Returns the session file path inside the application data directory.
pub fn session_file(base_dir: &Path) -> PathBuf {
    base_dir.join("session.json")
}

/// Loads the session or returns an empty one. Missing files are left alone.
/// Corrupt or newer files are moved to a rotating backup when possible.
pub fn load(path: &Path) -> Session {
    let bytes = match std::fs::read(path) {
        Ok(bytes) => bytes,
        Err(e) if e.kind() == std::io::ErrorKind::NotFound => return Session::empty(),
        Err(_) => return backup_and_empty(path),
    };
    let value: serde_json::Value = match serde_json::from_slice(&bytes) {
        Ok(value) => value,
        Err(_) => return backup_and_empty(path),
    };
    if version_of(&value) > SESSION_VERSION {
        return backup_and_empty(path);
    }
    Session::from_value(&value)
}

/// Guarda si cambió. Devuelve `true` si escribió. Si lo que hay no parsea
/// (basura o versión futura no migrada por `load`), lo respalda antes.
pub fn save_if_changed(path: &Path, session: &Session) -> std::io::Result<bool> {
    save_if_changed_json(path, session)
}

/// Versión declarada en el JSON (`0` si falta o no es número).
fn version_of(value: &serde_json::Value) -> u32 {
    value
        .get("version")
        .and_then(serde_json::Value::as_u64)
        .and_then(|n| u32::try_from(n).ok())
        .unwrap_or(0)
}

/// Respalda (rotativo, conserva la copia más antigua) y devuelve vacía.
/// No escribe ningún fichero fresco: el primer guardado real lo creará.
fn backup_and_empty(path: &Path) -> Session {
    backup_rotating(path);
    Session::empty()
}

impl Session {
    /// Construye tolerante desde un JSON ya parseado (versión ya filtrada).
    fn from_value(value: &serde_json::Value) -> Self {
        let mut tabs: Vec<SavedTab> = value
            .get("tabs")
            .and_then(|t| t.as_array())
            .map(|items| items.iter().filter_map(SavedTab::from_value).collect())
            .unwrap_or_default();
        // Las pestañas vacías solo tienen sentido como bienvenida única:
        // si hay contenido, sobran; si no, basta la primera.
        if tabs.iter().any(|t| !t.history.is_empty()) {
            tabs.retain(|t| !t.history.is_empty());
        } else {
            tabs.truncate(1);
        }
        if tabs.is_empty() {
            return Session::empty();
        }
        let mut active = value
            .get("active")
            .and_then(serde_json::Value::as_u64)
            .and_then(|n| usize::try_from(n).ok())
            .unwrap_or(tabs.len().saturating_sub(1));
        if active >= tabs.len() {
            active = tabs.len() - 1;
        }
        // Tope 30: primeras 30, y la activa si quedó fuera.
        if tabs.len() > MAX_SESSION_TABS {
            if active >= MAX_SESSION_TABS {
                let rescued = tabs[active].clone();
                tabs.truncate(MAX_SESSION_TABS - 1);
                tabs.push(rescued);
                active = MAX_SESSION_TABS - 1;
            } else {
                tabs.truncate(MAX_SESSION_TABS);
            }
        }
        Self {
            version: SESSION_VERSION,
            tabs,
            active,
        }
    }
}

impl SavedTab {
    /// `None` si la pestaña no tiene forma válida (se descarta sola).
    fn from_value(value: &serde_json::Value) -> Option<Self> {
        let docset_id = value
            .get("docset_id")
            .and_then(|v| v.as_str())
            .unwrap_or("");
        let history: Vec<SavedEntry> = value
            .get("history")
            .and_then(|h| h.as_array())
            .map(|items| items.iter().filter_map(SavedEntry::from_value).collect())
            .unwrap_or_default();
        if !valid_docset_id(docset_id) {
            return None;
        }
        if docset_id.is_empty() {
            // Vacía de bienvenida: sin historial ni pistas.
            if !history.is_empty() {
                return None;
            }
            return Some(Self {
                docset_id: String::new(),
                docset_name: None,
                bundle_id: None,
                history: Vec::new(),
                history_index: 0,
                scroll: None,
            });
        }
        if history.is_empty() {
            return None;
        }
        let mut history_index = value
            .get("history_index")
            .and_then(serde_json::Value::as_u64)
            .and_then(|n| usize::try_from(n).ok())
            .unwrap_or_else(|| history.len() - 1);
        if history_index >= history.len() {
            history_index = history.len() - 1;
        }
        let (history, history_index) =
            trim_history_window(history, history_index, MAX_SESSION_HISTORY);
        Some(Self {
            docset_id: docset_id.to_string(),
            docset_name: hint_of(value.get("docset_name")),
            bundle_id: hint_of(value.get("bundle_id")),
            history,
            history_index,
            scroll: scroll_of(value.get("scroll")),
        })
    }
}

impl SavedEntry {
    /// `None` si la ruta no tiene forma válida (se descarta la parada).
    fn from_value(value: &serde_json::Value) -> Option<Self> {
        let path = value.get("path").and_then(|v| v.as_str())?;
        if !valid_rel_path(path) {
            return None;
        }
        let title = value
            .get("title")
            .and_then(|v| v.as_str())
            .map(sanitize_title);
        Some(Self {
            path: path.to_string(),
            title: title
                .filter(|t| !t.is_empty())
                .unwrap_or_else(|| path.to_string()),
        })
    }
}

/// Pista (nombre o bundle): recortada, no vacía y ≤200 caracteres.
/// Lo demás → `None` (campo reiniciado, no error).
fn hint_of(value: Option<&serde_json::Value>) -> Option<String> {
    let raw = value?.as_str()?.trim();
    if raw.is_empty() || raw.chars().count() > MAX_ID_LEN {
        return None;
    }
    Some(raw.to_string())
}

/// Scroll finito en rango. Lo demás → `None`.
fn scroll_of(value: Option<&serde_json::Value>) -> Option<f64> {
    let y = value?.as_f64()?;
    if !y.is_finite() || y < 0.0 || y > MAX_SCROLL_Y {
        return None;
    }
    Some(y)
}

/// `true` si el id puede ser un slug de docset (`""` = bienvenida).
fn valid_docset_id(raw: &str) -> bool {
    if raw.is_empty() {
        return true;
    }
    if raw.chars().count() > MAX_ID_LEN || raw == "." || raw == ".." {
        return false;
    }
    !raw.chars().any(|c| {
        c == '/' || c == '\\' || c == '?' || c == '#' || c == ':' || c == '\0' || c.is_control()
    })
}

/// Ruta neutra válida: relativa a `Documents/`, sin esquema, sin `..`,
/// sin rutas absolutas ni letra de unidad, con `%XX` decodificado antes
/// de validar (espeja `protocol::resolve`). Nunca se usa para el disco.
fn valid_rel_path(raw: &str) -> bool {
    if raw.is_empty() || raw.len() > MAX_NAV_URL_LEN {
        return false;
    }
    if raw.contains('\0') || raw.contains("://") || raw.contains('\\') {
        return false;
    }
    if raw.chars().any(|c| c.is_control()) {
        return false;
    }
    // Como en el protocolo: el `?`/`#` no forma parte de la ruta.
    let without_marks = raw.split(['?', '#']).next().unwrap_or(raw);
    let decoded = percent_decode_repeated(without_marks);
    if decoded.contains('\0') {
        return false;
    }
    if has_drive_letter(&decoded) || decoded.starts_with('/') {
        return false;
    }
    let mut segments = 0;
    for seg in decoded.split('/') {
        if seg.is_empty() || seg == "." {
            continue;
        }
        if seg == ".." {
            return false;
        }
        segments += 1;
    }
    segments > 0
}

/// Título como texto: sin controles, recortado, ≤200 caracteres.
fn sanitize_title(raw: &str) -> String {
    let clean: String = raw
        .chars()
        .filter(|c| !matches!(*c, '\u{0}'..='\u{1F}' | '\u{7F}'))
        .collect();
    let trimmed = clean.trim();
    if trimmed.chars().count() <= MAX_TITLE_LEN {
        return trimmed.to_string();
    }
    trimmed.chars().take(MAX_TITLE_LEN).collect()
}

/// Decodifica `%XX` repetidamente hasta estabilizar (máx 5 rondas).
fn percent_decode_repeated(raw: &str) -> String {
    let mut current = raw.to_string();
    for _ in 0..5 {
        let next = percent_decode_once(&current);
        if next == current {
            break;
        }
        current = next;
    }
    current
}

/// Una ronda de decodificación `%XX` (hex insensible a mayúsculas).
fn percent_decode_once(s: &str) -> String {
    let bytes = s.as_bytes();
    let mut out: Vec<u8> = Vec::with_capacity(bytes.len());
    let mut i = 0;
    while i < bytes.len() {
        if bytes[i] == b'%'
            && i + 3 <= bytes.len()
            && bytes[i + 1].is_ascii_hexdigit()
            && bytes[i + 2].is_ascii_hexdigit()
            && u8::from_str_radix(&s[i + 1..i + 3], 16).is_ok()
        {
            let byte = u8::from_str_radix(&s[i + 1..i + 3], 16).unwrap_or(b'%');
            out.push(byte);
            i += 3;
            continue;
        }
        out.push(bytes[i]);
        i += 1;
    }
    String::from_utf8_lossy(&out).into_owned()
}

/// `C:` / `c:` al inicio (tras normalizar separadores).
fn has_drive_letter(s: &str) -> bool {
    let bytes = s.as_bytes();
    bytes.len() >= 2 && bytes[0].is_ascii_alphabetic() && bytes[1] == b':'
}

/// Recorta el historial a `max` con una ventana centrada en el índice
/// actual (nunca se pierde la entrada actual) y ajusta el índice.
fn trim_history_window(
    history: Vec<SavedEntry>,
    index: usize,
    max: usize,
) -> (Vec<SavedEntry>, usize) {
    if max == 0 || history.len() <= max {
        let index = index.min(history.len().saturating_sub(1));
        return (history, index);
    }
    let start = index.saturating_sub(max / 2).min(history.len() - max);
    let window: Vec<SavedEntry> = history.into_iter().skip(start).take(max).collect();
    (window, index - start)
}

#[cfg(test)]
mod tests {
    use super::*;
    use serde_json::json;

    fn entry(path: &str) -> serde_json::Value {
        json!({"path": path, "title": "T"})
    }

    fn tab(id: &str, paths: &[&str], index: usize) -> serde_json::Value {
        json!({
            "docset_id": id,
            "docset_name": "Python",
            "bundle_id": "org.python.docset",
            "history": paths.iter().map(|p| entry(p)).collect::<Vec<_>>(),
            "history_index": index,
            "scroll": 120.0,
        })
    }

    fn write_raw(dir: &Path, body: &str) -> PathBuf {
        let path = dir.join("session.json");
        std::fs::write(&path, body).expect("escribir session");
        path
    }

    #[test]
    fn missing_file_gives_empty_without_creating() {
        let dir = tempfile::tempdir().expect("tempdir");
        let path = dir.path().join("session.json");
        assert_eq!(load(&path), Session::empty());
        assert!(!path.exists(), "no debe crear nada");
    }

    #[test]
    fn roundtrip_keeps_tabs_order_active_and_hints() {
        let dir = tempfile::tempdir().expect("tempdir");
        let path = dir.path().join("session.json");
        let session = Session {
            version: SESSION_VERSION,
            tabs: vec![
                SavedTab {
                    docset_id: "python-3".to_string(),
                    docset_name: Some("Python".to_string()),
                    bundle_id: Some("org.python.docset".to_string()),
                    history: vec![
                        SavedEntry {
                            path: "a.html".to_string(),
                            title: "A".to_string(),
                        },
                        SavedEntry {
                            path: "b.html#x".to_string(),
                            title: "B".to_string(),
                        },
                    ],
                    history_index: 1,
                    scroll: Some(120.0),
                },
                SavedTab {
                    docset_id: "css".to_string(),
                    docset_name: None,
                    bundle_id: None,
                    history: vec![SavedEntry {
                        path: "css/grid.html".to_string(),
                        title: "Grid".to_string(),
                    }],
                    history_index: 0,
                    scroll: None,
                },
            ],
            active: 1,
        };
        assert!(save_if_changed(&path, &session).expect("guardar"));
        assert_eq!(load(&path), session);
        let raw = std::fs::read_to_string(&path).expect("leer");
        assert!(raw.contains("\"version\": 1"), "{raw}");
    }

    #[test]
    fn lone_welcome_tab_survives_roundtrip() {
        let dir = tempfile::tempdir().expect("tempdir");
        let path = dir.path().join("session.json");
        let session = Session {
            version: SESSION_VERSION,
            tabs: vec![SavedTab {
                docset_id: String::new(),
                docset_name: None,
                bundle_id: None,
                history: Vec::new(),
                history_index: 0,
                scroll: None,
            }],
            active: 0,
        };
        assert!(save_if_changed(&path, &session).expect("guardar"));
        assert_eq!(load(&path), session);
    }

    #[test]
    fn corrupt_file_becomes_bak_and_empty() {
        let dir = tempfile::tempdir().expect("tempdir");
        let path = write_raw(dir.path(), "{ esto no es json");
        assert_eq!(load(&path), Session::empty());
        assert_eq!(
            std::fs::read_to_string(path.with_extension("json.bak")).expect("bak"),
            "{ esto no es json"
        );
        assert!(!path.exists(), "load no escribe fresco");
    }

    #[test]
    fn future_version_backs_up_once_and_later_saves_write_fresh() {
        let dir = tempfile::tempdir().expect("tempdir");
        let body = r#"{"version": 99, "tabs": [], "active": 0}"#;
        let path = write_raw(dir.path(), body);
        assert_eq!(load(&path), Session::empty());
        assert_eq!(
            std::fs::read_to_string(path.with_extension("json.bak")).expect("bak"),
            body
        );
        // Guardar después escribe un fichero nuevo sin tocar el .bak.
        let fresh = Session::empty();
        assert!(save_if_changed(&path, &fresh).expect("guardar"));
        assert_eq!(
            std::fs::read_to_string(path.with_extension("json.bak")).expect("bak"),
            body,
            "el .bak de la versión futura se conserva"
        );
        assert_eq!(load(&path), fresh);
    }

    #[test]
    fn version_field_missing_or_garbage_is_not_future() {
        let dir = tempfile::tempdir().expect("tempdir");
        let path = write_raw(
            dir.path(),
            &serde_json::to_string(&json!({
                "version": "ayer",
                "tabs": [tab("python-3", &["a.html"], 0)],
                "active": 0,
            }))
            .expect("json"),
        );
        let loaded = load(&path);
        assert_eq!(loaded.tabs.len(), 1);
        assert!(!path.with_extension("json.bak").exists());
    }

    #[test]
    fn invalid_fields_only_reset_themselves() {
        let value = json!({
            "version": 1,
            "tabs": [tab("python-3", &["a.html"], 0)],
            "active": 0,
        });
        let mut session = Session::from_value(&value);
        assert_eq!(session.tabs.len(), 1);
        // Título con controles + larguísimo → limpio y acotado.
        let dirty = json!({
            "path": "a.html",
            "title": format!("  a\u{0}b\u{1F}c{}  ", "x".repeat(500)),
        });
        let kept = SavedEntry::from_value(&dirty).expect("entrada válida");
        assert_eq!(kept.title.chars().count(), MAX_TITLE_LEN);
        assert!(!kept.title.chars().any(|c| c.is_control()));
        // Scroll fuera de rango → None; índice pasado → última.
        let dir = tempfile::tempdir().expect("tempdir");
        let path = write_raw(
            dir.path(),
            &serde_json::to_string(&json!({
                "version": 1,
                "tabs": [{
                    "docset_id": "python-3",
                    "history": [{"path": "a.html", "title": "A"}],
                    "history_index": 99,
                    "scroll": -5.0,
                }],
                "active": "siete",
            }))
            .expect("json"),
        );
        session = load(&path);
        assert_eq!(session.tabs[0].history_index, 0);
        assert_eq!(session.tabs[0].scroll, None);
        assert_eq!(session.active, 0);
    }

    #[test]
    fn malicious_entries_are_dropped_without_breaking() {
        let paths = [
            "../fuera.html",
            "a/../../fuera.html",
            "..%2Ffuera.html",
            "..%252Ffuera.html",
            "..",
            "a/b.html/../../..",
            "/absoluta.html",
            "C:/windows.html",
            "https://example.com/x.html",
            "opendoc://python-3/a.html",
            "a\\b.html",
            "",
        ];
        let mut items: Vec<serde_json::Value> = paths.iter().map(|p| entry(p)).collect();
        // Una válida entre basura: sobrevive sola.
        items.push(entry("ok/valid.html"));
        let value = json!({
            "version": 1,
            "tabs": [{
                "docset_id": "python-3",
                "history": items,
                "history_index": 0,
            }],
            "active": 0,
        });
        let session = Session::from_value(&value);
        assert_eq!(session.tabs.len(), 1);
        assert_eq!(session.tabs[0].history.len(), 1);
        assert_eq!(session.tabs[0].history[0].path, "ok/valid.html");
    }

    #[test]
    fn caps_tabs_and_keeps_active() {
        let mut items = Vec::new();
        for i in 0..40 {
            items.push(tab(&format!("doc-{i}"), &["a.html"], 0));
        }
        let value = json!({"version": 1, "tabs": items, "active": 35});
        let session = Session::from_value(&value);
        assert_eq!(session.tabs.len(), MAX_SESSION_TABS);
        assert_eq!(session.active, MAX_SESSION_TABS - 1);
        assert_eq!(session.tabs[session.active].docset_id, "doc-35");
        assert_eq!(session.tabs[0].docset_id, "doc-0");
    }

    #[test]
    fn history_window_is_centered_and_keeps_current() {
        let paths: Vec<String> = (0..100).map(|i| format!("d/p{i}.html")).collect();
        let history: Vec<SavedEntry> = paths
            .iter()
            .map(|p| SavedEntry {
                path: p.clone(),
                title: p.clone(),
            })
            .collect();
        // Índice al principio: ventana inicial.
        let (w, i) = trim_history_window(history.clone(), 3, MAX_SESSION_HISTORY);
        assert_eq!(w.len(), MAX_SESSION_HISTORY);
        assert_eq!(i, 3);
        assert_eq!(w[i].path, "d/p3.html");
        // Índice en medio: ventana centrada con la actual dentro.
        let (w, i) = trim_history_window(history.clone(), 60, MAX_SESSION_HISTORY);
        assert_eq!(w.len(), MAX_SESSION_HISTORY);
        assert_eq!(w[i].path, "d/p60.html");
        // Índice al final: ventana final con futuro conservado.
        let (w, i) = trim_history_window(history.clone(), 99, MAX_SESSION_HISTORY);
        assert_eq!(w.len(), MAX_SESSION_HISTORY);
        assert_eq!(w[i].path, "d/p99.html");
        // Atrás en punto medio tras recorte: el futuro sigue ahí.
        let (w, i) = trim_history_window(history, 90, MAX_SESSION_HISTORY);
        assert_eq!(&w[i].path, "d/p90.html");
        assert!(w.iter().any(|e| e.path == "d/p99.html"));
    }

    #[test]
    fn overlong_hints_are_dropped_not_matched() {
        let value = json!({
            "docset_id": "python-3",
            "docset_name": "x".repeat(500),
            "bundle_id": "y".repeat(500),
            "history": [{"path": "a.html", "title": "A"}],
            "history_index": 0,
        });
        let tab = SavedTab::from_value(&value).expect("pestaña válida");
        assert_eq!(tab.docset_name, None);
        assert_eq!(tab.bundle_id, None);
    }

    #[test]
    fn empty_tabs_collapse_to_single_welcome() {
        let value = json!({
            "version": 1,
            "tabs": [
                {"docset_id": "", "history": []},
                tab("python-3", &["a.html"], 0),
                {"docset_id": "", "history": []},
            ],
            "active": 2,
        });
        let session = Session::from_value(&value);
        assert_eq!(session.tabs.len(), 1);
        assert_eq!(session.tabs[0].docset_id, "python-3");
    }

    #[test]
    fn save_only_when_changed_and_final_parses() {
        let dir = tempfile::tempdir().expect("tempdir");
        let path = dir.path().join("session.json");
        let session = Session::empty();
        assert!(save_if_changed(&path, &session).expect("primera vez"));
        assert!(!save_if_changed(&path, &session).expect("igual no escribe"));
        let raw = std::fs::read_to_string(&path).expect("leer");
        assert!(serde_json::from_str::<Session>(&raw).is_ok());
    }
}
