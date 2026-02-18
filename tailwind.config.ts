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
        paper: "#f7f5f2",
        forest: {
          50: "#eef6f2",
          100: "#d8ebdf",
          200: "#b5d7c2",
          300: "#8dbf9f",
          400: "#5ea17a",
          500: "#39885f",
          600: "#266d49",
          700: "#1c5639",
          800: "#10492f",
          900: "#06402b"
        }
      },
      boxShadow: {
        card: "0 14px 30px rgba(6, 64, 43, 0.08)"
      }
    }
  },
  plugins: []
};

export default config;
