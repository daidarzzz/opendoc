//! Política de navegación de la ventana principal (T8).
//!
//! El visor carga HTML de terceros (docsets) en un `<iframe>`: los clics
//! en enlaces externos (`http(s)` fuera de nuestros hosts) se abren en el
//! navegador del sistema y nunca en el visor. wry dispara el handler para
//! navegaciones de iframes también (sin filtrar por frame), así que esto
//! cubre los enlaces dentro del iframe.
//!
//! La decisión es pura y testeable; el cableado con el opener está en
//! `lib.rs` (`setup` + `on_navigation`).

/// Qué hacer con una navegación (solo importan esquema y host).
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum NavAction {
    /// Cargar en el webview (app, docsets, localhost de dev).
    Allow,
    /// Abrir en el navegador del sistema y cancelar en el webview.
    OpenExternal,
    /// Cancelar sin más (`javascript:`, esquemas desconocidos...).
    Block,
}

/// Decide por esquema y host. `host` es `None` en URIs sin host.
pub fn nav_decision(scheme: &str, host: Option<&str>) -> NavAction {
    match scheme {
        // Nuestros esquemas + inicial del iframe.
        "opendoc" | "tauri" | "ipc" | "about" => NavAction::Allow,
        "http" | "https" => match host {
            Some(h)
                if h == "localhost"
                    || h == "127.0.0.1"
                    || h == "opendoc.localhost"
                    || h.ends_with(".localhost") =>
            {
                NavAction::Allow
            }
            _ => NavAction::OpenExternal,
        },
        // Abren app externa asociada.
        "mailto" | "tel" => NavAction::OpenExternal,
        _ => NavAction::Block,
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn internal_urls_are_allowed() {
        for (scheme, host) in [
            ("opendoc", Some("css")),
            ("opendoc", Some("localhost")),
            ("tauri", Some("localhost")),
            ("ipc", Some("localhost")),
            ("about", None),
            ("http", Some("localhost")),
            ("http", Some("127.0.0.1")),
            ("http", Some("opendoc.localhost")),
            ("https", Some("tauri.localhost")),
        ] {
            assert_eq!(nav_decision(scheme, host), NavAction::Allow);
        }
    }

    #[test]
    fn external_urls_go_to_browser() {
        for (scheme, host) in [
            ("https", Some("developer.mozilla.org")),
            ("http", Some("example.com")),
            ("mailto", None),
            ("tel", None),
        ] {
            assert_eq!(nav_decision(scheme, host), NavAction::OpenExternal);
        }
    }

    #[test]
    fn dangerous_urls_are_blocked() {
        for (scheme, host) in [
            ("javascript", None),
            ("file", None),
            ("data", None),
            ("ftp", Some("example.com")),
        ] {
            assert_eq!(nav_decision(scheme, host), NavAction::Block);
        }
    }
}
