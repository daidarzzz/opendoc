/** @type {import('tailwindcss').Config} */
export default {
  content: ["./index.html", "./src/**/*.{ts,tsx}"],
  darkMode: "class",
  theme: {
    extend: {
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
    },
  },
  plugins: [],
};
