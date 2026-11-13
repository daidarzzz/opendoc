//! Ajustes de WebKitGTK para el render en Linux.

#[cfg(target_os = "linux")]
const DMABUF_VAR: &str = "WEBKIT_DISABLE_DMABUF_RENDERER";
#[cfg(target_os = "linux")]
const EXPLICIT_SYNC_VAR: &str = "__NV_DISABLE_EXPLICIT_SYNC";

#[cfg(any(target_os = "linux", test))]
fn uses_wayland(gdk_backend: Option<&str>, wayland_display: Option<&str>) -> bool {
    if !wayland_display.is_some_and(|display| !display.is_empty()) {
        return false;
    }

    // GDK prueba los backends en orden. Un '*' deja que elija el backend.
    gdk_backend.is_none_or(|backends| {
        backends
            .split(',')
            .map(str::trim)
            .find(|backend| matches!(*backend, "wayland" | "x11" | "broadway" | "*"))
            .is_some_and(|backend| matches!(backend, "wayland" | "*"))
    })
}

#[cfg(any(target_os = "linux", test))]
fn should_disable_explicit_sync(
    nvidia: bool,
    gdk_backend: Option<&str>,
    wayland_display: Option<&str>,
    has_graphics_override: bool,
) -> bool {
    nvidia && !has_graphics_override && uses_wayland(gdk_backend, wayland_display)
}

/// Aplica el ajuste antes de iniciar GTK y sus procesos auxiliares.
pub fn apply_webkit_workarounds() {
    #[cfg(target_os = "linux")]
    {
        let nvidia = std::path::Path::new("/proc/driver/nvidia/version").exists();
        let backend = std::env::var("GDK_BACKEND").ok();
        let wayland = std::env::var("WAYLAND_DISPLAY").ok();
        let has_graphics_override = [
            DMABUF_VAR,
            EXPLICIT_SYNC_VAR,
            "WEBKIT_DISABLE_COMPOSITING_MODE",
            "WEBKIT_DMABUF_RENDERER_FORCE_SHM",
        ]
        .iter()
        .any(|name| std::env::var_os(name).is_some());

        if should_disable_explicit_sync(
            nvidia,
            backend.as_deref(),
            wayland.as_deref(),
            has_graphics_override,
        ) {
            // Mantiene DMA-BUF y evita el fallo de sincronización explícita
            // de NVIDIA al presentar el primer frame en Wayland.
            std::env::set_var(EXPLICIT_SYNC_VAR, "1");
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn nvidia_wayland_keeps_dmabuf() {
        assert!(should_disable_explicit_sync(
            true,
            None,
            Some("wayland-1"),
            false
        ));
        assert!(should_disable_explicit_sync(
            true,
            Some("wayland,x11"),
            Some("wayland-1"),
            false
        ));
    }

    #[test]
    fn leaves_other_environments_and_graphics_overrides_alone() {
        assert!(!should_disable_explicit_sync(
            false,
            None,
            Some("wayland-1"),
            false
        ));
        assert!(!should_disable_explicit_sync(true, None, None, false));
        assert!(!should_disable_explicit_sync(true, None, Some(""), false));
        assert!(!should_disable_explicit_sync(
            true,
            Some("x11,wayland"),
            Some("wayland-1"),
            false
        ));
        assert!(!should_disable_explicit_sync(
            true,
            None,
            Some("wayland-1"),
            true
        ));
    }
}
