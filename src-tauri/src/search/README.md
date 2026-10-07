# Búsqueda en memoria (`search/`)

La búsqueda interactiva vive aquí, no en SQL (SPEC §4.2).

- `index.rs`: `SearchIndex` con todas las `Entry` de los docsets abribles.
  `docset_id` y `kind` se internan (`Arc<str>`) pensando en 20+ docsets.
- `query.rs`: `search()` pura y síncrona (tiers exacta > prefijo > difusa,
  boost por tipo, último segmento, filtros y límite).

## Pendiente de v1.0

Los docsets tarix sin `Documents/` (p. ej. el C++ de Zeal, con issue
`MissingDocuments`) **no entran en el índice** por ahora: no hay HTML que
mostrar aunque sus entradas sí se lean del `.dsidx`. Cuando v1.0 soporte
tarix, el llamador de `SearchIndex::build` los incluirá sin cambiar este
módulo.
