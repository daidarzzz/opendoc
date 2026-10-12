# Probar OpenDoc en macOS sin releases (workflow `mac-dev`)

Iteración rápida: lanzas la compilación desde el PC con Windows, esperas unos
minutos y bajas la app ya compilada a tu MacBook con `gh`. Sin tags, sin
releases, sin instaladores.

## Requisitos

En las **dos máquinas**:

- [`gh`](https://cli.github.com/) instalado y autenticado contra el mismo
  repositorio (`gh auth login`; compruébalo con `gh auth status`).
  - PC: `winget install GitHub.cli`.
  - Mac: `brew install gh`.
- Permiso de escritura en el repo (lanzar un `workflow_dispatch` lo exige).
- En el Mac: Xcode Command Line Tools (el runner ya compila; en local solo
  hacen falta para ejecutar la app, y normalmente ya están).

## Registro único (solo la primera vez)

Limitación de GitHub: **un workflow con `workflow_dispatch` debe existir en
la rama por defecto (`master`) para poder lanzarse**, incluso si lo lanzas
con `--ref` a otra rama. Por eso hay un paso único de registro:

```powershell
# En el PC, desde master con el workflow ya commiteado:
git checkout master
git add .github\workflows\mac-dev.yml scripts\mac-dev.ps1 scripts\mac-fetch.sh docs\mac-testing.md
git commit -m "ci: workflow mac-dev para probar en macOS sin releases"
git push origin master
```

Ese push a `master` dispara **una vez** el `check` del CI normal
(`release.yml` corre en cada push a `master`): es inevitable y es solo una
vez. A partir de ahí, **trabaja siempre en una rama aparte** (por ejemplo
`mac-dev`) e itera con `--ref`: los pushes a `mac-dev` no disparan ningún
workflow del CI (el `check` solo escucha pushes a `master`), y el `mac-dev`
solo corre cuando lo lanzas a mano.

```powershell
# Crear la rama de iteración DESPUÉS de registrar el workflow en master.
# El orden importa por las cachés (ver "Cachés" más abajo): así mac-dev
# hereda la caché que siembre la primera ejecución en master.
git checkout -b mac-dev
git push -u origin mac-dev
```

## Flujo de cada iteración

```powershell
# 1. En el PC: commitea tus cambios en la rama mac-dev y súbelos.
git add -A
git commit -m "wip: ..."
git push

# 2. Lanza el build (modo debug = rápido, por defecto) y espera.
.\scripts\mac-dev.ps1
# Para medir rendimiento real (build de release, lento):
# .\scripts\mac-dev.ps1 -Optimized
```

El script imprime la URL de la ejecución, espera con `gh run watch` y al
final muestra el tiempo total. Los tiempos por paso (dependencias, build
Tauri, empaquetado) quedan en el **resumen del job** (`Summary`) de la
ejecución en la pestaña Actions.

```bash
# 3. En el Mac: baja el último artefacto correcto y abre la app.
./scripts/mac-fetch.sh
# Variantes:
./scripts/mac-fetch.sh mac-dev   # última ejecución OK de esa rama
./scripts/mac-fetch.sh 123456789 # artefacto de una ejecución concreta
```

`mac-fetch.sh` descarga el zip en `~/Downloads/opendoc-mac-dev`, lo
descomprime, cierra la instancia anterior de OpenDoc si estaba abierta,
quita la cuarentena (`xattr -cr`) y abre la app.

## Tiempos esperados (ESTIMACIONES, pendientes de medir)

> Todo lo de esta sección son **estimaciones groseras** hasta que midamos
> las primeras ejecuciones reales. Se actualizará con los datos del resumen
> del job.

| Caso | Estimación |
| --- | --- |
| Cola del runner + setup (checkout, Node, toolchain) | ~1–2 min |
| `npm ci` (con caché) | ~0,5–1 min |
| Build Tauri en **debug**, caché Rust **fría** | ~8–15 min (ESTIMACIÓN) |
| Build Tauri en **debug**, caché Rust **caliente** | ~2–5 min (ESTIMACIÓN) |
| Build **optimizado** (release + LTO) | entre 2× y 3× el debug (ESTIMACIÓN) |
| Firma + empaquetado + subida | < 1 min |

Nota sobre el resumen del job: el paso "Build Tauri" agrupa frontend (vite),
compilación Rust y bundle `.app` en **una sola fila**, porque todo ocurre
dentro de una única invocación de `tauri build`. Separarlo exigiría compilar
el frontend dos veces y ralentizaría cada iteración; si algún día el
frontend domina el tiempo (no se espera: son segundos frente a minutos de
Rust), se puede dividir.

## Cómo funciona el workflow (resumen)

- `runs-on: macos-latest` (solo Apple Silicon, sin matriz), disparo solo
  manual con entrada `optimized` (`false` = debug, `true` = release).
- Sin tests ni checks. El `beforeBuildCommand` (`npm run build` = `tsc` +
  `vite build`) se parchea **solo en este workflow** con
  `-c '{"build": {"beforeBuildCommand": "npx vite build", "frontendDist": "../dist"}}'`,
  que salta el typecheck. Se incluye `frontendDist` explícito para que el
  parche funcione tanto si la fusión de `-c` es profunda como si reemplaza
  el objeto `build` entero (comportamiento no verificado desde aquí; la
  primera ejecución lo confirma).
- Debug lleva `CARGO_PROFILE_DEV_DEBUG=false` (variable oficial de Cargo,
  sin tocar `Cargo.toml`) para enlazar más rápido.
- Solo bundle `.app` (`--bundles app`, sin `.dmg`).
- El `.app` se firma ad-hoc (`codesign --force --deep --sign -`) y se
  empaqueta con `ditto -c -k --keepParent` antes de subirlo, porque
  `upload-artifact` no conserva permisos. Se sube con `compression-level: 0`
  (el zip ya va comprimido), nombre `opendoc-mac-<sha>-<debug|optimized>` y
  retención de 3 días. El paso falla con mensaje claro si no hay
  exactamente un `.app`.

## Runner: qué macOS y Xcode trae `macos-latest` hoy

Registrado el 2026-10-12 (puede cambiar; GitHub rota las imágenes):

- `macos-latest` → imagen **macOS 26 (Tahoe) ARM64** (runner M1, 4 vCPU,
  7 GB RAM). La imagen `macos-26-arm64` trae macOS 26.6.x y **Xcode 26.6
  por defecto** (`/Applications/Xcode.app`), con las 26.0.1–26.5 también
  instaladas.
- Fuentes: [referencia de runners de
  GitHub](https://docs.github.com/en/actions/reference/runners/github-hosted-runners)
  (`macos-latest` enlaza a `macos-26-arm64`) y [notas de la imagen
  macos-26](https://github.com/actions/runner-images/blob/main/images/macos/macos-26-Readme.md)
  (versión de SO y tabla de Xcode).
- Si algún día `macos-latest` salta a otra versión mayor y algo se rompe,
  fija la etiqueta en el workflow (`runs-on: macos-26` congela Tahoe;
  `macos-15` es la anterior). Fijar etiqueta da estabilidad pero congela
  también Xcode y el toolchain preinstalado: úsalo solo si `latest` da
  problemas.

## Cachés: alcance y recomendación

Las cachés de Actions (npm y Rust) **no se comparten entre ramas
hermanas**: una ejecución solo restaura cachés creadas en **su propia rama
o en la rama por defecto (`master`)**. En cambio, la caché sembrada en
`master` sí la ve cualquier rama hija.

Fuentes: [referencia de dependency
caching](https://docs.github.com/en/actions/reference/workflows-and-actions/dependency-caching)
("los runs restauran cachés de la rama actual o de la por defecto; no las
de ramas hijas ni hermanas") y [consejos de
actions/cache](https://github.com/actions/cache/blob/main/tips-and-workarounds.md)
("si ambas ramas hijas cuelgan de la por defecto, la caché de la por
defecto la consumen las dos").

Recomendación (por eso el orden del registro importa):

1. Registra el workflow en `master` y deja que corra **una vez** allí
   (aunque sea en debug): eso siembra la caché de `master`.
2. Crea `mac-dev` **desde `master`** después: sus ejecuciones restauran la
   caché de `master` en la primera iteración y crean la suya propia a
   partir de ahí.
3. No abras ramas de iteración hermanas (`mac-dev-2`, `prueba-x`): cada una
   empezaría con caché fría.

La clave de `rust-cache` es estable (`shared-key: mac-dev`) y
`cache-on-failure: true` guarda caché incluso si la compilación falla, para
que la siguiente iteración no empiece de cero.

## Problemas típicos

- **Workflow no visible / `gh workflow run` dice que no existe**: el
  workflow aún no está en `master`. Haz el registro único de arriba y
  espera a que el push llegue a GitHub.
- **Gatekeeper bloquea la app ("no se puede abrir porque no se puede
  verificar el desarrollador")**: normal en app sin firmar. `mac-fetch.sh`
  ya hace `xattr -cr`; si abres el zip a mano, ejecútalo tú. La firma
  ad-hoc del workflow permite ejecutar, pero no sustituye a una firma con
  certificado de pago (eso solo importaría para distribuir fuera de este
  flujo).
- **La app no arranca / "permiso denegado"**: el `.app` pierde el bit de
  ejecución si se sube sin empaquetar. El workflow ya lo evita con el zip
  de `ditto`; si ves esto, sospecha de un cambio en el paso de empaquetado.
- **Artefacto caducado**: retienen 3 días. `gh run download` falla con "no
  artifacts found": relanza el workflow desde el PC.
- **`npm ci` falla en macOS por dependencias nativas**: es el fallo clásico
  cuando el `package-lock.json` se generó en Windows y le faltan las
  variantes de macOS (p. ej. `@rollup/rollup-darwin-arm64`, `esbuild` o
  `fsevents`). **Comprobado el 2026-10-12: nuestro lockfile (versión 3) ya
  incluye las entradas `darwin-arm64`** (`@rolldown/binding-darwin-arm64`
  para Vite 8, `lightningcss-darwin-arm64`, `@tauri-apps/cli-darwin-arm64`
  y `fsevents`; no hay dependencias de `rollup`/`esbuild` nativo en el
  árbol), así que `npm ci` debería funcionar en el runner ARM. Si aun así
  falla con un módulo nativo ausente, el arreglo propuesto (**no
  aplicado**) es regenerar las entradas desde un macOS con
  `npm install --package-lock-only`, commitear el lockfile actualizado y
  reintentar.
- **El `.app` no aparece (el paso falla con "se esperaba exactamente un
  .app")**: la causa más probable es que `--bundles app` no sea un valor
  válido en el runner macOS (verificado en Windows y en la doc, donde los
  valores dependen del SO; en macOS debería ser `app`, pendiente de
  confirmar). Fallback documentado: quitar `--bundles app` del comando para
  que empaquete todo (`tauri.conf.json` tiene `targets: all`, generaría
  `.app` + `.dmg`); el glob seguiría encontrando el `.app`.
- **El build tarda mucho más que las estimaciones**: mira el resumen del
  job para ver qué paso domina. Si es Rust con caché caliente, la causa
  probable es que la caché no se restauró (rama hermana nueva, cambio de
  `Cargo.lock` o de toolchain); `gh cache list` lo confirma.
