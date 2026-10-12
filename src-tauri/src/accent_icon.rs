//! Icono de la app en ejecución según el acento.
//!
//! - Los PNG (`src-tauri/gen-icons/accent-*.png`, 512 px, variante "box")
//!   los genera `scripts/gen-accent-icons.*` desde el SVG original; los del
//!   bundle (`src-tauri/icons/`) no se tocan y la variante roja coincide con
//!   ellos (mismo SVG de origen).
//! - Windows/Linux: `Window::set_icon` (ventana y barra de tareas). macOS:
//!   esa API no está soportada y el icono va al Dock con
//!   `NSApplication.setApplicationIconImage` (solo `cfg(target_os = "macos")`).
//! - Límite: solo cambia el icono en ejecución. El del ejecutable,
//!   instalador, `.app` en Finder y accesos directos sigue siendo el rojo
//!   del bundle. Si el Dock vuelve al original al cerrar, es esperado.
//! - Todo best-effort y sin `unwrap()`: si algo falla, queda el icono del bundle.

use crate::settings::Accent;

/// PNG "box" del acento, embebido en el binario.
pub fn icon_bytes(accent: Accent) -> &'static [u8] {
    match accent {
        Accent::Red => include_bytes!("../gen-icons/accent-red.png"),
        Accent::Blue => include_bytes!("../gen-icons/accent-blue.png"),
        Accent::Amber => include_bytes!("../gen-icons/accent-amber.png"),
        Accent::Catppuccin => include_bytes!("../gen-icons/accent-catppuccin.png"),
    }
}

/// Aplica el icono a la ventana principal (`"main"`). En macOS solo toca
/// el Dock (la API de ventana no lo soporta allí).
pub fn apply_to_main_window(app: &tauri::AppHandle, accent: Accent) {
    let png = icon_bytes(accent);
    #[cfg(target_os = "macos")]
    {
        apply_dock_icon(png);
        return;
    }
    #[cfg(not(target_os = "macos"))]
    {
        use tauri::Manager;
        let Some(window) = app.get_webview_window("main") else {
            return;
        };
        match tauri::image::Image::from_bytes(png) {
            Ok(image) => {
                let _ = window.set_icon(image);
            }
            Err(e) => {
                if cfg!(debug_assertions) {
                    eprintln!("[opendoc] no se pudo aplicar el icono de acento: {e}");
                }
            }
        }
    }
}

/// Icono del Dock en macOS. Exige el hilo principal (los comandos Tauri
/// corren en hilos de fondo): fuera de él no se toca nada para no
/// arriesgar AppKit. Revisado a mano contra objc2-app-kit 0.3; no se ha
/// podido compilar para macOS en este equipo (ver SPEC).
#[cfg(target_os = "macos")]
fn apply_dock_icon(png: &[u8]) {
    use objc2::{AnyThread, MainThreadMarker};
    use objc2_app_kit::{NSApplication, NSImage};
    use objc2_foundation::NSData;

    let Some(mtm) = MainThreadMarker::new() else {
        return;
    };
    let data = NSData::with_bytes(png);
    let Some(image) = NSImage::initWithData(NSImage::alloc(), &data) else {
        return;
    };
    let app = NSApplication::sharedApplication(mtm);
    // SAFETY: se pasa `Some` (el aviso de `None` no aplica).
    unsafe { app.setApplicationIconImage(Some(&image)) };
}

#[cfg(test)]
mod tests {
    use super::*;

    /// Firma PNG.
    const PNG_MAGIC: [u8; 8] = [137, 80, 78, 71, 13, 10, 26, 10];

    #[test]
    fn every_accent_embeds_a_non_empty_png() {
        for accent in [Accent::Red, Accent::Blue, Accent::Amber, Accent::Catppuccin] {
            let bytes = icon_bytes(accent);
            assert!(!bytes.is_empty(), "{accent:?}");
            assert_eq!(&bytes[..8], &PNG_MAGIC, "{accent:?}");
        }
    }
}
