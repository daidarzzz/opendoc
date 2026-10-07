// Módulos de lógica de OpenDoc (independientes de Tauri y testeables).
// Fases posteriores: `download` (catálogo/descargas, v0.3), pestañas/favoritos (v0.2, frontend).
pub mod commands;
pub mod docset;
pub mod protocol;
pub mod search;
pub mod settings;

use commands::{get_docset_home, list_docsets, search, set_docsets_dir, AppState};

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    let result = tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .manage(AppState::default())
        .invoke_handler(tauri::generate_handler![
            list_docsets,
            set_docsets_dir,
            search,
            get_docset_home
        ])
        .run(tauri::generate_context!());
    if let Err(e) = result {
        eprintln!("error while running tauri application: {e}");
        std::process::exit(1);
    }
}
