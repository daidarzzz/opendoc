# OpenDoc

> Lee esto en [English](./README.md).

**Un visor de documentación offline, rápido y moderno.** Busca en milisegundos entre miles de funciones, clases y guías, sin necesidad de conexión a Internet y con una interfaz de escritorio cuidada.

OpenDoc lee el formato estándar **docset** (el mismo creado por Dash y utilizado por Zeal), por lo que puedes configurarlo con tu carpeta de docsets existente y empezar a consultar documentación de inmediato.

> **Versión actual: v0.2.70.** OpenDoc incluye navegación por pestañas con persistencia de sesiones, motor de búsqueda difusa en memoria, navegación de símbolos por tipo, acentos de color personalizables y gestión completa de docsets desde feeds configurables.

---

## ¿Por qué OpenDoc?

Aunque Zeal es una herramienta consolidada en la comunidad, su interfaz en C++/Qt se siente desfasada y ofrece pocas opciones de personalización moderna. OpenDoc nace desde cero como una alternativa moderna construida sobre cuatro principios:

- **Búsqueda instantánea y bajo consumo:** Arranca en milisegundos, mantiene los índices en memoria con `nucleo-matcher` (<50 ms con más de 300.000 entradas) y conserva un consumo contenido (<80 MB de RAM en reposo).
- **Diseño enfocado al teclado y cuidado visual:** Interfaz limpia con temas claro, oscuro y del sistema, 4 colores de acento y una Paleta de Comandos (`Ctrl+K` / `Cmd+K`) inspirada en VS Code y Obsidian.
- **Compatibilidad total con docsets:** Detecta automáticamente esquemas SQLite estándar (`searchIndex`) y Core Data (`ZTOKEN...`), lee metadatos de `Info.plist`, extrae paquetes *tarix* de forma segura y resuelve rutas internas sin fallos.
- **Aislamiento y seguridad:** Muestra la documentación dentro de un `<iframe>` aislado (`sandbox="allow-scripts"`), utiliza un protocolo nativo propio `opendoc://` para evitar ataques de salto de directorio (path traversal) y delega los enlaces externos directamente en el navegador predeterminado del sistema.

---

## Funcionalidades principales

### Búsqueda y Navegación
- **Paleta de Comandos (`Ctrl+K` / `Cmd+K`):** Modal de búsqueda global en vivo con navegación fluida por teclado (flechas, Enter, Esc), distintivos por tipo de símbolo y coincidencia en tiempo real.
- **Motor difuso en memoria:** Clasificación por niveles mediante `nucleo-matcher`: coincidencia exacta > coincidencia por prefijo > coincidencia difusa > coincidencia en el último segmento, con ponderación prioritaria de clases y funciones sobre secciones o guías.
- **Filtros por prefijo (`docset:consulta`):** Restringe la búsqueda a docsets específicos directamente desde el cajón de búsqueda (ej. `cpp:vector`, `py:dumps` o `rust,go:channel`).
- **Exploración de símbolos por tipo:** Consulta todas las entradas clasificadas por categoría (funciones, clases, módulos, propiedades, tipos) con contadores reales y páginas paginadas.

### Espacio de trabajo y Visualización
- **Pestañas e historial independiente:** Navegación hacia adelante y hacia atrás por pestaña, pestañas reordenables por arrastre, precarga de enlaces al pasar el cursor para eliminar el parpadeo blanco, y clic central o `Ctrl/Cmd+clic` para abrir en pestañas nuevas.
- **Persistencia de sesión:** Conserva pestañas abiertas, pestaña activa, historial de navegación y posiciones de scroll entre reinicios mediante `session.json` (con escritura atómica y copias de seguridad `.bak` automáticas). Puede activarse o desactivarse desde Ajustes.
- **Protocolo de visor seguro (`opendoc://`):** Sirve los archivos locales previniendo cualquier acceso indebido fuera de `Documents/` (`..`, symlinks, unidades de disco o secuencias con doble codificación percent). Normaliza y reenvía los gestos de rueda y trackpad hacia el interior del iframe.
- **Protección de enlaces externos:** Los hipervínculos externos (`http://`, `https://`, `mailto:`) se abren automáticamente en el navegador web del sistema operativo en lugar de navegar dentro de la ventana de la aplicación.

