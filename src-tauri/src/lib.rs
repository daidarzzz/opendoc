// Módulos de lógica de OpenDoc (independientes de Tauri y testeables).
// F2: `catalog` + `docset::install` (gestor de docsets); quedan
// pestañas/favoritos (v0.2, frontend).
pub mod browse;
pub mod catalog;
pub mod commands;
pub mod docset;
pub mod navigation;
pub mod profile;
pub mod protocol;
pub mod search;
pub mod settings;

use commands::{
    extract_tarix, get_catalog_status, get_docset_home, get_install_status, get_settings,
    install_docset, list_catalog, list_docsets, list_entries, list_kinds, refresh_catalog, search,
    set_docsets_dir, set_feed_repo, set_theme, AppState,
};

/// Carga ajustes al arrancar. Nunca tumba el arranque: sin ajustes,
/// corruptos o con ruta inexistente se arranca vacío (la UI muestra el
/// banner para elegir carpeta).
/// La carga de docsets NO se hace aquí (F1): la única carga efectiva es
/// la de `init()` del frontend (`set_docsets_dir`), que devuelve el
/// `ScanReport` que el preload descartaba.
fn load_startup_state(app: &mut tauri::App) {
    use tauri::Manager;
    let Some(data_dir) = app.path().app_data_dir().ok() else {
        return;
    };
    let settings_path = settings::settings_file(&data_dir);
    let settings = settings::load(&settings_path);
    let Some(state) = app.try_state::<AppState>() else {
        return;
    };
    if let Ok(mut guard) = state.settings.lock() {
        *guard = settings;
    }
    // Limpieza de restos de extracciones interrumpidas (barata: solo
    // nombres `*.tmp`/`*.old`, sin validar contenidos).
    docset::tarix::cleanup_stale_cache(&data_dir.join("tarix-cache"));
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    let result = tauri::Builder::default()
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_os::init())
        .manage(AppState::default())
        .register_uri_scheme_protocol("opendoc", protocol::handle)
        .setup(|app| {
            // Ajustes persistentes (T9): se leen del directorio de datos
            // de la app. Si la carpeta guardada existe, se precarga para
            // que el arranque caiga directo en el contenido.
            load_startup_state(app);
            // Ventana creada en código (no en tauri.conf.json) para poder
            // enganchar on_navigation: los enlaces externos del iframe van
            // al navegador del sistema y nunca se cargan en el visor.
            let handle = app.handle().clone();
            tauri::WebviewWindowBuilder::new(
                app,
                "main",
                tauri::WebviewUrl::App("index.html".into()),
            )
            .title("OpenDoc")
            .inner_size(800.0, 600.0)
            .on_navigation(move |url| {
                match navigation::nav_decision(url.scheme(), url.host_str()) {
                    navigation::NavAction::Allow => true,
                    navigation::NavAction::Block => false,
                    navigation::NavAction::OpenExternal => {
                        use tauri_plugin_opener::OpenerExt;
                        if let Err(e) = handle.opener().open_url(url.as_str(), None::<&str>) {
                            if cfg!(debug_assertions) {
                                eprintln!("[opendoc] no se pudo abrir {url}: {e}");
                            }
                        }
                        false
                    }
                }
            })
            .build()?;
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            list_docsets,
            set_docsets_dir,
            search,
            list_kinds,
            list_entries,
            get_docset_home,
            get_settings,
            set_theme,
            extract_tarix,
            get_catalog_status,
            set_feed_repo,
            refresh_catalog,
            list_catalog,
            install_docset,
            get_install_status
        ])
        .run(tauri::generate_context!());
    if let Err(e) = result {
        eprintln!("error while running tauri application: {e}");
        std::process::exit(1);
    }
}
