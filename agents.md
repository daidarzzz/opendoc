# AGENTS.md

Guía para agentes de código que trabajen en **OpenDoc**. Para el detalle completo, lee `SPEC.md` antes de empezar cualquier tarea.

## Qué es el proyecto

Visor de documentación offline compatible con docsets de Dash/Zeal. Stack: **Tauri v2 + React + TypeScript + Tailwind + Rust**. Objetivo actual: **v0.1 (MVP)**; el objetivo final es **v1.0** (ver sección 6 de `SPEC.md`).

## Estructura esperada

```
opendoc/
├── AGENTS.md
├── SPEC.md
├── src/                  # Frontend React + TS
│   ├── components/
│   ├── hooks/
│   ├── lib/              # Utilidades y wrappers de invoke()
│   └── store/
├── src-tauri/
│   ├── src/
│   │   ├── docset/       # Escaneo, Info.plist, índices
│   │   ├── search/       # Índice en memoria y fuzzy
│   │   ├── protocol/     # Esquema opendoc://
│   │   ├── commands/     # Comandos Tauri (finos)
│   │   └── settings/
│   └── tests/fixtures/   # Docsets reales de prueba
└── package.json
```

## Comandos

- Instalar dependencias: `npm install`
- Desarrollo: `npm run tauri dev`
- Build: `npm run tauri build`
- Tests Rust: `cargo test --manifest-path src-tauri/Cargo.toml`
- Lint Rust: `cargo clippy --manifest-path src-tauri/Cargo.toml -- -D warnings`
- Formato Rust: `cargo fmt --manifest-path src-tauri/Cargo.toml`
- Typecheck frontend: `npx tsc --noEmit`
- Lint frontend: `npm run lint`

Antes de dar una tarea por terminada, ejecuta tests, clippy y typecheck, y corrige lo que falle.

## Reglas de trabajo

- **Una tarea pequeña por vez.** No avances a funcionalidades de otras versiones sin que se pida.
- Si algo del `SPEC.md` es ambiguo o hay que desviarse, **pregunta antes** de decidir en silencio.
- Haz commits pequeños con mensajes claros (formato `tipo: descripción`, ej. `feat: lectura de Info.plist`).
- No añadas dependencias nuevas sin justificarlas brevemente.
- Si tocas el contrato de comandos Tauri, actualiza también los tipos del frontend y la tabla de `SPEC.md`.

## Convenciones de Rust

- La lógica va en módulos independientes de Tauri y con tests; los `#[tauri::command]` solo delegan.
- Errores tipados con `thiserror`; **nada de `unwrap()`/`expect()`** en código de producción.
- Los docsets son entrada no confiable: valida rutas (evita path traversal), tolera índices corruptos o con campos nulos.
- Soporta los dos esquemas de índice: `searchIndex` y Core Data (`ZTOKEN`...).
- La búsqueda interactiva se hace en memoria con matching difuso, no con `LIKE` en SQL.
- Operaciones de disco o SQLite potencialmente lentas fuera del hilo principal.

## Convenciones de frontend

- TypeScript estricto; evita `any`.
- Componentes funcionales y hooks. Estado ligero (Zustand o similar).
- Estilos solo con Tailwind; soporta tema oscuro y claro desde el principio.
- Toda llamada al backend pasa por wrappers tipados en `src/lib/`, no `invoke()` suelto en componentes.
- **Nunca** inyectes el HTML de un docset en el DOM de React: se muestra en un `<iframe>` vía `opendoc://`.
- Navegación por teclado completa en la Command Palette (`Ctrl/Cmd+K`).

## Datos de prueba

Los docsets reales para tests van en `src-tauri/tests/fixtures/` (por ejemplo Python y CSS). No los subas a git si son pesados: documenta cómo descargarlos en el README y usa `.gitignore`.

## Fuera de alcance (por ahora)

Docsets tarix, descarga de docsets, pestañas, favoritos y sincronización. Solo se abordan cuando `SPEC.md` los marque para la versión en curso.