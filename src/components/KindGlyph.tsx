// Glifo de tipo de símbolo: letra sobre un cuadrado de color por familia
// (ver `lib/kindGlyph`). Decorativo: el tipo también se lee en texto o en
// el `title` de la fila.
import { memo } from "react";
import { FAMILY_CLASSES, kindFamily, kindLetter } from "../lib/kindGlyph";

export const KindGlyph = memo(function KindGlyph({ kind, size = 16 }: { kind: string; size?: number }) {
  return (
    <span
      aria-hidden
      className={`kind-glyph inline-flex shrink-0 select-none items-center justify-center font-mono font-bold leading-none ${FAMILY_CLASSES[kindFamily(kind)]}`}
      style={{
        width: size,
        height: size,
        borderRadius: Math.round(size * 0.28),
        fontSize: Math.round(size * 0.62),
      }}
    >
      {kindLetter(kind)}
    </span>
  );
});
