# Contributing to OpenDoc

Start with the [architecture guide](docs/architecture.md) to find the code
behind a feature, and [SPEC.md](SPEC.md) for the full technical contract.

## Prerequisites

- [Node.js](https://nodejs.org/) (v22 or v24 recommended) and `npm`.
- Stable [Rust](https://rustup.rs/) (edition 2021).
- **Windows:** Visual Studio C++ Build Tools and WebView2 (pre-installed on
  Windows 11 and updated Windows 10).
- **macOS:** Xcode Command Line Tools (`xcode-select --install`).
- **Linux:** WebKitGTK and the Tauri v2 system libraries (e.g.
  `libwebkit2gtk-4.1-dev`, `libappindicator3-dev`, `librsvg2-dev`). See the
  [Tauri v2 prerequisites](https://v2.tauri.app/start/prerequisites/).

## Run the desktop app

From the repository root:

```bash
npm ci
npm run tauri dev
```

Use the Tauri app when testing native commands, documentation frames,
navigation, or window close. Vite by itself can serve the React interface,
but these flows depend on the desktop runtime.

## Follow a change across layers

| Change | Where to look |
| --- | --- |
| Desktop command or event | `src-tauri/src/commands/`, `src/lib/commands.ts`, and `src/lib/types.ts` |
| Search or symbol ranking | `opendoc-core`, then the desktop command and `src/store/palette.ts` |
| Document links, scrolling, or frame messages | `src-tauri/src/protocol/mod.rs`, `src/components/Viewer.tsx`, and `src/lib/iframeMessages.ts` |
| Install or update behavior | `src-tauri/src/docset/`, the install queue in `src-tauri/src/commands/`, and `src/store/catalog.ts` |
| Text shown in the app | Both locale dictionaries in `src/lib/i18n.ts` |

When an IPC payload changes, update the Rust type, its TypeScript
representation, the wrapper and the [command reference](SPEC.md#5-contrato-de-comandos-tauri).
Use the error's `kind` to choose a localized message. Include an English and
Spanish entry for any new user-facing copy.

Keep docset HTML inside the sandboxed frame. Changes to navigation or
frame messages must preserve sender and payload validation. Keep blocking
disk or network work off the UI thread and avoid holding the library lock
across I/O.

## Verify a change

Run the checks for the area you touched. For changes that cross Rust and
TypeScript, run both sets:

```bash
npm test
npx tsc --noEmit
cargo test --manifest-path src-tauri/Cargo.toml
cargo clippy --manifest-path src-tauri/Cargo.toml --all-targets -- -D warnings
cargo fmt --manifest-path src-tauri/Cargo.toml -- --check
```

Some Rust tests start a local HTTP server. Tests that use real docsets
can skip when their [fixtures](src-tauri/tests/fixtures/README.md) are absent.
For a viewer or startup change, also open the desktop app on the affected
platform. On Linux, include the package type, desktop session, GPU driver
and WebKitGTK version when reporting rendering behavior.

In a pull request, describe the behavior change and how you verified it.
For platform-specific changes, include the platform and packaging format
you tested.

## Develop against a local `opendoc-core`

The app pins `opendoc-core` to a Git tag in `src-tauri/Cargo.toml`. To test
core changes together with the app, uncomment the `[patch]` block at the
bottom of that file:

```toml
[patch."https://github.com/daidarzzz/opendoc-core"]
opendoc-core = { path = "../../opendoc-core" }
```

Comment it back out before committing and check that `Cargo.lock` points to
the Git tag again.

## Build installers

```bash
npm run tauri build
```

Binaries land in `src-tauri/target/release/` and platform installers
(.exe, .msi, .dmg, .deb, .AppImage) in `src-tauri/target/release/bundle/`.

### In-app updates

Settings → General checks the latest GitHub release (`latest.json`) and
installs signed updates. Releases built by CI sign their update packages:
the workflow needs the repository secrets `TAURI_SIGNING_PRIVATE_KEY` (the
private key whose public half is in `src-tauri/tauri.conf.json`) and
`TAURI_SIGNING_PRIVATE_KEY_PASSWORD` (empty if the key has no password).
Local builds don't need the key: updater artifacts are only enabled in CI
through `src-tauri/tauri.release.conf.json`. Automatic installs work with the
Windows installers, the macOS app and the Linux AppImage; `.deb`/`.rpm`
installs get a link to download the new version instead.

### Microsoft Store (MSIX)

Each release also ships `OpenDoc_<version>_x64.msix`, built by
`.github/workflows/msix.yml`. It is compiled with `OPENDOC_STORE=1` /
`VITE_OPENDOC_STORE=1`, which leaves out the in-app updater, and packaged by
`packaging/msix/build-msix.ps1` with `makeappx`. The package is unsigned on
purpose: the Store signs it after certification. Its identity comes from the
repository variables `MSIX_IDENTITY_NAME`, `MSIX_PUBLISHER` and
`MSIX_PUBLISHER_DISPLAY_NAME` (plus `MSIX_STORE_NAME` when the reserved Store
name is not "OpenDoc"); to rebuild the .msix of an existing release, run the
workflow by hand with its tag.

### macOS Liquid Glass preview

On macOS 26+ fresh profiles use AppKit Liquid Glass. The `pruebaMac` Actions
workflow uploads a single Apple Silicon DMG for testing; see
[docs/mac-testing.md](docs/mac-testing.md).
