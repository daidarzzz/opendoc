//! Ajustes persistentes (T9): carpeta de docsets y tema.
//!
//! - Fichero `settings.json` con `"version": 1` para migraciones futuras.
//! - Tolerancia por campo (`#[serde(default)]`): un valor inválido solo
//!   reinicia ese campo; el resto se conserva.
//! - Archivo corrupto o ilegible: se renombra a `settings.json.bak`
//!   (nunca se sobrescribe en silencio) y se escriben defaults frescos.
//! - Ausente: defaults sin crear nada (se escribe al primer cambio real).
//! - Escritura atómica (temporal + rename) y solo si el valor cambió.
//! - Todo recibe la ruta por parámetro: testeable sin Tauri. La ruta real
//!   (directorio de datos de la app) se resuelve en `lib.rs`.

use std::path::{Path, PathBuf};

use serde::Deserialize;

/// Versión actual del formato (para migraciones futuras).
pub const SETTINGS_VERSION: u32 = 1;

fn default_version() -> u32 {
    SETTINGS_VERSION
}

/// Tema guardado. `System` respeta el SO (el frontend lo resuelve y
/// reacciona en vivo a sus cambios).
#[derive(Debug, Clone, Copy, PartialEq, Eq, Default, serde::Serialize, serde::Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum ThemeMode {
    /// Claro siempre.
    Light,
    /// Oscuro siempre.
    Dark,
    /// Seguir al sistema.
    #[default]
    System,
}

/// Ajustes de OpenDoc. Extensible sin migrar (campos nuevos con default).
/// Cada campo tolera valores inválidos (reinicia solo ese campo).
#[derive(Debug, Clone, PartialEq, Eq, serde::Serialize, serde::Deserialize)]
pub struct Settings {
    /// Versión del formato.
    #[serde(default = "default_version", deserialize_with = "version_or_default")]
    pub version: u32,
    /// Carpeta de docsets (`None` = sin configurar).
    #[serde(default, deserialize_with = "dir_or_none")]
    pub docsets_dir: Option<PathBuf>,
    /// Tema guardado.
    #[serde(default, deserialize_with = "theme_or_default")]
    pub theme: ThemeMode,
    /// Repo de feeds (`owner/repo` o URL; `None` = sin configurar).
    #[serde(default, deserialize_with = "url_or_none")]
    pub feed_url: Option<String>,
    /// Epoch de la última descarga del catálogo (`None` = nunca).
    #[serde(default, deserialize_with = "u64_or_none")]
    pub catalog_fetched_at: Option<u64>,
}

/// `u32` o default (nunca tumba el parseo).
fn version_or_default<'de, D: serde::Deserializer<'de>>(d: D) -> Result<u32, D::Error> {
    let v = serde_json::Value::deserialize(d)?;
    Ok(v.as_u64()
        .and_then(|n| u32::try_from(n).ok())
        .unwrap_or(SETTINGS_VERSION))
}

/// String no vacío o `None` (tipos raros → `None`, no error).
fn dir_or_none<'de, D: serde::Deserializer<'de>>(d: D) -> Result<Option<PathBuf>, D::Error> {
    let v = serde_json::Value::deserialize(d)?;
    Ok(v.as_str().filter(|s| !s.is_empty()).map(PathBuf::from))
}

/// String no vacío (recortado) o `None` (tipos raros → `None`, no error).
fn url_or_none<'de, D: serde::Deserializer<'de>>(d: D) -> Result<Option<String>, D::Error> {
    let v = serde_json::Value::deserialize(d)?;
    Ok(v.as_str()
        .map(str::trim)
        .filter(|s| !s.is_empty())
        .map(str::to_string))
}

/// `u64` o `None` (nunca tumba el parseo).
fn u64_or_none<'de, D: serde::Deserializer<'de>>(d: D) -> Result<Option<u64>, D::Error> {
    let v = serde_json::Value::deserialize(d)?;
    Ok(v.as_u64())
}

/// `"light"`/`"dark"` o `System` para cualquier otra cosa.
fn theme_or_default<'de, D: serde::Deserializer<'de>>(d: D) -> Result<ThemeMode, D::Error> {
    let v = serde_json::Value::deserialize(d)?;
    Ok(match v.as_str() {
        Some("light") => ThemeMode::Light,
        Some("dark") => ThemeMode::Dark,
        _ => ThemeMode::default(),
    })
}

impl Default for Settings {
    fn default() -> Self {
        Self {
            version: SETTINGS_VERSION,
            docsets_dir: None,
            theme: ThemeMode::default(),
            feed_url: None,
            catalog_fetched_at: None,
        }
    }
}

/// Ruta del fichero dentro de un directorio base (p. ej. el de datos).
pub fn settings_file(base_dir: &Path) -> PathBuf {
    base_dir.join("settings.json")
}

/// Lee los ajustes. Nunca falla hacia fuera: ausente → defaults sin crear
/// nada; corrupto → `.bak` + defaults frescos (se intentan escribir).
pub fn load(path: &Path) -> Settings {
    let bytes = match std::fs::read(path) {
        Ok(bytes) => bytes,
        Err(e) if e.kind() == std::io::ErrorKind::NotFound => return Settings::default(),
        Err(_) => return backup_and_fresh(path),
    };
    match serde_json::from_slice::<Settings>(&bytes) {
        Ok(mut settings) => {
            // Versión desconocida: se conservan los campos conocidos.
            settings.version = SETTINGS_VERSION;
            settings
        }
        Err(_) => backup_and_fresh(path),
    }
}

