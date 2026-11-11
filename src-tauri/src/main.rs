// Prevents additional console window on Windows in release, DO NOT REMOVE!!
#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

fn main() {
    // Antes de crear el webview (NVIDIA + Wayland, ver `linux_gpu`).
    opendoc_lib::linux_gpu::apply_webkit_workarounds();
    opendoc_lib::run()
}
