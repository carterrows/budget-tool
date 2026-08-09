"use client";

import { useEffect } from "react";

type ResolvedTheme = "light" | "dark";

const THEME_STORAGE_KEY = "budget-theme";

const getDocumentTheme = (): ResolvedTheme =>
  document.documentElement.dataset.theme === "light" ? "light" : "dark";

const applyTheme = (theme: ResolvedTheme) => {
  document.documentElement.dataset.theme = theme;
  document.documentElement.style.colorScheme = theme;
};

export default function ThemeToggle() {
  useEffect(() => {
    const mediaQuery = window.matchMedia?.("(prefers-color-scheme: light)");
    const handleSystemThemeChange = () => {
      const savedTheme = window.localStorage.getItem(THEME_STORAGE_KEY);
      if (savedTheme !== "light" && savedTheme !== "dark") {
        const nextTheme = mediaQuery?.matches ? "light" : "dark";
        applyTheme(nextTheme);
      }
    };

    mediaQuery?.addEventListener("change", handleSystemThemeChange);
    return () => mediaQuery?.removeEventListener("change", handleSystemThemeChange);
  }, []);

  const toggleTheme = () => {
    const nextTheme = getDocumentTheme() === "dark" ? "light" : "dark";
    window.localStorage.setItem(THEME_STORAGE_KEY, nextTheme);
    applyTheme(nextTheme);
  };

  return (
    <button
      type="button"
      onClick={toggleTheme}
      className="theme-toggle"
      aria-label="Toggle light and dark mode"
      title="Toggle light and dark mode"
    >
      <span aria-hidden="true" className="theme-toggle-icon theme-toggle-sun">☀</span>
      <span aria-hidden="true" className="theme-toggle-icon theme-toggle-moon">☾</span>
    </button>
  );
}
