// Genera los 4 PNG "box" del icono de app (uno por acento) desde el SVG
// original `src/assets/opendoc-logo-box.svg` (que NO se modifica).
// - Cuadrícula estándar de iconos de macOS (Apple HIG): el squircle ocupa
//   ~824x824 en un lienzo de 1024x1024 (~100px de padding transparente por
//   cada lado). Esto evita que en el Dock de macOS aparezca desmesuradamente
//   grande ("el doble") respecto a las apps del sistema.
// - Salida: `src-tauri/gen-icons/accent-{red,blue,amber,catppuccin}.png` (512px)
//   y `src-tauri/gen-icons/accent-{red,blue,amber,catppuccin}@2x.png` (1024px)
//   (alfa intacto: las esquinas fuera del box siguen transparentes,
//   sin fondo blanco aplanado).
// - Motor: `@resvg/resvg-js` (devDependency: binarios para win/mac/linux,
//   render determinista). Justificación AGENTS.md: única forma reproducible
//   de rasterizar el SVG sin depender del SO.
// - Catppuccin usa Latte #8839EF: el icono vive sobre fondos variables
//   (taskbar/Dock) y el tono oscuro se lee mejor en ambos.
// - Uso: `node scripts/gen-accent-icons.mjs` (o los wrappers .ps1/.sh).
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { Resvg } from "@resvg/resvg-js";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const ACCENTS = {
  red: "#DE3830",
  blue: "#0071BC",
  amber: "#FBB03B",
  catppuccin: "#8839EF",
};
const SIZES = [512, 1024];

const svgPath = join(root, "src", "assets", "opendoc-logo-box.svg");
const svg = readFileSync(svgPath, "utf8");
if (!/#de3830/i.test(svg)) {
  throw new Error(`el SVG original no trae el rojo de marca: ${svgPath}`);
}
mkdirSync(join(root, "src-tauri", "gen-icons"), { recursive: true });

// Cuadrícula oficial de iconos de macOS: expande el viewBox original
// (116.771 206.771 378.458 378.458) proporcionalmente para que el logo
// ocupe exactamente 824px dentro de 1024px (100px de margen seguro en los 4 bordes).
const PADDED_VIEWBOX = 'viewBox="70.842 160.842 470.317 470.317"';
const paddedSvg = svg.replace(/viewBox="116\.771 206\.771 378\.458 378\.458"/, PADDED_VIEWBOX);
if (paddedSvg === svg) {
  throw new Error(`no se pudo aplicar el viewBox con padding: ${svgPath}`);
}

for (const [name, hex] of Object.entries(ACCENTS)) {
  const colored = paddedSvg.replace(/#de3830/gi, hex);
  for (const SIZE of SIZES) {
    const png = new Resvg(colored, { fitTo: { mode: "width", value: SIZE } })
      .render()
      .asPng();
    // Autoverificación: PNG RGBA (ct=6: alfa intacto).
    const w = png.readUInt32BE(16);
    const h = png.readUInt32BE(20);
    const colorType = png[25];
    if (w !== SIZE || h !== SIZE || colorType !== 6) {
      throw new Error(`${name}@${SIZE}: PNG inesperado (${w}x${h} ct=${colorType})`);
    }
    const suffix = SIZE === 512 ? "" : "@2x";
    const out = join(root, "src-tauri", "gen-icons", `accent-${name}${suffix}.png`);
    writeFileSync(out, png);
    console.log(`ok ${out} (${png.length} bytes)`);
  }
}
