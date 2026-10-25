# Búsqueda en memoria (`search/`)

La búsqueda interactiva vive en el núcleo compartido
([`opendoc-core`](https://github.com/daidarzzz/opendoc-core)), no en SQL
(SPEC §4.2). Este módulo re-exporta la funcionalidad de búsqueda para mantener
las rutas `crate::search::…` en el backend de la aplicación.

- `opendoc_core::search::index`: `SearchIndex` con todas las `Entry` de los
  docsets cargados y docsets tarix extraídos. `docset_id` y `kind` se internan
  (`Arc<str>`) optimizando el consumo de memoria para colecciones grandes.
  `build_for_search` se salta la navegación por tipos (utilizada por el CLI).
- `opendoc_core::search::query`: `search()` pura y síncrona con ranking por
  niveles (coincidencia exacta > prefijo > difusa con `nucleo-matcher`), boost
  por tipo de símbolo, coincidencia del último segmento, filtros por prefijo de
  docset (`docset:query`) y límite de resultados.

## Docsets tarix

Los docsets en formato tarix pendientes de extraer no entran en el índice de
búsqueda hasta que se extraen a la caché de la aplicación (`tarix-cache/`), ya
que no disponen de sus archivos HTML en disco hasta ese momento. Una vez
extraídos (mediante `extract_tarix` o precargados en el escaneo), sus entradas se
incorporan al `SearchIndex` exactamente igual que las de cualquier docset clásico.