### Gestión de Docsets y Catálogo
- **Catálogo de feeds configurable:** Configura y actualiza repositorios de feeds personalizados (como `zealdocs/feeds` o feeds XML compatibles).
- **Instalación con un clic:** Descarga paquetes `.tgz` con reporte del progreso real en bytes y archivos (`docset-progress`), valida la integridad del paquete y realiza sustituciones atómicas de carpetas.
- **Comprobación de actualizaciones y desinstalación:** Detección de versiones disponibles mediante comparación numérica estricta, con desinstalación segura de docsets desde la carpeta configurada.
- **Gestión de mirrors y caché de velocidad:** Conexión alternativa a mirrors si uno falla, memorizando el host más rápido (`fast_mirror`) para optimizar descargas posteriores.
- **Soporte de paquetes Tarix:** Identifica docsets en formato *tarix* (`tarix.tgz`) y permite extraerlos de forma segura hacia la caché de la app sin modificar la carpeta original de docsets.

### Personalización y Accesibilidad
- **Temas (Claro / Oscuro / Sistema):** Cambio de tema de alto contraste para la interfaz de la aplicación. Los documentos de los docsets conservan siempre su estilo claro original para evitar artefactos visuales en tablas, código o diagramas.
- **Colores de acento:** Permite elegir entre **Rojo**, **Azul**, **Ámbar** o **Catppuccin** (Latte/Mocha Mauve). Actualiza los resaltados de la UI, botones principales, el logotipo de la aplicación y el icono en ejecución en la barra de tareas y el Dock.
- **Interfaz bilingüe:** Completamente traducida al **inglés** (por defecto) y **español**, con selector en caliente desde Ajustes y paridad exacta entre claves de diccionario.

---

## Arquitectura y Stack Tecnológico

```
opendoc/
├── Frontend:    React 19, TypeScript, Tailwind CSS v3, Vite, Zustand
├── Desktop App: Tauri v2 (Gestión de ventana, IPC, protocolo seguro, diálogos nativos)
└── Shared Core: opendoc-core (Rust puro: escaneo, índices SQLite, tarix, búsqueda difusa, rutas)
```

