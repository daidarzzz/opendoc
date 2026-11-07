// Descarga los iconos Devicon (MIT) que usa `src/lib/langIcons.json` a
// `src/assets/devicons/<nombre>.svg`, para que el catálogo y la barra
// lateral tengan icono sin red. Versión pineada; solo se aceptan nombres
// presentes en el `devicon.json` de esa versión y SVG con forma válida.
//
// Uso: node scripts/gen-devicons.mjs
import { mkdir, readFile, writeFile, readdir, unlink } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const BASE = "https://cdn.jsdelivr.net/gh/devicons/devicon@v2.17.0";
const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const outDir = join(root, "src", "assets", "devicons");
const MAX_BYTES = 64 * 1024;

const map = JSON.parse(await readFile(join(root, "src", "lib", "langIcons.json"), "utf8"));
const names = [...new Set(Object.values(map))].sort();

const index = await (await fetch(`${BASE}/devicon.json`)).json();
const byName = new Map(index.map((d) => [d.name, d.versions.svg]));

await mkdir(outDir, { recursive: true });
const wanted = new Set();
let failed = 0;
for (const name of names) {
  const variants = byName.get(name);
  if (!variants) {
    console.error(`missing in devicon.json: ${name}`);
    failed++;
    continue;
  }
  // Primera variante válida y no demasiado pesada (p. ej. `linux` original
  // pesa ~190 KB; su variante plain es ligera).
  let text = "";
  for (const variant of ["original", "plain", "original-wordmark", "plain-wordmark"].filter((v) => variants.includes(v))) {
    const res = await fetch(`${BASE}/icons/${name}/${name}-${variant}.svg`);
    const body = res.ok ? await res.text() : "";
    if (res.ok && body.length <= MAX_BYTES && /^\s*(<\?xml[^>]*>\s*)?<svg[\s>]/i.test(body) && !/<script/i.test(body)) {
      text = body;
      break;
    }
  }
  if (!text) {
    console.error(`rejected: ${name}`);
    failed++;
    continue;
  }
  await writeFile(join(outDir, `${name}.svg`), text.trim() + "\n");
  wanted.add(`${name}.svg`);
}
// Quita iconos que ya no se referencian.
for (const file of await readdir(outDir)) {
  if (file.endsWith(".svg") && !wanted.has(file)) await unlink(join(outDir, file));
}
console.log(`${wanted.size} icons written, ${failed} failed`);
process.exit(failed > 0 ? 1 : 0);
