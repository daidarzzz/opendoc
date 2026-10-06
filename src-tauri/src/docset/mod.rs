//! Escaneo de carpetas `.docset`, lectura de `Info.plist` y de los
//! índices SQLite (esquemas `searchIndex` y Core Data `ZTOKEN*`).
//!
//! Toda la lógica debe ser independiente de Tauri y estar cubierta por
//! tests con docsets reales en `src-tauri/tests/fixtures/`.
//!
//! Tarea 2: `model.rs` (Docset/Entry), `scanner.rs`, `plist.rs`, `index.rs`.
