# OpenDoc

**Un visor de documentación offline, rápido y moderno.** Busca en milisegundos entre miles de funciones, clases y guías, sin conexión y con una interfaz cuidada.

OpenDoc lee el formato **docset** (el mismo que usan Dash y Zeal), así que puedes apuntarlo a tu carpeta de docsets y empezar a buscar.

> **Versión actual: v0.2.63.** OpenDoc ya incluye pestañas e historial, ajustes y gestión de docsets desde un catálogo configurable. El proyecto sigue en desarrollo; consulta la [hoja de ruta](#hoja-de-ruta).

## Por qué existe

Zeal es una herramienta excelente, pero su interfaz (C++/Qt) se siente anticuada y es poco personalizable. OpenDoc nace como un cliente nuevo, escrito desde cero (no es un fork), con tres ideas:

- **Rápido de verdad:** arranque casi instantáneo, búsqueda en memoria y poco consumo de RAM.
- **Cuidado en lo visual:** tema claro/oscuro, paleta de comandos y teclado primero, al estilo de Obsidian o VS Code.
- **Compatible:** lee los docsets que ya tengas, incluidos los de formato *tarix*.

## Funciones actuales

- **Paleta de comandos** (`Ctrl+K` / `Cmd+K`) con búsqueda difusa en vivo y teclado completo (↑/↓, Enter, Esc).
- **Búsqueda en memoria** con `nucleo`: coincidencia exacta > prefijo > difusa, con prioridad por tipo (clases y funciones antes que secciones). Medido: ~37 ms con 300.000 entradas en build release.
- **Pestañas e historial independiente**: atrás/adelante por pestaña, pestañas reordenables arrastrando y enlaces internos preparados mientras pasas el cursor para reducir la espera al navegar.
- **Explorador por tipos**: navega clases, funciones y otras entradas con contadores, además de filtrar la búsqueda por docset (`cpp:vector`).
- **Visor integrado** con protocolo propio `opendoc://` y `<iframe>` aislado (`sandbox`), protegido contra rutas maliciosas (`..`, rutas absolutas, enlaces simbólicos, codificaciones dobles).
- **Catálogo configurable**: consulta feeds, instala docsets `.tgz`, reinstala versiones, comprueba actualizaciones y desinstala docsets instalados.
- **Compatibilidad con docsets:**
  - Índice `searchIndex` y esquema Core Data (`ZTOKEN`…), detectado automáticamente.
  - Lectura de `Info.plist`.
  - Docsets **tarix**: se extraen una sola vez a una caché propia, con validación de seguridad y sin tocar tu carpeta de docsets.
- **Tema claro / oscuro / sistema** para la aplicación, con ajustes persistentes. Los docsets se muestran siempre con su estilo claro original: el modo oscuro del contenido está desactivado (se retomará con temas por docset).
- **Ajustes persistentes** para el tema, la carpeta de docsets y el repositorio del catálogo.
- **Enlaces externos** abiertos en el navegador del sistema, no dentro del visor.
- **Robusto:** un docset corrupto o raro se registra como incidencia y no tumba el resto.

## Stack

| Capa | Tecnología |
|---|---|
| Frontend | React + TypeScript + Tailwind CSS v3 (Vite) |
| Backend | Rust (`rusqlite`, `plist`, `nucleo-matcher`, `flate2`/`tar`) |
| Puente | Tauri v2 |

Tauri usa el WebView del sistema (WebView2 en Windows), por lo que el instalador es pequeño y el consumo de memoria bajo.

## Requisitos

- [Node.js](https://nodejs.org/) (probado con v24) y npm.
- [Rust](https://rustup.rs/) estable.
- **Windows:** Build Tools de Visual Studio con la carga de trabajo de C++, y WebView2 (incluido en Windows 11 y Windows 10 actualizado).
- **Linux / macOS:** las dependencias de Tauri v2 de tu plataforma. Ver la [guía oficial](https://v2.tauri.app/start/prerequisites/). *Aún no se ha probado fuera de Windows.*

## Primeros pasos

```bash
git clone https://github.com/daidarzzz/opendoc.git
cd opendoc
npm install
npm run tauri dev
```

La primera compilación tarda unos minutos (compila el backend en Rust). Después, el frontend se recarga en caliente.

> Usa siempre `npm run tauri dev`. `npm run dev` abre solo el frontend en el navegador y los comandos de Rust no funcionan ahí.

### Añadir docsets

OpenDoc **no incluye docsets**. Si no eliges una carpeta, crea y usa una carpeta predeterminada dentro de los datos de la aplicación. Puedes cambiarla en Ajustes y también usar la misma carpeta que Zeal. Cada docset clásico es una carpeta `.docset`.

Si todavía no tienes docsets, puedes buscar documentación desde la bienvenida o abrir el catálogo. Para instalar desde el catálogo, configura un repositorio de feeds compatible y actualízalo para cargar sus entradas.

- Los docsets *tarix* aparecen como **"Por instalar"**: el botón *Instalar* los extrae a la caché de la app (puede tardar un minuto en los más grandes y ocupar cientos de MB).
- Si un docset no aparece, revisa la lista de incidencias en la barra lateral: indica qué le falta.

Respeta la licencia y las condiciones de cada fuente de documentación. OpenDoc no incluye ni redistribuye los docsets.

### Compilar el instalador

```bash
npm run tauri build
```

El resultado queda en `src-tauri/target/release/` (`opendoc.exe`) y los instaladores en `src-tauri/target/release/bundle/`.

> Los ejecutables **no están firmados**: Windows SmartScreen y macOS Gatekeeper mostrarán advertencias al instalar o abrir la app. Además, macOS y Linux están poco probados (el desarrollo se hace en Windows).

### Publicar una versión

Los instaladores se construyen en CI (`.github/workflows/release.yml`): el `check` corre en cada push, pero el build y la publicación solo ocurren en tags `v*`.

```bash
# 1. Sube la versión en package.json, src-tauri/Cargo.toml y src-tauri/tauri.conf.json
# 2. Crea y sube el tag (debe coincidir con esas tres versiones)
git tag vX.Y.Z
git push origin vX.Y.Z
```

El release se crea como **borrador** y se publica a mano cuando todos los trabajos terminan bien. Desde la pestaña *Actions* (Run workflow) se pueden lanzar builds de prueba sin crear ningún release.

## Desarrollo

```bash
cargo test   --manifest-path src-tauri/Cargo.toml          # tests de Rust
cargo clippy --manifest-path src-tauri/Cargo.toml --all-targets -- -D warnings
cargo fmt    --manifest-path src-tauri/Cargo.toml -- --check
npx tsc --noEmit                                           # typecheck del frontend
```

Los tests que usan docsets reales (`CSS.docset`, `Python_3.docset`, `C++.docset`) buscan los archivos en `src-tauri/tests/fixtures/` y **se omiten con un aviso** si no están, así que `cargo test` pasa en un clon limpio. Cómo conseguirlos: ver `src-tauri/tests/fixtures/README.md`.

### Estructura

```
opendoc/
├── SPEC.md               # Especificación técnica
├── AGENTS.md             # Guía para agentes de código
├── src/                  # Frontend React + TypeScript
│   ├── components/       # Paleta, barra lateral, visor
│   ├── lib/              # Wrappers tipados de los comandos de Tauri
│   └── store/            # Estado (docsets, paleta, tema, visor)
└── src-tauri/
    └── src/
        ├── docset/       # Escaneo, Info.plist, índices, tarix
        ├── search/       # Índice en memoria y búsqueda difusa
        ├── protocol/     # Protocolo opendoc:// y seguridad de rutas
        ├── commands/     # Comandos de Tauri (finos)
        ├── catalog/      # Feeds y catálogo configurable
        └── settings/     # Ajustes persistentes
```

La lógica vive en módulos de Rust independientes de Tauri y con tests; los comandos solo delegan.

## Hoja de ruta

- [x] **v0.1:** lectura de docsets, índices estándar y Core Data, búsqueda difusa, paleta, visor seguro, tarix, ajustes y temas de la aplicación.
- [x] **v0.2:** navegación por tipos, pestañas e historial, filtro por docset, tema y carpeta predeterminada, catálogo configurable con instalación, actualización y desinstalación.
- [ ] **Pendiente:** favoritos y cancelar extracciones.
- [ ] **v1.0:** importar temas visuales, mejorar el resaltado de sintaxis y verificar el rendimiento con colecciones grandes de docsets.

El detalle completo está en [`SPEC.md`](./SPEC.md).

## Limitaciones conocidas

- Solo probado en **Windows**. macOS y Linux están poco probados; en Linux, WebKitGTK puede comportarse distinto.
- Los ejecutables no están firmados (avisos de SmartScreen / Gatekeeper).
- Los docsets se ven siempre con su estilo claro; el modo oscuro del contenido está desactivado.
- Los docsets *tarix* ocupan bastante en disco una vez extraídos (decenas o cientos de MB cada uno).

## Licencia

*Por decidir.* Hasta que se publique un archivo `LICENSE`, no se concede ningún permiso de uso o redistribución del código.

## Agradecimientos

- [Zeal](https://zealdocs.org/) y [Dash](https://kapeli.com/dash) por popularizar el formato docset y la idea del navegador de documentación offline. OpenDoc es un proyecto independiente y no está afiliado a ninguno de los dos.
- Las documentaciones que cargues pertenecen a sus autores y mantienen sus propias licencias.
