# Búsqueda en memoria (`search/`)

La búsqueda interactiva vive en el núcleo compartido
([`opendoc-core`](https://github.com/daidarzzz/opendoc-core)), no en SQL
(SPEC §4.2). Este módulo solo lo re-exporta para no cambiar las rutas
`crate::search::…` del resto de la app.

- `opendoc_core::search::index`: `SearchIndex` con todas las `Entry` de los
  docsets abribles. `docset_id` y `kind` se internan (`Arc<str>`) pensando
  en 20+ docsets. `build_for_search` se salta la navegación por tipos
  (la usa el CLI).
- `opendoc_core::search::query`: `search()` pura y síncrona (tiers exacta >
  prefijo > difusa, boost por tipo, último segmento, filtros y límite).

## Pendiente de v1.0

Los docsets tarix sin `Documents/` no entran en el índice por ahora: no hay
HTML que mostrar aunque sus entradas sí se lean del `.dsidx`. Cuando v1.0
soporte tarix, el llamador de `SearchIndex::build` los incluirá sin cambiar
este módulo.
