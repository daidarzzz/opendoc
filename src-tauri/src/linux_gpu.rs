//! Ajustes de WebKitGTK para el render en Linux.
//!
//! Con el driver propietario de NVIDIA en Wayland, el renderizador DMA-BUF
//! de WebKitGTK suele caer a un camino muy lento (o dejar la ventana en
//! blanco): la interfaz va a tirones. Desactivarlo con
//! `WEBKIT_DISABLE_DMABUF_RENDERER=1` mantiene la aceleración por GPU por
//! la vía clásica. Solo se aplica en esa combinación y nunca pisa un valor
//! que el usuario ya haya puesto.

/// Variable de WebKitGTK que desactiva el renderizador DMA-BUF.
pub const DMABUF_VAR: &str = "WEBKIT_DISABLE_DMABUF_RENDERER";

/// Decide si hay que desactivar el renderizador DMA-BUF (lógica pura).
pub fn needs_dmabuf_workaround(
    nvidia_proprietary: bool,
    wayland_display: Option<&str>,
    user_value: Option<&str>,
) -> bool {
    nvidia_proprietary && wayland_display.is_some_and(|d| !d.is_empty()) && user_value.is_none()
}

/// Aplica el ajuste al arrancar, antes de crear cualquier webview (el
/// proceso aún tiene un solo hilo). No hace nada fuera de Linux.
pub fn apply_webkit_workarounds() {
    #[cfg(target_os = "linux")]
    {
        let nvidia = std::path::Path::new("/proc/driver/nvidia/version").exists();
        let wayland = std::env::var("WAYLAND_DISPLAY").ok();
        let user = std::env::var(DMABUF_VAR).ok();
        if needs_dmabuf_workaround(nvidia, wayland.as_deref(), user.as_deref()) {
            std::env::set_var(DMABUF_VAR, "1");
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn solo_con_nvidia_en_wayland() {
        assert!(needs_dmabuf_workaround(true, Some("wayland-1"), None));
        assert!(!needs_dmabuf_workaround(false, Some("wayland-1"), None));
        assert!(!needs_dmabuf_workaround(true, None, None));
        assert!(!needs_dmabuf_workaround(true, Some(""), None));
    }

    #[test]
    fn respeta_el_valor_del_usuario() {
        assert!(!needs_dmabuf_workaround(true, Some("wayland-1"), Some("0")));
        assert!(!needs_dmabuf_workaround(true, Some("wayland-1"), Some("1")));
    }
}
