# OpenDoc desktop architecture

The desktop app combines a React interface with a Tauri runtime.
The [shared Rust core](https://github.com/daidarzzz/opendoc-core) owns the
docset formats, filesystem discovery, index loading, search and path
resolution. The desktop crate owns the app lifecycle, catalog, installations,
custom URI handler and session persistence. The pinned core revision is in
[`Cargo.toml`](../src-tauri/Cargo.toml).

| Layer | Entry point |
| --- | --- |
| Tauri startup, window and protocol registration | [`src-tauri/src/lib.rs`](../src-tauri/src/lib.rs) |
| Rust command handlers and shared app state | [`src-tauri/src/commands/`](../src-tauri/src/commands/) |
| Typed frontend IPC | [`src/lib/commands.ts`](../src/lib/commands.ts) and [`src/lib/types.ts`](../src/lib/types.ts) |
| React startup and layout | [`src/App.tsx`](../src/App.tsx) |
| Live UI state | [`src/store/`](../src/store/) |

## Library and search

The library store asks Rust to scan the selected directory. The command
loads docsets and their SQLite indexes on a blocking worker, then replaces
the library and its in-memory search index together. A compressed tarix
docset that still needs extraction appears as pending. Its entries become
searchable after extraction and integration into the loaded library.

The command palette calls the typed search wrapper. The Rust matcher uses
the in-memory index for interactive queries. Responses carry the request ID
so the palette can ignore results for a superseded query. Use the
[search module notes](../src-tauri/src/search/README.md) to find ranking and
index code in the shared core.

## Document rendering and navigation

The tab store keeps canonical `opendoc://<id>/<path>` URLs. At the viewer
boundary, [`opendocUrl.ts`](../src/lib/opendocUrl.ts) maps these to the URL
form expected by the platform webview. The
[Rust protocol handler](../src-tauri/src/protocol/mod.rs) looks up the loaded
docset, delegates path resolution to the core, and serves the file on a
blocking worker. HTML responses also receive OpenDoc's viewer scripts.

Docset scripts run in an iframe with `sandbox="allow-scripts"` and an opaque
origin. The [Viewer](../src/components/Viewer.tsx) checks the sending window
and validates messages with [`iframeMessages.ts`](../src/lib/iframeMessages.ts).
Navigation, scroll, and shortcuts can affect app state only through the
handlers for those validated messages. The
[Rust navigation policy](../src-tauri/src/navigation.rs) dispatches allowed
external links through the system opener.

Only the active tab mounts a viewer. Its frame slots retain the visible page,
a history neighbor and a page being loaded or prefetched. Slot choice lives
in [`viewerFrames.ts`](../src/lib/viewerFrames.ts). A slot can be reused, so
load handling checks that it still corresponds to the expected navigation.

## Session and preferences

The [tab store](../src/store/tabs.ts) owns live history and scroll positions.
[`session.ts`](../src/lib/session.ts) converts that state to a portable
snapshot using docset-relative paths. [`sessionSync.ts`](../src/lib/sessionSync.ts)
waits for library discovery before restoring, debounces ordinary saves, and
hands snapshots to a [serialized writer](../src/lib/sessionSaver.ts). The
[Rust session module](../src-tauri/src/session/mod.rs) validates and persists
those snapshots in `session.json`. Backend settings live in `settings.json`,
and frontend reading preferences such as smooth scrolling use localStorage.

## Catalog and installation

DevDocs is the default catalog. Optional GitHub repositories provide XML
feeds in the Kapeli format. A [local cache](../src-tauri/src/catalog/mod.rs)
lets the UI show previously fetched entries offline.

The [install queue](../src-tauri/src/commands/install_queue.rs) limits active
installs and gives waiting entries a slot in FIFO order. Classic archives
are downloaded and validated in a staging directory. DevDocs entries use
the shared converter to produce standard docsets. A successful install
updates the loaded library and search index. Progress events drive the
indicator, and the command response determines the outcome.

The [technical specification](../SPEC.md) contains the detailed command
and event tables. See [Contributing](../CONTRIBUTING.md) for the development
workflow.
