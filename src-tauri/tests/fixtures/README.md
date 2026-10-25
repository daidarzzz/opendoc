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
  `tarix_style_docset_is_pending_not_issue`.
- `service::{load_fixtures…, request_id_echo…, home_url…}`.
- `query::{real_css_cases, real_search_is_fast}`.

Los tests sintéticos (searchIndex, Core Data mínimo, 300 k entradas) y el resto
de unitarios corren siempre.

Fixtures utilizadas en pruebas:

- `CSS.docset`: feed `CSS`. Esquema **Core Data** (1249 entradas, tipos
  `Class/Function/Guide/Property` + propios `Element/Keyword/Type`). Dispone de
  carpeta `Documents/` completa.
- `C++.docset`: procedente de Zeal. Esquema **Core Data** (7225 entradas) que
  incluye además una vista `CREATE VIEW searchIndex` (la detección comprueba
  `type = 'table'`, por lo que se identifica correctamente como Core Data). Es
  formato **tarix** (sin `Documents/` inicial, con `tarix.tgz`): el escáner lo
  detecta y registra como docset tarix pendiente (`pending_tarix`) sin fallar;
  al extraerse a la caché de la aplicación queda totalmente operativo.
- `Python_3.docset`: `Info.plist` con `CFBundleName=Python`, plataforma `python`
  y home `doc/index.html`. Esquema **Core Data** (14695 entradas). Formato
  **tarix** sin `Documents/` en raíz: el escáner lo registra como `pending_tarix`
  y su `.dsidx` se valida en las pruebas de índice y búsqueda.
- `Swift.docset`: docset real con esquema **estándar** (`searchIndex`, 9467
  entradas). Incluye `icon.png` e `icon@2x.png` en la raíz. Dispone de carpeta
  `Documents/` y se carga al iniciar la biblioteca.
