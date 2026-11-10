/** @type {import('tailwindcss').Config} */
export default {
  content: ["./index.html", "./src/**/*.{ts,tsx}"],
  darkMode: "class",
  theme: {
    extend: {
      fontFamily: {
        // Inter para la interfaz, Bricolage Grotesque para titulares y
        // JetBrains Mono para símbolos, atajos y versiones.
        sans: [
          "Inter Variable",
          "ui-sans-serif",
          "system-ui",
          "-apple-system",
          "Segoe UI Variable Text",
          "Segoe UI",
          "Roboto",
          "sans-serif",
        ],
        display: ["Bricolage Grotesque Variable", "Inter Variable", "ui-sans-serif", "system-ui", "sans-serif"],
        mono: ["JetBrains Mono Variable", "ui-monospace", "SFMono-Regular", "Menlo", "Consolas", "monospace"],
      },
      // Acento de color (canales RGB de `index.css`, con opacidad):
      // `accent` (marca), `accent-text` (texto e indicadores),
      // `accent-solid` (botones primarios) y `on-accent` (sobre sólido).
      // Superficies: lienzo teñido por el acento + tarjeta neutra.
      colors: {
        accent: {
          DEFAULT: "rgb(var(--accent-ch) / <alpha-value>)",
          text: "rgb(var(--accent-text-ch) / <alpha-value>)",
          solid: "rgb(var(--accent-solid-ch) / <alpha-value>)",
          on: "rgb(var(--on-accent-ch) / <alpha-value>)",
        },
        canvas: {
          DEFAULT: "rgb(var(--canvas-ch) / <alpha-value>)",
          2: "rgb(var(--canvas-2-ch) / <alpha-value>)",
          line: "rgb(var(--canvas-line-ch) / <alpha-value>)",
        },
        card: {
          DEFAULT: "rgb(var(--card-ch) / <alpha-value>)",
          2: "rgb(var(--card-2-ch) / <alpha-value>)",
        },
        line: "rgb(var(--line-ch) / <alpha-value>)",
        ink: {
          DEFAULT: "rgb(var(--ink-ch) / <alpha-value>)",
          2: "rgb(var(--ink-2-ch) / <alpha-value>)",
        },
        muted: "rgb(var(--muted-ch) / <alpha-value>)",
        faint: "rgb(var(--faint-ch) / <alpha-value>)",
      },
      transitionTimingFunction: {
        // Curva suave de salida usada en toda la interfaz.
        smooth: "cubic-bezier(0.22, 1, 0.36, 1)",
      },
      boxShadow: {
        soft: "0 1px 2px rgb(var(--shadow-ch) / 0.06)",
        card: "0 0 0 1px rgb(var(--shadow-ch) / 0.05), 0 1px 3px rgb(var(--shadow-ch) / 0.07), 0 12px 32px -18px rgb(var(--shadow-ch) / 0.25)",
        float:
          "0 0 0 1px rgb(var(--shadow-ch) / 0.06), 0 10px 28px -8px rgb(var(--shadow-ch) / 0.28)",
        pop: "0 0 0 1px rgb(var(--shadow-ch) / 0.05), 0 24px 64px -16px rgb(var(--shadow-ch) / 0.42), 0 8px 20px -10px rgb(var(--shadow-ch) / 0.2)",
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
