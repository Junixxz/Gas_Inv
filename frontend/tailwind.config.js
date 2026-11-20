/** @type {import('tailwindcss').Config} */
export default {
  content: ["./index.html", "./src/**/*.{js,jsx}"],
  theme: {
    extend: {
      colors: {
        ink: "var(--color-ink)",
        muted: "var(--color-muted)",
        brand: "#176b5b",
        canvas: "var(--color-canvas)",
      },
      boxShadow: {
        soft: "0 8px 32px rgba(27, 47, 69, 0.06)",
      },
    },
  },
  plugins: [],
};
