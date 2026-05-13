/** @type {import('tailwindcss').Config} */
export default {
  content: ["./index.html", "./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      fontFamily: {
        sans: ["Geist", "Satoshi", "Aptos", "system-ui", "sans-serif"],
        mono: ["JetBrains Mono", "SFMono-Regular", "Consolas", "monospace"],
      },
      colors: {
        ink: {
          950: "#18181b",
          800: "#27272a",
          600: "#52525b",
          400: "#a1a1aa",
        },
        pine: {
          500: "#2f7d67",
          600: "#286b59",
          700: "#215848",
        },
      },
      boxShadow: {
        diffusion: "0 24px 60px -35px rgba(24, 24, 27, 0.38)",
      },
    },
  },
  plugins: [],
};
