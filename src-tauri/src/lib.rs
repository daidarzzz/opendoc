// Módulos de lógica de OpenDoc (independientes de Tauri y testeables).
// F2: `catalog` + `docset::install` (gestor de docsets); quedan
// pestañas/favoritos (v0.2, frontend).
pub mod accent_icon;
pub mod browse;
pub mod catalog;
pub mod commands;
pub mod docset;
pub mod navigation;
pub mod persist;
pub mod profile;
pub mod protocol;
pub mod search;
pub mod session;
pub mod settings;

use tauri::Emitter;

use commands::{
    confirm_exit, extract_tarix, get_catalog_status, get_docset_home, get_install_status,
    get_session, get_settings, install_docset, list_catalog, list_docsets, list_entries,
    list_kinds, refresh_catalog, save_session, search, set_accent, set_docsets_dir, set_feed_repo,
    set_language, set_restore_tabs, set_theme, uninstall_docset, AppState,
};

/// Carga ajustes al arrancar. Si no hay carpeta configurada, asigna
/// `app_data/docsets`; una ruta elegida que ya no exista sigue mostrándose
/// como no disponible para que el usuario pueda cambiarla.
/// La carga de docsets NO se hace aquí (F1): la única carga efectiva es
/// la de `init()` del frontend (`set_docsets_dir`), que devuelve el
/// `ScanReport` que el preload descartaba.
fn load_startup_state(app: &mut tauri::App) {
    use tauri::Manager;
    let Some(data_dir) = app.path().app_data_dir().ok() else {
        return;
    };
    let settings_path = settings::settings_file(&data_dir);
    let mut settings = settings::load(&settings_path);
    if settings.docsets_dir.is_none() {
        let default_dir = data_dir.join("docsets");
        if std::fs::create_dir_all(&default_dir).is_ok() {
            settings.docsets_dir = Some(default_dir);
            let _ = settings::save_if_changed(&settings_path, &settings);
        }
    }
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
    let built = tauri::Builder::default()
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
            // Icono en ejecución según el acento guardado (barra de tareas
            // o Dock; en macOS el `setup` corre en el hilo principal). Es lo
            // primero tras crear la ventana; si falla, queda el rojo del bundle.
            use tauri::Manager;
            if let Some(state) = app.try_state::<AppState>() {
                if let Ok(accent) = state.settings.lock().map(|guard| guard.accent) {
                    crate::accent_icon::apply_to_main_window(app.handle(), accent);
                }
            }
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            confirm_exit,
            list_docsets,
            set_docsets_dir,
            search,
            list_kinds,
            list_entries,
            get_docset_home,
            get_settings,
            set_theme,
            set_accent,
            set_language,
            set_restore_tabs,
            get_session,
            save_session,
            extract_tarix,
            get_catalog_status,
            set_feed_repo,
            refresh_catalog,
            list_catalog,
            install_docset,
            get_install_status,
            uninstall_docset,
            confirm_exit
        ])
        .build(tauri::generate_context!());
    let app = match built {
        Ok(app) => app,
        Err(e) => {
            eprintln!("error while running tauri application: {e}");
            std::process::exit(1);
        }
    };
    app.run(|handle, event| {
        use tauri::RunEvent;
        match event {
            // Cmd+Q / Quit del dock (macOS) no pasa por onCloseRequested:
            // se frena la salida, se avisa al frontend para volcar la
            // sesión y un hilo de respaldo sale solo por si no responde.
            RunEvent::ExitRequested { api, code, .. } => {
                api.prevent_exit();
                let _ = handle.emit("opendoc-exit-requested", ());
                let handle = handle.clone();
                std::thread::spawn(move || {
                    std::thread::sleep(std::time::Duration::from_millis(2500));
                    handle.exit(code.unwrap_or(0));
                });
            }
            // En macOS cerrar la última ventana no termina el proceso y
            // esta app no tiene menú ni dock para reabrir: se sale.
            RunEvent::WindowEvent {
                label,
                event: tauri::WindowEvent::Destroyed,
                ..
            } if label == "main" => {
                #[cfg(target_os = "macos")]
                handle.exit(0);
            }
            _ => {}
        }
    });
}
