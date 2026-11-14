use std::process::Command;

fn main() {
    if std::env::var("CARGO_CFG_TARGET_OS").as_deref() == Ok("macos") {
        println!("cargo:rerun-if-changed=src/mac_glass.m");
        let out = std::env::var("OUT_DIR").unwrap_or_default();
        let arch = std::env::var("CARGO_CFG_TARGET_ARCH").unwrap_or_default();
        let arch = if arch == "aarch64" { "arm64" } else { &arch };
        let target = format!("{arch}-apple-macos10.15");
        let object = format!("{out}/mac_glass.o");
        let archive = format!("{out}/libopendoc_mac_glass.a");
        let compiled = Command::new("xcrun")
            .args([
                "--sdk",
                "macosx",
                "clang",
                "-target",
                &target,
                "-fobjc-arc",
                "-c",
                "src/mac_glass.m",
                "-o",
                &object,
            ])
            .status();
        assert!(
            compiled.is_ok_and(|status| status.success()),
            "AppKit bridge requires the macOS 26 SDK"
        );
        let archived = Command::new("xcrun")
            .args(["libtool", "-static", "-o", &archive, &object])
            .status();
        assert!(
            archived.is_ok_and(|status| status.success()),
            "Unable to archive the AppKit bridge"
        );
        println!("cargo:rustc-link-search=native={out}");
        println!("cargo:rustc-link-lib=static=opendoc_mac_glass");
        println!("cargo:rustc-link-lib=framework=AppKit");
        println!("cargo:rustc-link-lib=framework=WebKit");
        println!("cargo:rustc-link-lib=framework=QuartzCore");
    }
    tauri_build::build()
}
