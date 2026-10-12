// Logo de OpenDoc (variante normal, SVG propio inline como DocsetIcon).
// Siempre decorativo: acompaña a texto visible, así que va con aria-hidden
// y no necesita claves i18n. La variante "box" (fondo propio) solo se usa
// para el icono del SO y el favicon.
import { memo } from "react";

interface AppLogoProps {
  size?: number;
  className?: string;
}

export const AppLogo = memo(function AppLogo({ size = 16, className }: AppLogoProps) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="116.771 206.771 378.458 378.458"
      aria-hidden="true"
      focusable="false"
      className={className ? `shrink-0 ${className}` : "shrink-0"}
    >
      <path
        d="M305.873 206.899 L306.127 206.899 C410.565 206.899 495.229 291.562 495.229 396 L495.229 396 C495.229 500.438 410.565 585.101 306.127 585.101 L305.873 585.101 C201.435 585.101 116.771 500.438 116.771 396 L116.771 396 C116.771 291.562 201.435 206.899 305.873 206.899 Z"
        fill="#de3830"
      />
      <path
        d="M255.244 269.837 C247.691 270.743 179.216 316.964 177.303 338.11 C175.39 359.257 244.676 374.961 243.764 396.717 C242.852 418.473 171.832 451.329 171.832 468.649 C171.832 485.969 234.662 501.852 243.764 500.638 C252.866 499.424 216.069 480.196 226.441 461.365 C236.813 442.535 306.633 409.103 305.996 387.654 C305.358 366.205 231.076 352.309 222.617 332.673 C214.159 313.037 262.796 268.931 255.244 269.837 Z"
        fill="#ffffff"
      />
      <path
        d="M309.065 465.568 C292.55 470.42 292.55 489.233 309.065 494.681 C325.579 500.129 391.638 503.109 408.152 498.257 C424.667 493.404 424.667 471.016 408.152 465.568 C391.638 460.12 325.579 460.715 309.065 465.568 Z"
        fill="#ffffff"
      />
    </svg>
  );
});
