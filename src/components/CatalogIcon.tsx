// Icono de catálogo (SVG propio inline).
import { memo } from "react";
import { useT } from "../hooks/useT";

interface CatalogIconProps {
  size?: number;
  className?: string;
}

export const CatalogIcon = memo(function CatalogIcon({ size = 16, className }: CatalogIconProps) {
  const { t } = useT();
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      aria-label={t("catalog.title")}
      role="img"
      className={className ? `shrink-0 ${className}` : "shrink-0"}
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20" />
      <path d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2z" />
      <path d="M4 10h16" />
      <path d="M4 14h12" />
    </svg>
  );
});