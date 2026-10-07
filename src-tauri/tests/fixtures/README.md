# Fixtures de docsets reales para tests

Los tests de `docset` usan docsets reales descargados de los mirrors de
Kapeli (patrón `https://<mirror>.kapeli.com/feeds/<Nombre>.tgz`, mirrors:
sanfrancisco, london, newyork, tokyo, frankfurt, sydney, singapore).

- Extrae cada `.tgz` aquí de modo que quede `<Nombre>.docset/`.
- Verifica la descarga: un `.tgz` válido empieza por los bytes `1F 8B` y
  pesa varios MB. Si descargas HTML, el nombre del feed es incorrecto.
- No se suben a git: `*.docset` y `*.tgz` están en el `.gitignore`.
  Borra los `.tgz` cuando ya no los necesites.

## Tests que se saltan sin fixtures

Las fixtures no están en git, así que `cargo test` debe pasar en verde
en un clon limpio. Los tests que necesitan docsets reales comprueban su
presencia y se saltan con `SKIP: falta la fixture …` (visible con
`cargo test -- --nocapture`):

- `plist::real_css_plist`, `plist::real_python_plist`.
- `index::real_css_index_is_core_data`, `real_cpp…`, `real_python…`,
  `real_python_paths_all_resolve_after_cleaning`,
  `reading_does_not_create_files_next_to_docset`, `real_index_read_is_fast`.
- `scanner::real_css_fixture_home_comes_from_plist`,
  `tarix_style_docset_without_documents_becomes_issue`.
- `service::{load_fixtures…, request_id_echo…, home_url…}`.
- `query::{real_css_cases, real_search_is_fast}`.

Los sintéticos (searchIndex, Core Data mínimo, 300 k entradas) y el resto
de unitarios corren siempre.

Fixtures actuales:

- `CSS.docset`: feed `CSS`. Esquema **Core Data** (1249 entradas, tipos
  `Class/Function/Guide/Property` + propios `Element/Keyword/Type`).
- `C++.docset`: de Zeal. Esquema **Core Data** (7225 entradas) con trampa:
  trae además `CREATE VIEW searchIndex` (la detección solo mira
  `type = 'table'`, así que sale CoreData). Es formato **tarix** (sin
  `Documents/`, con `tarix.tgz` de ~170 MB): fuera del MVP, el escaneo lo
  registra como `MissingDocuments` sin tumbarse.
- `Python_3.docset`: conseguido por otra vía. `Info.plist` con
  `CFBundleName=Python`, plataforma `python`, home `doc/index.html`.
  Esquema **Core Data** (14695 entradas). Como el C++, es formato tarix
  (sin `Documents/`): el escaneo lo registra sin tumbarse; el `.dsidx`
  sí se lee en los tests de índice y búsqueda.
