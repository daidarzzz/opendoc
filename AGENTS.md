# AGENTS.md

Guía operativa para agentes de código que trabajen en el ecosistema **OpenDoc**. Para el detalle arquitectónico y especificación completa de la versión actual, consulta `SPEC.md`.

## Qué es el proyecto

Visor de documentación offline compatible con docsets de Dash y Zeal.
- **Stack**: Tauri v2 + React 19 + TypeScript + Tailwind CSS v3 + Rust.
- **Versión actual**: `v0.2.x` (estado consolidado de uso diario: pestañas, historial, catálogo con descargas, búsqueda difusa en memoria, temas y acentos de color).
- **Ecosistema**:
  - `opendoc`: aplicación de escritorio (este repositorio).
  - `opendoc-core`: biblioteca Rust pura y compartida (escaneo, índices, búsqueda, resolución de rutas y tarix), consumida por etiqueta Git.
  - `opendoc-cli` (`odc`): herramienta CLI para terminal que comparte el mismo núcleo.

## Estructura del repositorio

```
opendoc/
├── AGENTS.md             # Guía operativa para agentes (este archivo)
├── SPEC.md               # Especificación técnica y contrato de arquitectura
├── README.md             # Documentación general (inglés)
├── README.es.md          # Documentación general (español)
├── package.json          # Dependencias y scripts de frontend
├── landing/              # Sitio estático para GitHub Pages
├── docs/                 # Guías adicionales (p. ej. mac-testing.md)
├── scripts/              # Scripts de utilidades (iconos de acento, CI mac)
├── src/                  # Frontend React + TypeScript
│   ├── components/       # Componentes de UI (Viewer, Sidebar, CommandPalette, TabsBar, etc.)
│   ├── hooks/            # Hooks de React (useT, useGlobalKeys)
│   ├── lib/              # Wrappers tipados de invoke(), i18n, sync de sesión, mensajes de iframe
│   └── store/            # Estado global ligero con Zustand (tabs, docsets, theme, accent, etc.)
└── src-tauri/            # Backend en Rust
    ├── Cargo.toml
    ├── tauri.conf.json
    ├── src/
    │   ├── accent_icon.rs # Icono de app en ejecución según acento (Dock/taskbar)
    │   ├── browse.rs     # Navegación y conteos por tipos de símbolo
    │   ├── catalog/      # Feeds, parser XML y caché JSON del catálogo
    │   ├── commands/     # Comandos Tauri (mod.rs) y lógica desacoplada (service.rs)
    │   ├── docset/       # Gestión de docsets, devicons y descargas/instalación
    │   ├── navigation.rs # Política de URLs y reenvío a navegador externo
    │   ├── protocol/     # Servidor de esquema opendoc:// e inyección de scripts/estilos
    │   ├── session/      # Persistencia tolerante de pestañas (session.json + rotación .bak)
    │   └── settings/     # Persistencia de ajustes (settings.json)
    └── tests/fixtures/   # Docsets reales de prueba (CSS, Python_3, C++, Swift)
```

## Comandos reales del proyecto

- **Instalar dependencias de frontend**: `npm install`
- **Desarrollo**: `npm run tauri dev`
- **Compilar instaladores / binario**: `npm run tauri build`
- **Tests de frontend**: `npm test` (ejecuta Vitest en modo run; cubre stores, sync de sesión, i18n, etc.)
- **Typecheck de frontend**: `npx tsc --noEmit`
- **Tests de Rust**: `cargo test --manifest-path src-tauri/Cargo.toml`
- **Lint de Rust**: `cargo clippy --manifest-path src-tauri/Cargo.toml --all-targets -- -D warnings`
- **Comprobación de formato Rust**: `cargo fmt --manifest-path src-tauri/Cargo.toml -- --check`
- **Formatear Rust**: `cargo fmt --manifest-path src-tauri/Cargo.toml`
- **Regenerar iconos de acento**: `node scripts/gen-accent-icons.mjs`

> [!IMPORTANT]
> No existe script `npm run lint`. La validación de frontend se compone de `npx tsc --noEmit` y `npm test`. No añadas linters adicionales sin aprobación.

Antes de dar una tarea por terminada, ejecuta las comprobaciones pertinentes (`npm test`, `npx tsc --noEmit`, `cargo test`, `cargo clippy`, `cargo fmt`) y soluciona cualquier fallo.

## Desarrollo contra `opendoc-core` local

La app consume `opendoc-core` por etiqueta Git en `src-tauri/Cargo.toml`:
```toml
opendoc-core = { git = "https://github.com/daidarzzz/opendoc-core", tag = "v0.1.1" }
```
Para trabajar localmente en modificaciones conjuntas entre la app y el núcleo sin publicar tags intermedios, descomenta el bloque `[patch]` al final de `src-tauri/Cargo.toml`:
```toml
[patch."https://github.com/daidarzzz/opendoc-core"]
opendoc-core = { path = "../../opendoc-core" }
```
Vuelve a comentar el bloque antes de commitear y comprueba que `Cargo.lock` apunte de nuevo a la etiqueta Git.

