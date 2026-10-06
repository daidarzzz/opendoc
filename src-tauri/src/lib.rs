// Módulos de lógica de OpenDoc (independientes de Tauri y testeables).
// Los `#[tauri::command]` vivirán en `commands` y solo delegarán en ellos.
// v0.1 (MVP): docset, search, protocol, commands, settings.
// Fases posteriores: `download` (catálogo/descargas, v0.3), pestañas/favoritos (v0.2, frontend).
pub mod commands;
pub mod docset;
pub mod protocol;
pub mod search;
pub mod settings;

// Learn more about Tauri commands at https://tauri.app/develop/calling-rust/
#[tauri::command]
fn greet(name: &str) -> String {
    format!("Hello, {}! You've been greeted from Rust!", name)
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .invoke_handler(tauri::generate_handler![greet])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
