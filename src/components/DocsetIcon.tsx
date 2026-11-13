// Icono de docset. Orden: icono propio del docset (o Devicon cacheado por
// el backend) → icono de lenguaje empaquetado (`lib/langIcons`) →
// monograma con color estable. Así siempre hay un icono reconocible.
// Los <img> llevan onError por si el recurso llegara corrupto.
import { memo, useState } from "react";
import { useT } from "../hooks/useT";
import { badge, langIcon, monogram } from "../lib/langIcons";

interface DocsetIconProps {
  icon: string | null;
  name: string;
  /** Id de feed o de docset, para buscar el icono de lenguaje. */
  hint?: string | null;
  size?: number;
}

export const DocsetIcon = memo(function DocsetIcon({
  icon,
  name,
  hint,
  size = 16,
}: DocsetIconProps) {
  const [broken, setBroken] = useState<string | null>(null);
  const { t } = useT();
  const bundled = langIcon(hint, name);
  // Un SVG del backend es su Devicon cacheado: el empaquetado es el mismo
  // icono y además sabemos si hay que invertirlo en tema oscuro. Los
  // iconos propios del docset (PNG) siempre tienen prioridad.
  const own = icon && !(bundled && icon.startsWith("data:image/svg+xml")) ? icon : null;
  const src = [own, bundled?.url].find((s): s is string => !!s && s !== broken) ?? null;
  const invert = src !== null && src === bundled?.url && bundled.dark;

  if (src) {
    return (
      <img
        src={src}
        alt=""
        aria-hidden
        width={size}
        height={size}
        draggable={false}
        onError={() => setBroken(src)}
        className={`shrink-0 rounded-sm object-contain ${invert ? "dark:hue-rotate-180 dark:invert" : ""}`}
        style={{ width: size, height: size }}
      />
    );
  }
  const mono = badge(hint, name) ?? monogram(name);
  const letters = size < 22 ? mono.text.charAt(0) : mono.text;
  return (
    <span
      role="img"
      aria-label={t("common.genericIcon", { name })}
      className="inline-flex shrink-0 select-none items-center justify-center rounded font-semibold leading-none text-white"
      style={{
        width: size,
        height: size,
        backgroundColor: mono.color,
        fontSize: Math.max(8, Math.round(size * (letters.length > 1 ? 0.42 : 0.6))),
        borderRadius: Math.max(3, Math.round(size * 0.22)),
      }}
    >
      {letters}
    </span>
  );
});
