// Icono de docset con reserva genérica (SVG propio, ningún logo ajeno).
// El <img> lleva onError por si el data-URL llegara corrupto.
import { memo, useState } from "react";

interface DocsetIconProps {
  icon: string | null;
  name: string;
  size?: number;
}

export const DocsetIcon = memo(function DocsetIcon({
  icon,
  name,
  size = 16,
}: DocsetIconProps) {
  const [broken, setBroken] = useState(false);
  if (!icon || broken) {
    return (
      <svg
        width={size}
        height={size}
        viewBox="0 0 16 16"
        aria-label={`Icono genérico de ${name}`}
        role="img"
        className="shrink-0 text-gray-400"
        fill="currentColor"
      >
        <path d="M3 1h7l3 3v11H3V1zm6 1.5V5h2.5L9 2.5zM5 8h6v1.2H5V8zm0 2.4h6v1.2H5v-1.2zm0 2.4h4V14H5v-1.2z" />
      </svg>
    );
  }
  return (
    <img
      src={icon}
      alt=""
      aria-hidden
      width={size}
      height={size}
      onError={() => setBroken(true)}
      className="shrink-0 rounded-sm"
    />
  );
});
