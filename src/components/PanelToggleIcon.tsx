// Icono de plegar/desplegar el panel lateral (SVG propio, trazo estilo
// Material). Siempre decorativo: acompaña a un botón con aria-label.
import { memo } from "react";

interface PanelToggleIconProps {
  /** Hacia dónde apunta la flecha (plegar = izquierda, mostrar = derecha). */
  direction: "left" | "right";
}

export const PanelToggleIcon = memo(function PanelToggleIcon({
  direction,
}: PanelToggleIconProps) {
  return (
    <svg
      aria-hidden="true"
      focusable="false"
      viewBox="0 0 24 24"
      className="h-5 w-5"
      fill="none"
      stroke="currentColor"
      strokeWidth={2}
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <rect x="3" y="4" width="18" height="16" rx="2" />
      {direction === "left" ? (
        <>
          <line x1="9" y1="4" x2="9" y2="20" />
          <path d="M14 9l-3 3 3 3" />
        </>
      ) : (
        <>
          <line x1="15" y1="4" x2="15" y2="20" />
          <path d="M10 9l3 3-3 3" />
        </>
      )}
    </svg>
  );
});
