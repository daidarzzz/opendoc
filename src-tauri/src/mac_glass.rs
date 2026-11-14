use std::ffi::{c_char, c_void};

unsafe extern "C" {
    fn opendoc_glass_available() -> bool;
    fn opendoc_glass_sync(webview: *mut c_void, json: *const c_char, length: usize);
}

pub fn available() -> bool {
    // Availability check only. AppKit views are accessed through with_webview.
    unsafe { opendoc_glass_available() }
}

pub fn sync(window: &tauri::WebviewWindow, state: crate::commands::service::MacGlassState) {
    let Ok(json) = serde_json::to_vec(&state) else {
        return;
    };
    let _ = window.with_webview(move |webview| {
        // Tauri calls this closure on the UI thread with a live WKWebView.
        // AppKit decodes the payload synchronously without retaining the pointer.
        unsafe { opendoc_glass_sync(webview.inner(), json.as_ptr().cast(), json.len()) }
    });
}