/// Guarda si el valor cambió. Devuelve `true` si escribió. Si lo que hay
/// no parsea, lo respalda a `.bak` antes de sobrescribir.
pub fn save_if_changed(path: &Path, settings: &Settings) -> std::io::Result<bool> {
    match std::fs::read(path) {
        Ok(bytes) => match serde_json::from_slice::<Settings>(&bytes) {
            Ok(current) if &current == settings => return Ok(false),
            Ok(_) => {}
            Err(_) => {
                let _ = std::fs::rename(path, path.with_extension("json.bak"));
            }
        },
        Err(e) if e.kind() == std::io::ErrorKind::NotFound => {}
        Err(e) => return Err(e),
    }
    save_atomic(path, settings)?;
    Ok(true)
}

/// Renombra a `.bak` (si puede) y escribe defaults frescos. Si algo falla,
/// devuelve defaults igualmente: la app nunca se tumba por ajustes.
fn backup_and_fresh(path: &Path) -> Settings {
    let fresh = Settings::default();
    let bak = path.with_extension("json.bak");
    let _ = std::fs::rename(path, &bak);
    let _ = save_atomic(path, &fresh);
    fresh
}

/// Escritura atómica: temporal en el mismo directorio + rename.
fn save_atomic(path: &Path, settings: &Settings) -> std::io::Result<()> {
    let json = serde_json::to_string_pretty(settings).map_err(std::io::Error::other)?;
    if let Some(parent) = path.parent() {
        std::fs::create_dir_all(parent)?;
    }
    let tmp = path.with_extension("json.tmp");
    std::fs::write(&tmp, json)?;
    std::fs::rename(&tmp, path)?;
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;

    fn write_raw(dir: &Path, body: &str) -> PathBuf {
        let path = dir.join("settings.json");
        std::fs::write(&path, body).expect("escribir settings");
        path
    }

    #[test]
    fn missing_file_gives_defaults_without_creating() {
        let dir = tempfile::tempdir().expect("tempdir");
        let path = dir.path().join("settings.json");
        assert_eq!(load(&path), Settings::default());
        assert!(!path.exists(), "no debe crear nada");
    }

    #[test]
    fn roundtrip_keeps_values_and_version() {
        let dir = tempfile::tempdir().expect("tempdir");
        let path = dir.path().join("settings.json");
        let settings = Settings {
            version: SETTINGS_VERSION,
            docsets_dir: Some(PathBuf::from("C:/docs")),
            theme: ThemeMode::Dark,
            feed_url: Some("zealdocs/feeds".to_string()),
            catalog_fetched_at: Some(1_700_000_000),
        };
        assert!(save_if_changed(&path, &settings).expect("guardar"));
        assert_eq!(load(&path), settings);
        // El JSON lleva "version": 1.
        let raw = std::fs::read_to_string(&path).expect("leer");
        assert!(raw.contains("\"version\": 1"), "{raw}");
    }

    #[test]
    fn invalid_field_only_resets_that_field() {
        let dir = tempfile::tempdir().expect("tempdir");
        let path = write_raw(
            dir.path(),
            r#"{"version": 1, "docsets_dir": "C:/docs", "theme": "morado"}"#,
        );
        let settings = load(&path);
        assert_eq!(settings.docsets_dir, Some(PathBuf::from("C:/docs")));
        assert_eq!(settings.theme, ThemeMode::System);
    }

    #[test]
    fn corrupt_file_becomes_bak_and_fresh() {
        let dir = tempfile::tempdir().expect("tempdir");
        let path = write_raw(dir.path(), "{ esto no es json");
        let original = std::fs::read(&path).expect("leer original");
        assert_eq!(load(&path), Settings::default());
        // Original preservado en .bak, fichero fresco válido.
        assert_eq!(
            std::fs::read(path.with_extension("json.bak")).expect("bak"),
            original
        );
        assert_eq!(load(&path), Settings::default(), "el fresco debe parsear");
    }

    #[test]
    fn feed_fields_roundtrip_and_tolerate_garbage() {
        let dir = tempfile::tempdir().expect("tempdir");
        let path = write_raw(
            dir.path(),
            r#"{"version": 1, "feed_url": "  zealdocs/feeds  ", "catalog_fetched_at": 1700000000}"#,
        );
        let settings = load(&path);
        assert_eq!(settings.feed_url.as_deref(), Some("zealdocs/feeds"));
        assert_eq!(settings.catalog_fetched_at, Some(1_700_000_000));
        // Raros → None sin tumbar el resto.
        let path = write_raw(
            dir.path(),
            r#"{"version": 1, "feed_url": "", "catalog_fetched_at": "ayer", "theme": "dark"}"#,
        );
        let settings = load(&path);
        assert_eq!(settings.feed_url, None);
        assert_eq!(settings.catalog_fetched_at, None);
        assert_eq!(settings.theme, ThemeMode::Dark);
    }

    #[test]
    fn save_only_when_changed() {
        let dir = tempfile::tempdir().expect("tempdir");
        let path = dir.path().join("settings.json");
        let settings = Settings::default();
        assert!(save_if_changed(&path, &settings).expect("primera vez"));
        let mtime = std::fs::metadata(&path)
            .expect("meta")
            .modified()
            .expect("mtime");
        assert!(!save_if_changed(&path, &settings).expect("igual no escribe"));
        assert_eq!(
            std::fs::metadata(&path)
                .expect("meta")
                .modified()
                .expect("mtime"),
            mtime,
            "no debe tocar el fichero"
        );
        let other = Settings {
            theme: ThemeMode::Light,
            ..Settings::default()
        };
        assert!(save_if_changed(&path, &other).expect("cambio sí escribe"));
        assert_eq!(load(&path), other);
    }
}
