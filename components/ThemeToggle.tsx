"use client";

import { useEffect, useState } from "react";

type ResolvedTheme = "light" | "dark";

const THEME_STORAGE_KEY = "budget-theme";

const getDocumentTheme = (): ResolvedTheme =>
  document.documentElement.dataset.theme === "light" ? "light" : "dark";

const applyTheme = (theme: ResolvedTheme) => {
  document.documentElement.dataset.theme = theme;
  document.documentElement.style.colorScheme = theme;
};

export default function ThemeToggle() {
  const [theme, setTheme] = useState<ResolvedTheme>("dark");

  useEffect(() => {
    const syncFrame = window.requestAnimationFrame(() => {
      setTheme(getDocumentTheme());
    });
    const mediaQuery = window.matchMedia?.("(prefers-color-scheme: light)");
    const handleSystemThemeChange = () => {
      const savedTheme = window.localStorage.getItem(THEME_STORAGE_KEY);
      if (savedTheme !== "light" && savedTheme !== "dark") {
        const nextTheme = mediaQuery?.matches ? "light" : "dark";
        applyTheme(nextTheme);
        setTheme(nextTheme);
      }
    };

    mediaQuery?.addEventListener("change", handleSystemThemeChange);
    return () => {
      window.cancelAnimationFrame(syncFrame);
      mediaQuery?.removeEventListener("change", handleSystemThemeChange);
    };
  }, []);

  const toggleTheme = () => {
    const nextTheme = getDocumentTheme() === "dark" ? "light" : "dark";
    window.localStorage.setItem(THEME_STORAGE_KEY, nextTheme);
    applyTheme(nextTheme);
    setTheme(nextTheme);
  };

  return (
    <button
      type="button"
      onClick={toggleTheme}
      aria-label={`Switch to ${theme === "dark" ? "light" : "dark"} mode`}
      aria-pressed={theme === "dark"}
      title={`Switch to ${theme === "dark" ? "light" : "dark"} mode`}
      className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full border border-[var(--color-border)] bg-[var(--color-surface-strong)] text-lg leading-none text-[var(--color-text-muted)] shadow-[var(--shadow-control)] transition-colors hover:border-[var(--color-border-strong)] hover:bg-[var(--color-surface-alt)] hover:text-[var(--color-text)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-teal-600/40"
    >
      <span aria-hidden="true">{theme === "dark" ? "☀" : "☾"}</span>
    </button>
  );
}
