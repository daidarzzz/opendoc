//! Icono de la app en ejecución según el acento.
//!
//! - Los PNG (`src-tauri/gen-icons/accent-*.png` 512px y `accent-*@2x.png` 1024px,
//!   variante "box") los genera `scripts/gen-accent-icons.*` desde el SVG original;
//!   los del bundle (`src-tauri/icons/`) no se tocan y la variante roja coincide con
//!   ellos (mismo SVG de origen).
//! - Windows/Linux: `Window::set_icon` (ventana y barra de tareas). macOS:
//!   esa API no está soportada y el icono va al Dock con un `NSImage` multi-resolución
//!   construido a partir de los PNG 1x (512px) y 2x (1024px).
//! - Límite: solo cambia el icono en ejecución. El del ejecutable,
//!   instalador, `.app` en Finder y accesos directos sigue siendo el rojo
//!   del bundle. Si el Dock vuelve al original al cerrar, es esperado.
//! - Todo best-effort y sin `unwrap()`: si algo falla, queda el icono del bundle.

use crate::settings::Accent;

/// PNG "box" del acento 1x (512px), embebido en el binario.
fn icon_bytes_1x(accent: Accent) -> &'static [u8] {
    match accent {
        Accent::Red => include_bytes!("../gen-icons/accent-red.png"),
        Accent::Blue => include_bytes!("../gen-icons/accent-blue.png"),
        Accent::Amber => include_bytes!("../gen-icons/accent-amber.png"),
        Accent::Catppuccin => include_bytes!("../gen-icons/accent-catppuccin.png"),
    }
}

/// PNG "box" del acento 2x (1024px), embebido en el binario. Solo se usa en macOS.
#[cfg(target_os = "macos")]
fn icon_bytes_2x(accent: Accent) -> &'static [u8] {
    match accent {
        Accent::Red => include_bytes!("../gen-icons/accent-red@2x.png"),
        Accent::Blue => include_bytes!("../gen-icons/accent-blue@2x.png"),
        Accent::Amber => include_bytes!("../gen-icons/accent-amber@2x.png"),
        Accent::Catppuccin => include_bytes!("../gen-icons/accent-catppuccin@2x.png"),
    }
}

/// PNG "box" del acento (512px) para compatibilidad con Windows/Linux.
pub fn icon_bytes(accent: Accent) -> &'static [u8] {
    icon_bytes_1x(accent)
}

/// Aplica el icono a la ventana principal (`"main"`). En macOS solo toca
/// el Dock (la API de ventana no lo soporta allí).
pub fn apply_to_main_window(app: &tauri::AppHandle, accent: Accent) {
    let png_1x = icon_bytes_1x(accent);
    #[cfg(target_os = "macos")]
    {
        let png_2x = icon_bytes_2x(accent);
        apply_dock_icon(png_1x, png_2x);
        return;
    }
    #[cfg(not(target_os = "macos"))]
    {
        use tauri::Manager;
        let Some(window) = app.get_webview_window("main") else {
            return;
        };
        match tauri::image::Image::from_bytes(png_1x) {
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
/// arriesgar AppKit. Construye un NSImage multi-resolución con
/// representaciones 1x (512px) y 2x (1024px) para que se vea correctamente
/// en pantallas Retina y no Retina.
#[cfg(target_os = "macos")]
fn apply_dock_icon(png_1x: &[u8], png_2x: &[u8]) {
    use objc2::msg_send;
    use objc2::AnyThread;
    use objc2::MainThreadMarker;
    use objc2_app_kit::{NSApplication, NSBitmapImageRep, NSImage, NSSize};
    use objc2_foundation::NSData;

    let Some(_mtm) = MainThreadMarker::new() else {
        return;
    };

    // Crear NSImage vacío (obj2 0.6: alloc() sin args, init via msg_send)
    let image = unsafe { msg_send![NSImage::alloc(), init] };

    // Agregar representación 1x (512px)
    let data_1x = NSData::with_bytes(png_1x);
    if let Some(rep1x) = NSBitmapImageRep::imageRepWithData(&data_1x) {
        rep1x.setSize(unsafe { NSSize::new(512.0, 512.0) });
        image.addRepresentation(&rep1x);
    }

    // Agregar representación 2x (1024px)
    let data_2x = NSData::with_bytes(png_2x);
    if let Some(rep2x) = NSBitmapImageRep::imageRepWithData(&data_2x) {
        rep2x.setSize(unsafe { NSSize::new(512.0, 512.0) });
        image.addRepresentation(&rep2x);
    }

    let _app = NSApplication::sharedApplication();
    // SAFETY: se pasa `Some` (el aviso de `None` no aplica).
    unsafe { _app.setApplicationIconImage(Some(&image)) };
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
