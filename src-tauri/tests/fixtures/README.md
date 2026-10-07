# Fixtures de docsets reales para tests

Los tests de `docset` usan docsets reales descargados de los mirrors de
Kapeli (patrón `https://<mirror>.kapeli.com/feeds/<Nombre>.tgz`, mirrors:
sanfrancisco, london, newyork, tokyo, frankfurt, sydney, singapore).

- Extrae cada `.tgz` aquí de modo que quede `<Nombre>.docset/`.
- Verifica la descarga: un `.tgz` válido empieza por los bytes `1F 8B` y
  pesa varios MB. Si descargas HTML, el nombre del feed es incorrecto.
- No se suben a git: `*.docset` y `*.tgz` están en el `.gitignore`.
  Borra los `.tgz` cuando ya no los necesites.

Fixtures actuales:

- `CSS.docset`: feed `CSS`. Esquema **Core Data** (1249 entradas, tipos
  `Class/Function/Guide/Property` + propios `Element/Keyword/Type`).
- `C++.docset`: de Zeal. Esquema **Core Data** (7225 entradas) con trampa:
  trae además `CREATE VIEW searchIndex` (la detección solo mira
  `type = 'table'`, así que sale CoreData). Es formato **tarix** (sin
  `Documents/`, con `tarix.tgz` de ~170 MB): fuera del MVP, el escaneo lo
  registra como `MissingDocuments` sin tumbarse.
- `Python_3.docset`: pendiente (el mirror devolvió HTML: el nombre
  `Python_3` no existe como feed; conseguir por otra vía).
