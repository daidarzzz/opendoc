OpenDoc: Especificación técnica

Visor moderno de documentación offline, compatible con docsets de Dash/Zeal.

1. Visión

Problema. Zeal es excelente pero su interfaz (C++/Qt) se ve anticuada, consume más de lo necesario y es poco personalizable.

Solución. Una app de escritorio nueva (no un fork de Zeal), compatible con el ecosistema de docsets, con:

Arranque instantáneo y RAM mínima.
Diseño pulido (referencia: Obsidian / VS Code), modo oscuro y claro.
Búsqueda global tipo Command Palette (Ctrl+K / Cmd+K), difusa y en milisegundos.
Navegación fluida y atajos de teclado.

Nombre: OpenDoc.

2. Stack (definitivo)
Capa	Tecnología	Responsabilidad
Frontend	React + TypeScript + Tailwind CSS (Vite)	UI, Command Palette, ajustes, temas, pestañas
Backend	Rust	Escaneo de docsets, lectura de índices, búsqueda, servir contenido, descargas
Puente	Tauri v2	Comandos tipados (#[tauri::command]), protocolo personalizado, empaquetado

Crates previstos: rusqlite, plist, nucleo (o fuzzy-matcher), serde, thiserror, walkdir. Para descargas (fase posterior): reqwest, flate2, tar, zip.

3. Compatibilidad con docsets
3.1 Estructura
Nombre.docset/
└── Contents/
    ├── Info.plist
    └── Resources/
        ├── docSet.dsidx        # SQLite con el índice
        └── Documents/          # HTML, CSS, JS, imágenes
3.2 Info.plist

Se parsea siempre. Campos relevantes: CFBundleName, CFBundleIdentifier, DocSetPlatformFamily, dashIndexFilePath (página de inicio), isDashDocset, DashDocSetFamily, DashDocSetFallbackURL (docsets "online redirect"; ignorar en MVP).

3.3 Índice SQLite: dos esquemas
Esquema estándar: tabla searchIndex(id, name, type, path).
Esquema Core Data: tablas ZTOKEN, ZTOKENTYPE, ZFILEPATH, ZTOKENMETAINFORMATION (unir para obtener name, type y path; el path puede incluir ancla #).

Ambos esquemas deben normalizarse a una misma estructura interna:

rust
struct Entry { docset_id: u32, name: String, kind: String, path: String }

La detección del esquema se hace comprobando qué tablas existen (sqlite_master).

3.4 Fuera de alcance del MVP
Docsets en formato tarix: v0.2 (extracción en caché; ver §6).
Docsets "online redirect".
Docsets de usuario/cheatsheets de Dash (formatos propietarios).
4. Arquitectura
4.1 Backend (Rust)

Módulos sugeridos en src-tauri/src/:

docset/: escaneo, Info.plist, lectura de índices (ambos esquemas), modelo Docset y Entry.
search/: índice en memoria y matcher fuzzy.
protocol/: manejador del esquema opendoc://.
commands/: comandos Tauri finos que delegan en los módulos anteriores.
settings/: configuración persistente (ruta de docsets, tema, etc.).
download/: catálogo y descargas (fase posterior).

Principio: la lógica vive en módulos testeables sin Tauri; los comandos solo conectan.

4.2 Búsqueda
Al arrancar (o al activar un docset) se cargan todos los Entry en memoria.
La búsqueda usa matching difuso (nucleo) con ranking: coincidencia exacta > prefijo > difusa; priorizar tipos como Class/Function/Method sobre Section/Guide.
No usar LIKE '%x%' en SQL para la búsqueda interactiva.
Objetivo: resultados en menos de 50 ms con docsets grandes cargados.
Filtros: por docset activo y por prefijo (ej. py: format).
4.3 Visor de documentación
No se inyecta el HTML del docset en React.
Se sirve con un protocolo personalizado de Tauri (register_uri_scheme_protocol): opendoc://<docset-id>/<ruta-relativa>.
Nota: en Windows/Android Tauri expone estos esquemas como http://opendoc.localhost/...; encapsularlo en una función de utilidad en el frontend.
El contenido se muestra en un <iframe>, de modo que CSS, JS e imágenes relativas funcionan y quedan aislados de la UI.
El protocolo debe: resolver rutas dentro de Documents/ sin permitir path traversal (..), devolver el Content-Type correcto y manejar anclas.
Inyección opcional de CSS en el iframe para tema oscuro (fase posterior).
4.4 Comandos Tauri (contrato inicial)
Comando	Entrada	Salida
list_docsets	n/a	Vec<Docset>
set_docsets_dir	path	ScanReport (docsets + pending_tarix + issues)
search	SearchRequest { request_id, query, docset_ids?, limit? } (query admite `a,b:texto`)	SearchResponse { request_id (eco), results, applied [{ token, docset_id, installed }], unknown [claves sin docset] }
list_kinds	docset_id	Vec<KindInfo { kind, label, inferred, count }> (orden fijo de comunes + inferidas + resto A-Z)
list_entries	docset_id, kind, offset?, limit? (defecto 0/100, tope 500)	Vec<NavEntry { docset_id, name, kind, path, url }> (orden plegado; tipo inexistente → vacío)
get_docset_home	docset_id	URL opendoc://...
get_settings	n/a	Settings { version, docsets_dir?, theme }
set_theme	theme	Settings (persiste solo si cambió)
extract_tarix	docset_id	ScanReport (async; ExtractionInProgress si hay otra en curso)

Los tipos se comparten con el frontend (generar bindings, por ejemplo con specta/tauri-specta o ts-rs, o mantenerlos a mano y sincronizados).

4.5 Frontend
Layout: barra lateral (docsets / navegación), área central con el visor, Command Palette modal.
Estado: ligero (Zustand o similar). Sin librerías pesadas de componentes.
Accesibilidad básica: foco, navegación por teclado completa en la paleta.
5. Plataformas

Windows (WebView2), macOS (WebKit) y Linux (WebKitGTK). En Linux WebKitGTK puede dar problemas de rendimiento o compatibilidad: probar pronto con un docset grande y documentar hallazgos.

6. Versiones y objetivo final
v0.1: MVP (primer objetivo)
 Proyecto Tauri v2 + React + TS + Tailwind funcionando.
 Configurar carpeta de docsets y escanear .docset.
 Parsear Info.plist y leer índice (esquema estándar y Core Data).
 Índice en memoria + búsqueda fuzzy.
 Command Palette (Ctrl+K) con resultados en vivo.
 Visor con protocolo opendoc:// + iframe.
 Tema oscuro/claro.
 Tests de Rust para escaneo, lectura de índices y búsqueda.
v0.2: Uso diario
Pestañas e historial (atrás/adelante).
Siguiente (tras V2-3): persistir las pestañas entre sesiones y ejecutar Vitest en el job check del CI.
Favoritos y recientes.
Tabla de contenidos de la página actual.
Filtro por docset y por prefijo de búsqueda.
Ajustes persistentes (tema, fuente, atajos; sustituyen la autocarga TEMP y el localStorage interino de T7) (hecho en v0.1).
Soporte de docsets tarix con extracción completa en caché (hecho en v0.1): descargar el .tgz, extraer Documents/ + metadatos y reutilizar el escáner/lector actuales (más limpieza de <dash_entry_*>, ya hecha en T7b). La extracción bajo demanda por rangos (tarindex) queda como optimización posterior.
Seguridad en la extracción: validar que ninguna entrada del tgz salga de la carpeta destino (.., rutas absolutas, symlinks) y limitar el tamaño total extraído.
Sin cancelar extracción en v0.2: no hay cancelación (un fallo o cierre nunca deja caché a medias como válida: se extrae a temporal y se renombra al final).
v0.3: Gestión de docsets
Gestión de docsets: por decidir (aplazado). No hay arquitectura aprobada (ni catálogo central, ni P2P, ni proveedores concretos): se discutirá antes de escribir código. Lo único decidido:
Nada de OpenDoc debe depender de los servidores o del catálogo de Kapeli (feeds de Dash) ni redistribuir sus docsets: su licencia prohíbe usarlos en aplicaciones de terceros sin permiso, y no se va a pedir.
Zeal es GPL-3.0-or-later: no copiar ni traducir su código salvo que OpenDoc sea GPL compatible. Mientras tanto, solo estudiar comportamiento.
v1.0: Objetivo final
Temas personalizables y CSS inyectado para modo oscuro en la documentación (el modo oscuro del visor quedó DESACTIVADO: la inversión por filtro se ve bugueada; el mecanismo de inyección permanece para retomarlo con temas por docset).
Resaltado de sintaxis refinado.
Instaladores para Windows, macOS y Linux (objetivo: ~10-15 MB, RAM en reposo < 50-80 MB) (hecho el CI: builds multiplataforma y release como borrador en tags v*).
Rendimiento verificado con 20+ docsets cargados.
Documentación de usuario y CI con builds multiplataforma.
7. Criterios de calidad
Búsqueda < 50 ms; arranque en pocos cientos de ms.
Sin unwrap() en código de producción; errores tipados con thiserror.
Los docsets son entrada no confiable: validar rutas, tolerar índices corruptos sin caerse.
Al extraer un tgz, ninguna entrada puede salir de la carpeta destino (.., rutas absolutas, symlinks) y el total extraído está topado.
Cada módulo de Rust con tests; los de docsets usan fixtures reales en tests/fixtures/.