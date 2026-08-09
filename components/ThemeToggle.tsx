"use client";

import { useEffect, useState } from "react";

type ThemePreference = "system" | "light" | "dark";

const THEME_STORAGE_KEY = "budget-theme";

const isThemePreference = (value: string | null): value is ThemePreference =>
  value === "system" || value === "light" || value === "dark";

const resolveTheme = (preference: ThemePreference): "light" | "dark" => {
  if (preference !== "system") {
    return preference;
  }

  if (typeof window === "undefined" || typeof window.matchMedia !== "function") {
    return "dark";
  }

  return window.matchMedia("(prefers-color-scheme: light)").matches ? "light" : "dark";
};

const applyTheme = (preference: ThemePreference) => {
  const resolvedTheme = resolveTheme(preference);
  document.documentElement.dataset.theme = resolvedTheme;
  document.documentElement.style.colorScheme = resolvedTheme;
};

export default function ThemeToggle({ compact = false }: { compact?: boolean }) {
  const [preference, setPreference] = useState<ThemePreference>("system");

  useEffect(() => {
    const storedPreference = window.localStorage.getItem(THEME_STORAGE_KEY);
    const initialPreference = isThemePreference(storedPreference) ? storedPreference : "system";
    setPreference(initialPreference);
    applyTheme(initialPreference);

    const mediaQuery = window.matchMedia?.("(prefers-color-scheme: light)");
    const handleSystemThemeChange = () => {
      if ((window.localStorage.getItem(THEME_STORAGE_KEY) ?? "system") === "system") {
        applyTheme("system");
      }
    };

    mediaQuery?.addEventListener("change", handleSystemThemeChange);
    return () => mediaQuery?.removeEventListener("change", handleSystemThemeChange);
  }, []);

  const chooseTheme = (nextPreference: ThemePreference) => {
    setPreference(nextPreference);
    if (nextPreference === "system") {
      window.localStorage.removeItem(THEME_STORAGE_KEY);
    } else {
      window.localStorage.setItem(THEME_STORAGE_KEY, nextPreference);
    }
    applyTheme(nextPreference);
  };

  return (
    <div
      className={`theme-toggle ${compact ? "theme-toggle-compact" : ""}`}
      aria-label="Colour theme"
      role="group"
    >
      {(["system", "light", "dark"] as const).map((option) => (
        <button
          key={option}
          type="button"
          onClick={() => chooseTheme(option)}
          aria-pressed={preference === option}
          className="theme-toggle-option"
        >
          {option === "system" ? "Auto" : option === "light" ? "Light" : "Dark"}
        </button>
      ))}
    </div>
  );
}
