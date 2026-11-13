# In-memory search

The desktop module re-exports search functionality from
[`opendoc-core`](https://github.com/daidarzzz/opendoc-core). SQLite supplies
the index entries during library loading. Interactive queries use the
shared in-memory index.

- `opendoc_core::search::index` owns `SearchIndex` and interns docset IDs
  and symbol kinds to share their storage across entries.
- `opendoc_core::search::query` owns query parsing and ranking, including
  exact, prefix and fuzzy matches, qualified names, symbol kind weighting
  and docset filters such as `py:dumps`.
- [The desktop command](../commands/mod.rs) forwards the query and echoes
  its request ID. The palette uses the ID to discard obsolete results.

A pending tarix docset joins the searchable index after its HTML has been
extracted to the cache and the library has integrated the docset.
