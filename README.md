# OpenDoc

> Read this in [Español](./README.es.md).

**A fast, modern offline documentation viewer.** Search thousands of functions, classes, and guides in milliseconds with no active internet connection and a polished desktop interface.

OpenDoc reads the standard **docset** format (the same one created by Dash and used by Zeal), so you can point it at your existing docsets folder and start browsing immediately.

> **Current version: v0.2.70.** OpenDoc includes tabbed browsing with persistent sessions, an in-memory fuzzy search engine, symbol navigation by type, customizable theme accents, and complete docset management from configurable feeds.

---

## Why OpenDoc?

While Zeal is a proven community tool, its Qt/C++ interface feels dated and offers little personalization. OpenDoc was built from scratch as a modern desktop alternative designed around four core principles:

- **Instant search & low overhead:** Starts in milliseconds, holds search indices in memory with `nucleo-matcher` (<50 ms across 300,000 entries), and maintains a compact footprint (<80 MB RAM in standby).
- **Keyboard-first & visual polish:** Clean interface with light, dark, and system themes, 4 custom accent colors, and a Command Palette (`Ctrl+K` / `Cmd+K`) inspired by VS Code and Obsidian.
- **Full docset compatibility:** Auto-detects standard SQLite (`searchIndex`) and Core Data schemas (`ZTOKEN...`), reads `Info.plist`, extracts *tarix* archives safely, and resolves internal documentation routes securely.
- **Robust security & isolation:** Renders documentation in an isolated `<iframe>` (`sandbox="allow-scripts"`), uses a dedicated `opendoc://` local protocol to block path traversal, and opens external web links directly in your default browser.

---

## Key Features

### Search & Navigation
- **Command Palette (`Ctrl+K` / `Cmd+K`):** Global live search modal with full keyboard navigation (arrows, Enter, Esc), symbol type badges, and instant matching.
- **In-Memory Fuzzy Engine:** Multi-tiered ranking via `nucleo-matcher`: exact match > prefix > fuzzy match > last segment match, with type-aware boosts (classes and functions ranked ahead of guides or sections).
- **Prefix Filters (`docset:query`):** Target specific docsets directly from the search bar (e.g., `cpp:vector`, `py:dumps`, or `rust,go:channel`).
- **Browse by Symbol Type:** Inspect all entries categorized by kind (functions, classes, modules, properties, types) with real-time counters and paginated listings.

### Workspace & Viewing
- **Independent Tabs & History:** Forward and backward navigation per tab, reorderable tabs via drag-and-drop, link prefetching on hover to eliminate white-flash transitions, and middle-click or `Ctrl/Cmd+click` to open in new tabs.
- **Session Persistence:** Remembers open tabs, active tab, navigation history, and scroll positions across restarts via `session.json` (with atomic disk writes and automatic `.bak` backups). Can be toggled on or off in Settings.
- **Safe Viewer Protocol (`opendoc://`):** Serves local documentation files while preventing directory traversal (`..`, symlinks, drive letters, and percent-encoding attacks). Trackpad wheel scrolling is seamlessly bridged across iframe boundaries.
- **External Link Protection:** External hyperlinks (`http://`, `https://`, `mailto:`) automatically open in your operating system's default browser rather than navigating the viewer window.

### Docset Management & Catalog
- **Configurable Feeds Catalog:** Add and refresh custom feed repositories (such as `zealdocs/feeds` or compatible XML feeds).
- **One-Click Installation:** Downloads `.tgz` archives with real-time byte and file progress notifications (`docset-progress`), validates archive integrity, and performs atomic folder replacements.
- **Update Checks & Uninstallation:** Tristate version comparisons identify available updates for installed packages, with safe, validated uninstallation from the configured folder.
- **Mirror Fallbacks & Speed Caching:** Automatically retries alternative download mirrors if a host fails, remembering the fastest responding mirror (`fast_mirror`) for future requests.
- **Tarix Support:** Detects docsets packaged as *tarix* (`tarix.tgz`), extracting them safely on demand into the app's cache directory without modifying your source docsets directory.

### Customization & Accessibility
- **Themes (Light / Dark / System):** High-contrast UI theme switching. Docset contents always preserve their authentic light documentation styling to prevent broken inversion artifacts on code samples, tables, and diagrams.
- **Accent Colors:** Choose between **Red**, **Blue**, **Amber**, or **Catppuccin** (Latte/Mocha Mauve). Updates UI highlights, branded buttons, the app logo, and the running window/Dock icon in real time.
- **Bilingual Interface:** Fully localized in **English** (default) and **Spanish**, switchable live from Settings with 100% dictionary key parity.

---

## Technology Stack

```
opendoc/
├── Frontend:    React 19, TypeScript, Tailwind CSS v3, Vite, Zustand
├── Desktop App: Tauri v2 (Window management, IPC, secure protocol, native dialogs)
└── Shared Core: opendoc-core (Pure Rust: scan, SQLite index, tarix, fuzzy search, path resolution)
```

