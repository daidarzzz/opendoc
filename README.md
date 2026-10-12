# OpenDoc

> Léelo en [Español](./README.es.md).

**A fast, modern offline documentation viewer.** Search thousands of functions, classes and guides in milliseconds, with no connection and a polished interface.

OpenDoc reads the **docset** format (the same one Dash and Zeal use), so you can point it at your docsets folder and start searching.

> **Current version: v0.2.65.** OpenDoc already includes tabs and history, settings, and docset management from a configurable catalog. The project is still under development; see the [roadmap](#roadmap).

## Why it exists

Zeal is an excellent tool, but its interface (C++/Qt) feels dated and is hard to personalize. OpenDoc is a brand-new client, written from scratch (not a fork), built around three ideas:

- **Truly fast:** near-instant startup, in-memory search and low RAM usage.
- **Visually polished:** light/dark theme, command palette and keyboard-first, in the style of Obsidian or VS Code.
- **Compatible:** reads the docsets you already have, including the *tarix* format.

## Current features

- **Command palette** (`Ctrl+K` / `Cmd+K`) with live fuzzy search and full keyboard support (↑/↓, Enter, Esc).
- **In-memory search** with `nucleo`: exact match > prefix > fuzzy, with priority by type (classes and functions before sections). Measured: ~37 ms with 300,000 entries in a release build.
- **Tabs and independent history**: back/forward per tab, draggable reorderable tabs, and internal links prepared as you hover to cut navigation wait.
- **Browse by type**: navigate classes, functions and other entries with counters, plus filtering search by docset (`cpp:vector`).
- **Built-in viewer** with its own `opendoc://` protocol and isolated `<iframe>` (`sandbox`), protected against malicious paths (`..`, absolute paths, symlinks, double encodings).
- **Configurable catalog**: browse feeds, install `.tgz` docsets, reinstall versions, check for updates and uninstall installed docsets.
- **Docset compatibility:**
  - `searchIndex` index and Core Data schema (`ZTOKEN`…), auto-detected.
  - `Info.plist` reading.
  - **tarix** docsets: extracted once into their own cache, with security validation and without touching your docsets folder.
- **Light / dark / system theme** for the app, with persistent settings. Docsets always render with their original light style: dark mode for content is disabled (it will return with per-docset themes).
- **Accent color** (Settings): Red, Blue, Amber or Catppuccin. It recolors the logo, the UI highlights and the running app icon (taskbar / Dock). Errors keep their own fixed red, independent of the accent.
- **Persistent settings** for the theme, the docsets folder and the catalog repository.
- **Interface in English (default) and Spanish**, switchable live from Settings.
- **External links** opened in the system browser, not inside the viewer.
- **Robust:** a corrupt or unusual docset is recorded as an issue and doesn't take down the rest.

## Stack

| Layer | Technology |
|---|---|
| Frontend | React + TypeScript + Tailwind CSS v3 (Vite) |
| Backend | Rust (`rusqlite`, `plist`, `nucleo-matcher`, `flate2`/`tar`) |
| Bridge | Tauri v2 |

Tauri uses the system WebView (WebView2 on Windows), so the installer is small and memory usage stays low.

## Requirements

- [Node.js](https://nodejs.org/) (tested with v24) and npm.
- Stable [Rust](https://rustup.rs/).
- **Windows:** Visual Studio Build Tools with the C++ workload, and WebView2 (included in Windows 11 and updated Windows 10).
- **Linux / macOS:** your platform's Tauri v2 dependencies. See the [official guide](https://v2.tauri.app/start/prerequisites/). *Not yet tested outside Windows.*

## Getting started

```bash
git clone https://github.com/daidarzzz/opendoc.git
cd opendoc
npm install
npm run tauri dev
```

The first build takes a few minutes (it compiles the Rust backend). After that, the frontend hot-reloads.

> Always use `npm run tauri dev`. `npm run dev` opens only the frontend in the browser and the Rust commands don't work there.

### Adding docsets

OpenDoc **ships no docsets**. If you don't pick a folder, it creates and uses a default folder inside the app data directory. You can change it in Settings and also reuse Zeal's folder. Each classic docset is a `.docset` folder.

If you don't have docsets yet, you can search documentation from the welcome screen or open the catalog. To install from the catalog, configure a compatible feeds repository and refresh it to load its entries.

- *tarix* docsets show up as **"Pending install"**: the *Install* button extracts them into the app cache (it can take a minute for the largest ones and use hundreds of MB).
- If a docset doesn't show up, check the issue list in the sidebar: it tells you what's missing.

Respect each documentation source's license and terms. OpenDoc neither includes nor redistributes docsets.

### Building the installer

```bash
npm run tauri build
```

The output lands in `src-tauri/target/release/` (`opendoc.exe`) and the installers in `src-tauri/target/release/bundle/`.

> The executables are **unsigned**: Windows SmartScreen and macOS Gatekeeper will show warnings when installing or opening the app. Also, macOS and Linux are lightly tested (development happens on Windows).

### Publishing a release

Installers are built in CI (`.github/workflows/release.yml`): `check` runs on every push, but build and publish only happen on `v*` tags.

```bash
# 1. Bump the version in package.json, src-tauri/Cargo.toml and src-tauri/tauri.conf.json
# 2. Create and push the tag (it must match those three versions)
git tag vX.Y.Z
git push origin vX.Y.Z
```

The release is created as a **draft** and published by hand once all jobs finish. From the *Actions* tab (Run workflow) you can launch trial builds without creating any release.

## Development

```bash
cargo test   --manifest-path src-tauri/Cargo.toml          # Rust tests
cargo clippy --manifest-path src-tauri/Cargo.toml --all-targets -- -D warnings
cargo fmt    --manifest-path src-tauri/Cargo.toml -- --check
npx tsc --noEmit                                           # frontend typecheck
```

Tests that use real docsets (`CSS.docset`, `Python_3.docset`, `C++.docset`) look for the files in `src-tauri/tests/fixtures/` and **are skipped with a warning** if they're missing, so `cargo test` passes on a clean clone. How to get them: see `src-tauri/tests/fixtures/README.md`.

### Structure

```
opendoc/
├── SPEC.md               # Technical specification
├── AGENTS.md             # Guide for code agents
├── src/                  # React + TypeScript frontend
│   ├── components/       # Palette, sidebar, viewer
│   ├── lib/              # Typed wrappers around the Tauri commands
│   └── store/            # State (docsets, palette, theme, viewer)
└── src-tauri/
    └── src/
        ├── docset/       # Scanning, Info.plist, indexes, tarix
        ├── search/       # In-memory index and fuzzy search
        ├── protocol/     # opendoc:// protocol and path security
        ├── commands/     # Thin Tauri commands
        ├── catalog/      # Feeds and configurable catalog
        └── settings/     # Persistent settings
```

Logic lives in Tauri-independent Rust modules with tests; commands only delegate.

## Roadmap

- [x] **v0.1:** docset reading, standard and Core Data indexes, fuzzy search, palette, safe viewer, tarix, app settings and themes.
- [x] **v0.2:** browse by type, tabs and history, filter by docset, default theme and folder, configurable catalog with install, update and uninstall.
- [ ] **Pending:** favorites and cancelling extractions.
- [ ] **v1.0:** import visual themes, improve syntax highlighting and verify performance with large docset collections.

Full detail is in [`SPEC.md`](./SPEC.md).

## Known limitations

- Only tested on **Windows**. macOS and Linux are lightly tested; on Linux, WebKitGTK may behave differently.
- Executables are unsigned (SmartScreen / Gatekeeper warnings).
- Docsets always render with their light style; content dark mode is disabled.
- The accent only changes the running icon (taskbar / Dock): the executable, installer and Finder icon stay red.
- *tarix* docsets use plenty of disk once extracted (tens or hundreds of MB each).

## License

Copyright (C) 2026 daidarzzz

OpenDoc is free software, licensed under the GNU General Public License v3.0 or later (GPL-3.0-or-later). See LICENSE.

Each documentation set you load keeps its own license; OpenDoc neither includes nor redistributes docsets.

The source code of each released version is published in this repository, which is what the GPL requires when distributing the installers.

## Thanks

- [Zeal](https://zealdocs.org/) and [Dash](https://kapeli.com/dash) for popularizing the docset format and the offline documentation browser idea. OpenDoc is an independent project and is not affiliated with either.
- [Catppuccin](https://catppuccin.com/) for two palette colors used by the accent theme (Latte/Mocha Mauve, MIT).
- The documentation you load belongs to its authors and keeps their own licenses.
