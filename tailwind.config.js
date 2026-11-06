/** @type {import('tailwindcss').Config} */
export default {
  content: ["./index.html", "./src/**/*.{ts,tsx}"],
  darkMode: "class",
  theme: {
    extend: {
      fontFamily: {
        sans: [
          "Inter",
          "ui-sans-serif",
          "system-ui",
          "-apple-system",
          "Segoe UI Variable Text",
          "Segoe UI",
          "Roboto",
          "Helvetica Neue",
          "Arial",
          "sans-serif",
        ],
      },
      // Acento de color (canales RGB de `index.css`, con opacidad):
      // `accent` (marca), `accent-text` (texto e indicadores),
      // `accent-solid` (botones primarios) y `on-accent` (sobre sólido).
      colors: {
        accent: {
          DEFAULT: "rgb(var(--accent-ch) / <alpha-value>)",
          text: "rgb(var(--accent-text-ch) / <alpha-value>)",
          solid: "rgb(var(--accent-solid-ch) / <alpha-value>)",
          on: "rgb(var(--on-accent-ch) / <alpha-value>)",
        },
      },
      transitionTimingFunction: {
        // Curva suave de salida usada en toda la interfaz.
        smooth: "cubic-bezier(0.22, 1, 0.36, 1)",
      },
      boxShadow: {
        soft: "0 1px 2px rgb(0 0 0 / 0.04), 0 1px 3px rgb(0 0 0 / 0.06)",
        float:
          "0 0 0 1px rgb(0 0 0 / 0.04), 0 8px 24px -4px rgb(0 0 0 / 0.18), 0 24px 48px -12px rgb(0 0 0 / 0.22)",
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