The desktop application pairs with:
- **[`opendoc-core`](https://github.com/daidarzzz/opendoc-core):** The shared, headless Rust engine that powers indexing and search without GUI or network dependencies.
- **[`opendoc-cli` (`odc`)](https://github.com/daidarzzz/opendoc-cli):** The companion command-line interface for lightning-fast docset searching and document launching directly from the terminal.

---

## Prerequisites

- [Node.js](https://nodejs.org/) (v22 or v24 recommended) and `npm`.
- Stable [Rust](https://rustup.rs/) (edition 2021).
- **Windows:** Visual Studio C++ Build Tools and WebView2 (pre-installed on Windows 11 and updated Windows 10).
- **macOS:** Xcode Command Line Tools (`xcode-select --install`).
- **Linux:** WebKitGTK and Tauri v2 system libraries (e.g. `libwebkit2gtk-4.1-dev`, `libappindicator3-dev`, `librsvg2-dev`). See the [Tauri v2 prerequisites](https://v2.tauri.app/start/prerequisites/).

---

## Getting Started

### 1. Clone & Run in Development

```bash
git clone https://github.com/daidarzzz/opendoc.git
cd opendoc
npm install
npm run tauri dev
```

> Always use `npm run tauri dev`. Running `npm run dev` launches only the Vite browser preview, where native Tauri backend commands are unavailable.

### 2. Adding Documentation Sets

OpenDoc **does not ship with proprietary docsets**.
- If you already use Zeal or Dash, you can open **Settings** and set your docsets folder to your existing directory.
- Alternatively, leave the default directory (`<app_data>/docsets`) and open the **Catalog** tab to download docsets from community feeds.
- Any standard folder ending in `.docset` placed in your configured directory will be automatically detected on launch or upon saving changes.

### 3. Building Installers

```bash
npm run tauri build
```

Compiled binaries land in `src-tauri/target/release/` and platform installers (.exe, .msi, .dmg, .deb, .AppImage) in `src-tauri/target/release/bundle/`.

---

## Development & Testing

Before submitting changes, ensure all tests, linters, and typechecks pass:

```bash
# Frontend tests (Vitest: 105 tests covering stores, session sync, i18n, etc.)
npm test

# Frontend typechecking
npx tsc --noEmit

# Rust test suite (83 unit and integration tests)
cargo test --manifest-path src-tauri/Cargo.toml

# Rust linter
cargo clippy --manifest-path src-tauri/Cargo.toml --all-targets -- -D warnings

# Rust formatting check
cargo fmt --manifest-path src-tauri/Cargo.toml -- --check
```

Tests using real docset fixtures (`CSS.docset`, `Python_3.docset`, `C++.docset`, `Swift.docset`) expect files in `src-tauri/tests/fixtures/`. If fixtures are absent, the corresponding tests are cleanly skipped with a `SKIP` notice, ensuring a fresh `git clone` always passes `cargo test`. See [`src-tauri/tests/fixtures/README.md`](./src-tauri/tests/fixtures/README.md) for details.

### Developing Against a Local `opendoc-core`

By default, OpenDoc references `opendoc-core` via a pinned Git tag in `src-tauri/Cargo.toml`. To test local core modifications simultaneously, uncomment the `[patch]` section at the bottom of `src-tauri/Cargo.toml`:

```toml
[patch."https://github.com/daidarzzz/opendoc-core"]
opendoc-core = { path = "../../opendoc-core" }
```

Remember to comment the patch block back out before committing.

---

## Known Limitations

- **Unsigned Binaries:** Installers and executables are currently unsigned. Windows SmartScreen and macOS Gatekeeper will display standard unknown publisher warnings when installing or launching for the first time.
- **Content Dark Mode:** Docsets always render with their original light presentation. Dark mode applies exclusively to the OpenDoc UI chrome. (Global CSS filter inversion was disabled due to broken contrast and visual glitches on code snippets and tables; per-docset theme CSS is planned for a future update).
- **Accent Icon Scope:** Color accents update the UI and the running application icon (taskbar and macOS Dock). The static `.exe` file, installer, and Finder file icons remain in the brand red.
- **Tarix Disk Usage:** Extracted tarix docsets require significant disk space in `tarix-cache/` (tens or hundreds of megabytes per docset).
- **Linux WebKitGTK:** Linux rendering behavior depends on the system WebKitGTK version and may exhibit minor visual differences compared to WebView2 (Windows) and WebKit (macOS).

---

## Roadmap

- [x] **v0.1 (MVP):** Docset scanning, SQLite index parsing (standard & Core Data), in-memory fuzzy search, Command Palette, secure `opendoc://` viewer, settings, and themes.
- [x] **v0.2 (Daily Driver):** Tabbed navigation with per-tab history, persistent sessions across restarts, symbol navigation by type, prefix filtering, and configurable catalog manager (download, install, update, and uninstall).
- [ ] **v0.3 (Enhancements):** Bookmarks / favorites, in-page Table of Contents (TOC), and extraction cancellation.
- [ ] **v1.0 (Refinements):** Custom per-docset dark CSS themes, refined syntax highlighting, single-instance enforcement, and stress validation across large docset libraries (20+ docsets).

For deep architectural details, consult [`SPEC.md`](./SPEC.md). Operational guidance for AI agents and contributors is documented in [`AGENTS.md`](./AGENTS.md).

---

## License

Copyright (C) 2026 daidarzzz.

OpenDoc is free software, licensed under the **GNU General Public License v3.0 or later (GPL-3.0-or-later)**. See [`LICENSE`](./LICENSE) for full details.

Each documentation set you load remains the intellectual property of its respective authors and retains its own license; OpenDoc neither includes nor redistributes third-party documentation.

---

## Acknowledgments

- [Zeal](https://zealdocs.org/) and [Dash](https://kapeli.com/dash) for establishing the offline docset ecosystem. OpenDoc is an independent project and is not affiliated with either tool.
- [Catppuccin](https://catppuccin.com/) for the Mauve palette values (Latte/Mocha) utilized in the accent color scheme (MIT License).
- [nucleo-matcher](https://github.com/helix-editor/nucleo) for high-performance in-memory fuzzy matching.
