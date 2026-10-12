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
get_settings	n/a	Settings { version, docsets_dir?, theme, accent, feed_url?, catalog_fetched_at?, fast_mirror?, restore_tabs, language }
set_theme	theme	Settings (persiste solo si cambió)
set_accent	accent	Settings (acento de color; persiste solo si cambió; aplica el icono en ejecución)
set_language	language	Settings (idioma de la interfaz en/es; persiste solo si cambió)
confirm_exit	n/a	n/a (sale con código 0 tras el volcado; flujo ExitRequested de macOS)
set_restore_tabs	restore	Settings (restaurar pestañas al abrir; con false no se lee ni se escribe session.json)
get_session	n/a	Session { version, tabs: Vec<SavedTab { docset_id, docset_name?, bundle_id?, history: Vec<{ path, title }>, history_index, scroll? }>, active } (vacía si no hay nada; nunca falla)
save_session	Session	bool (escribe si cambió; con restore_tabs=false no toca el disco)
extract_tarix	docset_id	ScanReport (async; ExtractionInProgress si hay otra en curso)
get_catalog_status	n/a	CatalogStatus { repo?, fetched_at?, count, profile_enabled } (caché local, sin red; profile_enabled = OPENDOC_PROFILE=1 al arrancar)
set_feed_repo	repo	Settings (valida owner/repo o URL y persiste)
 refresh_catalog	n/a	CatalogSummary { repo, count, skipped, fetched_at } (async; NoFeedRepo sin repo)
 list_catalog	query?	Vec<FeedEntry { id, name, version, urls }> (caché, offline)
 install_docset	{ feed_id, force? }	InstallSummary { feed_id, docset_id, name, version?, entries, reinstalled } (async; progreso por evento `docset-progress`; sin force: AlreadyInstalled si ya instalado, AmbiguousMatch si varias carpetas coinciden; InstallInProgress si ya hay una en curso)
 get_install_status	feed_id?	Vec<InstallStatus { feed_id, name, installed, docset_id?, installed_version?, available_version, update_available (true/false/null), ambiguous, ambiguous_ids }> (caché + instalados, offline; UnknownFeed si el id no existe)
 uninstall_docset	feed_id	String (id eliminado; requiere coincidencia única dentro de la carpeta configurada; UnknownFeed, UnknownDocset, AmbiguousMatch o InstallFailed)

Los tipos se comparten con el frontend (generar bindings, por ejemplo con specta/tauri-specta o ts-rs, o mantenerlos a mano y sincronizados).

4.5 Frontend
Layout: barra lateral (docsets / navegación), área central con el visor, Command Palette modal.
Estado: ligero (Zustand o similar). Sin librerías pesadas de componentes.
Accesibilidad básica: foco, navegación por teclado completa en la paleta.
Idiomas: inglés por defecto + español (`src/lib/i18n.ts`, diccionarios tipados con paridad comprobada; `document.documentElement.lang` sigue al ajuste; errores del backend por `kind`, nunca texto crudo).
4.6 Acento de color
Ajustes ofrece 4 acentos (`red` por defecto, `blue`, `amber`, `catppuccin`): recolorean el logo (componente único `AppLogo` con `var(--accent)`), los resaltados de la UI y el icono de la app en ejecución. Cambio en caliente, sin reiniciar; `accent` persiste en `settings.json` con lectura tolerante (ausente o inválido → `red`).
Tokens por acento y modo (`[data-accent]` en `<html>`, fuente de verdad en `src/lib/accent.ts`): `--accent` (marca: logo y decoración), `--accent-text` (texto e indicadores funcionales), `--accent-solid` + `--on-accent` (botones primarios). Contraste WCAG verificado con tests: texto y texto-sobre-sólido >= 4.5:1 en los 4 acentos y los 2 modos. La marca se mantiene en logo y decoración; donde no llega (p. ej. ámbar #FBB03B sobre blanco), el uso funcional va oscurecido. Catppuccin usa Latte Mauve #8839EF en claro y Mocha Mauve #CBA6F7 en oscuro (paleta MIT de Catppuccin; solo esos dos valores, con atribución en el código).
El acento por defecto es rojo y los errores también: los errores usan rojos fijos propios (icono + texto, independientes del acento) y la selección nunca es relleno sólido (tinte ~10-15% + barra de 2 px), así que siempre se distinguen.
Icono en ejecución: 4 PNG "box" de 512 px generados con `scripts/gen-accent-icons.*` (resvg, sin tocar el bundle) y embebidos con `include_bytes!`; se aplican al arrancar (tras crear la ventana) y en `set_accent`. Windows/Linux: `Window::set_icon` (requiere feature `image-png`). macOS: `Window::set_icon` no está soportado y se usa `NSApplication.setApplicationIconImage` (objc2, solo `cfg(target_os = "macos")`, en el hilo principal; código revisado a mano, sin compilar para macOS en este equipo). Límite: solo cambia el icono en ejecución (barra de tareas y Dock); ejecutable, instalador, `.app` en Finder y accesos directos siguen en rojo. Wayland y la apariencia real en macOS (incluida su máscara de iconos) están sin verificar.
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
Persistencia de pestañas entre sesiones (hecho): `session.json` en datos de la app (`"version": 1`, escritura atómica, `.bak` rotativo máx. 3, tolerancia por campo). Guarda por pestaña docset_id, historial en forma neutra (ruta relativa con ancla, sin esquema), título, índice actual, scroll de la entrada actual y pistas de reencuentro (nombre de carpeta + bundle_id); tope 30 pestañas y 50 entradas (ventana centrada en la actual). Guardado con debounce (~500 ms) + vuelco al cerrar (el frontend, con tope ~1 s; un fallo al cerrar no bloquea el cierre). Restaura tras el escaneo (solo la activa monta iframe); docset ausente → pestaña atenuada conservada (tarix pendiente → aviso propio); reencuentro por id exacto, bundle_id único o nombre único (ambiguo → no disponible sin reescribir). Ajuste `restore_tabs` (por defecto true, interruptor en Ajustes).
Siguiente (tras V2-3): ejecutar Vitest en el job check del CI.
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
Zeal es GPL-3.0-or-later y OpenDoc también (GPL-3.0-or-later, ver LICENSE): la licencia ya es compatible, pero SIGUE prohibido copiar o traducir código de Zeal o de cualquier otro proyecto sin avisar antes; si alguna vez se adapta código ajeno, hay que conservar sus avisos de copyright, atribuirlo en el propio archivo y listarlo en un NOTICE. Mientras tanto, solo estudiar comportamiento.
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
Dos instancias simultáneas de la app: último en cerrar gana (`session.json` last-writer-wins, sin bloqueo). Mejora futura: plugin single-instance de Tauri.