La aplicación de escritorio forma parte de un ecosistema compuesto por:
- **[`opendoc-core`](https://github.com/daidarzzz/opendoc-core):** El motor en Rust sin dependencias gráficas ni de red que centraliza la indexación, el escaneo y la búsqueda difusa.
- **[`opendoc-cli` (`odc`)](https://github.com/daidarzzz/opendoc-cli):** Herramienta de línea de comandos para buscar y abrir documentación en el navegador o visor directamente desde la terminal.

---

## Requisitos

- [Node.js](https://nodejs.org/) (versión 22 o 24 recomendada) y `npm`.
- [Rust](https://rustup.rs/) estable (edición 2021).
- **Windows:** Herramientas de compilación de C++ de Visual Studio y WebView2 (incluido en Windows 11 y Windows 10 actualizado).
- **macOS:** Herramientas de línea de comandos de Xcode (`xcode-select --install`).
- **Linux:** Librerías de sistema para Tauri v2 y WebKitGTK (ej. `libwebkit2gtk-4.1-dev`, `libappindicator3-dev`, `librsvg2-dev`). Ver la [guía de requisitos de Tauri v2](https://v2.tauri.app/start/prerequisites/).

---

## Primeros Pasos

### 1. Clonar y Ejecutar en Desarrollo

```bash
git clone https://github.com/daidarzzz/opendoc.git
cd opendoc
npm install
npm run tauri dev
```

> Usa siempre `npm run tauri dev`. El comando `npm run dev` solo abre la vista previa en el navegador, donde los comandos nativos de Rust no están disponibles.

### 2. Añadir Documentación

OpenDoc **no redistribuye docsets propietarios**.
- Si ya utilizas Zeal o Dash, puedes abrir **Ajustes** y apuntar a tu carpeta de docsets existente.
- Si comienzas desde cero, puedes conservar la carpeta predeterminada (`<app_data>/docsets`) y abrir la pestaña **Catálogo** para descargar docsets desde feeds comunitarios.
- Cualquier carpeta que termine en `.docset` situada en tu directorio configurado será reconocida al arrancar o al guardar cambios.

### 3. Compilar el Instalador

```bash
npm run tauri build
```

Los binarios compilados se generan en `src-tauri/target/release/` y los instaladores empaquetados (.exe, .msi, .dmg, .deb, .AppImage) en `src-tauri/target/release/bundle/`.

---

## Desarrollo y Pruebas

Antes de dar por completado un cambio, ejecuta la batería de pruebas, linters y comprobaciones de tipo:

```bash
# Pruebas de frontend (Vitest: 105 tests sobre stores, sync de sesión, i18n, etc.)
npm test

# Comprobación de tipos de TypeScript
npx tsc --noEmit

# Batería de pruebas de Rust (83 tests unitarios y de integración)
cargo test --manifest-path src-tauri/Cargo.toml

# Linter de Rust
cargo clippy --manifest-path src-tauri/Cargo.toml --all-targets -- -D warnings

# Comprobación de formato de Rust
cargo fmt --manifest-path src-tauri/Cargo.toml -- --check
```

Los tests que utilizan fixtures reales de docsets (`CSS.docset`, `Python_3.docset`, `C++.docset`, `Swift.docset`) buscan los archivos en `src-tauri/tests/fixtures/`. Si no están presentes, los tests correspondientes se omiten limpiamente con un aviso `SKIP`, permitiendo que `cargo test` pase en verde en clones limpios. Consulta las instrucciones en [`src-tauri/tests/fixtures/README.md`](./src-tauri/tests/fixtures/README.md).

### Desarrollo local contra `opendoc-core`

Por defecto, OpenDoc consume `opendoc-core` a través de una etiqueta de Git fija en `src-tauri/Cargo.toml`. Para probar modificaciones locales conjuntas en el núcleo, descomenta el bloque `[patch]` al final de `src-tauri/Cargo.toml`:

```toml
[patch."https://github.com/daidarzzz/opendoc-core"]
opendoc-core = { path = "../../opendoc-core" }
```

Asegúrate de volver a comentar el bloque de patch antes de realizar un commit.

---

## Limitaciones Conocidas

- **Ejecutables no firmados:** Los instaladores publicados en GitHub Releases no cuentan con certificados comerciales de firma; Windows SmartScreen y macOS Gatekeeper mostrarán advertencias estándar durante la primera instalación.
- **Modo oscuro en el contenido de docsets:** Los docsets se muestran siempre con su presentación clara original. El modo oscuro aplica exclusivamente a la interfaz nativa de OpenDoc. (La inversión global mediante CSS fue descartada por provocar fallos de contraste y errores visuales en bloques de código, tablas y diagramas; la incorporación de temas CSS personalizados por docset está planificada para fases posteriores).
- **Alcance del icono de acento:** El acento de color modifica la UI y el icono de la aplicación en ejecución (barra de tareas y Dock de macOS). El archivo ejecutable estático `.exe`, los accesos directos y el icono del instalador permanecen con el rojo de marca.
- **Espacio en disco con docsets Tarix:** Los docsets tarix extraídos requieren espacio de almacenamiento significativo en `tarix-cache/` (decenas o cientos de megabytes por paquete).
- **WebKitGTK en Linux:** El comportamiento del motor WebKit en Linux depende de la versión del sistema y puede presentar pequeñas diferencias respecto a WebView2 (Windows) y WebKit (macOS).

---

## Hoja de Ruta

- [x] **v0.1 (MVP):** Escaneo de docsets, lectura de índices SQLite (estándar y Core Data), búsqueda difusa en memoria, Paleta de Comandos, visor seguro `opendoc://`, ajustes y temas.
- [x] **v0.2 (Uso diario):** Pestañas con historial independiente, sesiones persistentes entre reinicios, explorador por tipos de símbolo, filtros por prefijo y gestor de catálogo (descarga, instalación, actualización y desinstalación).
- [ ] **v0.3 (Mejoras):** Favoritos y marcadores, tabla de contenidos (TOC) contextual y cancelación interactiva de extracciones.
- [ ] **v1.0 (Refinamiento final):** Temas CSS personalizados por docset, resaltado de sintaxis avanzado, ejecución de instancia única y pruebas de estrés con colecciones masivas de documentación (más de 20 docsets).

Para profundizar en el diseño del sistema, consulta [`SPEC.md`](./SPEC.md). La guía operativa para agentes y colaboradores se encuentra en [`AGENTS.md`](./AGENTS.md).

---

## Licencia

Copyright (C) 2026 daidarzzz.

OpenDoc es software libre, distribuido bajo la **Licencia Pública General de GNU v3.0 o posterior (GPL-3.0-or-later)**. Consulta el archivo [`LICENSE`](./LICENSE) para más detalles.

Cada documentación que descargues o consultes pertenece a sus respectivos autores y conserva su propia licencia; OpenDoc no incluye ni redistribuye documentación de terceros.

---

## Agradecimientos

- [Zeal](https://zealdocs.org/) y [Dash](https://kapeli.com/dash) por popularizar el ecosistema de docsets offline. OpenDoc es un proyecto independiente y no está afiliado a ninguna de las dos herramientas.
- [Catppuccin](https://catppuccin.com/) por los valores de paleta Mauve (Latte/Mocha) empleados en el tema de acento (Licencia MIT).
- [nucleo-matcher](https://github.com/helix-editor/nucleo) por su excelente rendimiento en la búsqueda difusa en memoria.
