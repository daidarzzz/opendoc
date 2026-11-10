/** @type {import('tailwindcss').Config} */
export default {
  content: ["./index.html", "./src/**/*.{ts,tsx}"],
  darkMode: "class",
  theme: {
    extend: {
      fontFamily: {
        // Newsreader para todo el texto (también el `font-sans` por
        // defecto); IBM Plex Mono para etiquetas, teclas y símbolos.
        sans: [
          "Newsreader Variable",
          "Iowan Old Style",
          "Palatino Linotype",
          "Palatino",
          "Georgia",
          "serif",
        ],
        serif: ["Newsreader Variable", "Iowan Old Style", "Palatino Linotype", "Georgia", "serif"],
        mono: [
          "IBM Plex Mono",
          "ui-monospace",
          "SFMono-Regular",
          "Menlo",
          "Consolas",
          "monospace",
        ],
      },
      // Acento de color (canales RGB de `index.css`, con opacidad):
      // `accent` (marca), `accent-text` (texto e indicadores),
      // `accent-solid` (botones primarios) y `on-accent` (sobre sólido).
      // Papel y tinta: superficies y textos de la interfaz.
      colors: {
        accent: {
          DEFAULT: "rgb(var(--accent-ch) / <alpha-value>)",
          text: "rgb(var(--accent-text-ch) / <alpha-value>)",
          solid: "rgb(var(--accent-solid-ch) / <alpha-value>)",
          on: "rgb(var(--on-accent-ch) / <alpha-value>)",
        },
        paper: {
          DEFAULT: "rgb(var(--paper-ch) / <alpha-value>)",
          2: "rgb(var(--paper-2-ch) / <alpha-value>)",
          3: "rgb(var(--paper-3-ch) / <alpha-value>)",
        },
        sheet: "rgb(var(--sheet-ch) / <alpha-value>)",
        ink: {
          DEFAULT: "rgb(var(--ink-ch) / <alpha-value>)",
          2: "rgb(var(--ink-2-ch) / <alpha-value>)",
        },
        muted: "rgb(var(--muted-ch) / <alpha-value>)",
        faint: "rgb(var(--faint-ch) / <alpha-value>)",
        rule: "rgb(var(--rule-ch) / <alpha-value>)",
        // Gris cálido (piedra) por si algún resto usa `gray-*`.
        gray: {
          50: "#F8F6F1",
          100: "#EFEBE2",
          200: "#E2DCCF",
          300: "#CFC6B5",
          400: "#A69C8B",
          500: "#7D7466",
          600: "#5F574B",
          700: "#4A4339",
          800: "#2F2A23",
          900: "#1F1C17",
          950: "#15130F",
        },
      },
      transitionTimingFunction: {
        // Curva suave de salida usada en toda la interfaz.
        smooth: "cubic-bezier(0.22, 1, 0.36, 1)",
      },
      boxShadow: {
        soft: "0 1px 0 rgb(var(--shadow-ch) / 0.06)",
        float:
          "0 1px 0 rgb(var(--shadow-ch) / 0.05), 0 14px 32px -12px rgb(var(--shadow-ch) / 0.32), 0 30px 60px -30px rgb(var(--shadow-ch) / 0.35)",
      },
      keyframes: {
        "fade-in": {
          from: { opacity: "0" },
          to: { opacity: "1" },
        },
        "pop-in": {
          from: { opacity: "0", transform: "translateY(-6px) scale(0.98)" },
          to: { opacity: "1", transform: "translateY(0) scale(1)" },
        },
        "rise-in": {
          from: { opacity: "0", transform: "translateY(6px)" },
          to: { opacity: "1", transform: "translateY(0)" },
        },
        "menu-in": {
          from: { opacity: "0", transform: "scale(0.96)" },
          to: { opacity: "1", transform: "scale(1)" },
        },
      },
      animation: {
        "menu-in": "menu-in 120ms cubic-bezier(0.22, 1, 0.36, 1) both",
        "fade-in": "fade-in 160ms ease-out both",
        "pop-in": "pop-in 200ms cubic-bezier(0.22, 1, 0.36, 1) both",
        "rise-in": "rise-in 320ms cubic-bezier(0.22, 1, 0.36, 1) both",
      },
    },
  },
  plugins: [],
};
