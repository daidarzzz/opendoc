# Contributing to OpenDoc

Start with the [architecture guide](docs/architecture.md) to find the code
behind a feature. The [README](README.md#prerequisites) lists the platform
dependencies and [development checks](README.md#development--testing).

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
