import type { Config } from "tailwindcss";
import defaultTheme from "tailwindcss/defaultTheme";

const config: Config = {
  content: [
    "./app/**/*.{js,ts,jsx,tsx,mdx}",
    "./components/**/*.{js,ts,jsx,tsx,mdx}",
    "./lib/**/*.{js,ts,jsx,tsx,mdx}"
  ],
  theme: {
    extend: {
      fontFamily: {
        sans: ["var(--font-sans)", ...defaultTheme.fontFamily.sans],
        serif: ["var(--font-serif)", ...defaultTheme.fontFamily.serif],
        display: ["var(--font-serif)", ...defaultTheme.fontFamily.serif]
      },
      colors: {
        paper: "rgb(var(--color-paper) / <alpha-value>)",
        white: "rgb(var(--color-surface) / <alpha-value>)",
        forest: {
          50: "rgb(var(--color-forest-50) / <alpha-value>)",
          100: "rgb(var(--color-forest-100) / <alpha-value>)",
          200: "rgb(var(--color-forest-200) / <alpha-value>)",
          300: "rgb(var(--color-forest-300) / <alpha-value>)",
          400: "rgb(var(--color-forest-400) / <alpha-value>)",
          500: "rgb(var(--color-forest-500) / <alpha-value>)",
          600: "rgb(var(--color-forest-600) / <alpha-value>)",
          700: "rgb(var(--color-forest-700) / <alpha-value>)",
          800: "rgb(var(--color-forest-800) / <alpha-value>)",
          900: "rgb(var(--color-forest-900) / <alpha-value>)"
        },
        wealth: {
          400: "rgb(var(--color-wealth-400) / <alpha-value>)",
          500: "rgb(var(--color-wealth-500) / <alpha-value>)",
          600: "rgb(var(--color-wealth-600) / <alpha-value>)"
        }
      },
      boxShadow: {
        card: "var(--shadow-card)"
      }
    }
  },
  plugins: []
};

export default config;