## Convenciones de Rust

- **Arquitectura en capas**: los manejadores `#[tauri::command]` en `commands/mod.rs` son capas finas que validan entradas, extraen el estado de la app y delegan en funciones puras o de servicio en `service.rs` y módulos especializados. La lógica central debe poder probarse con tests unitarios sin instanciar Tauri.
- **Manejo de errores**: errores fuertemente tipados con `thiserror`. **Prohibido usar `unwrap()` o `expect()`** en código de producción. Si una operación de deserialización o parseo falla en datos de usuario, tolera el fallo o devuelve un `ApiError` descriptivo.
- **I/O no bloqueante**: operaciones de disco pesadas (escaneo de carpetas, lectura SQLite, descargas HTTP con reqwest, extracción de tar/tarix) deben ejecutarse fuera del hilo principal usando `tauri::async_runtime::spawn_blocking`.
- **Cliente HTTP**: `reqwest::blocking` debe instanciarse y consumirse exclusivamente dentro del hilo bloqueante; crearlo en contexto asíncrono provoca pánico de Tokio.
- **Entrada no confiable y seguridad de rutas**: los docsets son entradas arbitrarias. Valida rutas usando canonicalización e inspección de componentes para prevenir path traversal (`..`, rutas absolutas, barras invertidas no normalizadas, symlinks maliciosos).
- **Escritura atómica**: el guardado de `settings.json`, `session.json` y `catalog.json` utiliza archivo temporal `.tmp` con renombramiento atómico y generación de copia `.bak` ante corrupción.

## Convenciones de frontend

- **TypeScript estricto**: evita `any`; tipa todas las estructuras compartidas con el backend en `src/lib/types.ts`.
- **Aislamiento de comandos**: no invoques `invoke()` de Tauri directamente en componentes React. Toda interacción debe pasar por las funciones tipadas de `src/lib/commands.ts`.
- **Seguridad en el visor**: **nunca** inyectes HTML de un docset en el DOM de React. El visor utiliza un `<iframe sandbox="allow-scripts">` que carga el contenido a través del protocolo `opendoc://` o `http://opendoc.localhost`.
- **Validación de postMessage**: toda comunicación desde el iframe hacia la ventana principal (navegaciones, scroll, atajos de teclado, apertura de pestañas) debe validarse estrictamente con las funciones de `src/lib/iframeMessages.ts` antes de mutar cualquier estado.
- **Internacionalización y textos**: no insertes cadenas de texto visibles en crudo en los componentes. Usa el hook `useT()` y las claves definidas en `src/lib/i18n.ts`. Toda nueva clave debe añadirse tanto en inglés (`en`) como en español (`es`). El test `src/lib/i18n.test.ts` verifica la paridad entre diccionarios.
- **Estilos**: Tailwind CSS exclusivamente. El color de acento funcional (`--accent`, `--accent-text`, `--accent-solid`, `--on-accent`) se gestiona a través del atributo `data-accent` en el elemento raíz `<html>`.

## Sincronización de contratos (Backend ↔ Frontend ↔ Docs)

Cuando agregues o modifiques un comando Tauri:
1. Define la función en `src-tauri/src/commands/mod.rs` y `src-tauri/src/commands/service.rs`.
2. Actualiza los tipos en `src/lib/types.ts`.
3. Crea o actualiza la función wrapper en `src/lib/commands.ts`.
4. Si introduce nuevos errores, agrégalos a `ApiError` (`commands/error.rs` y `types.ts`) y añade sus traducciones en `src/lib/i18n.ts`.
5. Actualiza la tabla de comandos y tipos en `SPEC.md` (§4.4).

## Datos de prueba y fixtures

Los docsets reales para pruebas (`CSS.docset`, `Python_3.docset`, `C++.docset`, `Swift.docset`) se ubican en `src-tauri/tests/fixtures/`.
- No se suben a git (están excluidos por `.gitignore`).
- Si faltan fixtures, los tests que dependen de ellos se omiten limpiamente con un aviso `SKIP`, permitiendo que `cargo test` pase en verde en clones limpios.
- Las instrucciones para descargarlos manualmente se encuentran en `src-tauri/tests/fixtures/README.md`.

## Reglas de trabajo y documentación

- Realiza cambios acotados y focalizados en la tarea solicitada.
- Mantén la coherencia terminológica: el proyecto es **OpenDoc** (`opendoc-core`, `opendoc-cli`). No inventes nombres de marca alternativos ni modifiques prefijos técnicos (`opendoc://`, `OPENDOC_`).
- Si una modificación afecta al comportamiento o a las características de la aplicación, actualiza inmediatamente `README.md`, `README.es.md` y `SPEC.md`.
