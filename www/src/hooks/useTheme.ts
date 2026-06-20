import { useEffect, useState } from "react";
import {
  DEFAULT_THEME,
  THEME_CHANGE_EVENT,
  THEME_STORAGE_KEY,
  getActiveTheme,
  setTheme,
  toggleTheme,
  type Theme,
} from "@/lib/theme";

/**
 * Exposes the active theme and a toggle to React islands. Starts at
 * DEFAULT_THEME for a stable server/first-client render, then syncs to the
 * real value (set by the inline init script) on mount.
 */
export function useTheme(): { theme: Theme; toggle: () => void } {
  const [theme, setThemeState] = useState<Theme>(DEFAULT_THEME);

  useEffect(() => {
    setThemeState(getActiveTheme());

    const onThemeChange = (event: Event) => {
      const detail = (event as CustomEvent<Theme>).detail;
      setThemeState(detail ?? getActiveTheme());
    };
    const onStorage = (event: StorageEvent) => {
      if (event.key !== THEME_STORAGE_KEY || !event.newValue) return;
      setTheme(event.newValue === "dark" ? "dark" : "light");
    };

    window.addEventListener(THEME_CHANGE_EVENT, onThemeChange);
    window.addEventListener("storage", onStorage);
    return () => {
      window.removeEventListener(THEME_CHANGE_EVENT, onThemeChange);
      window.removeEventListener("storage", onStorage);
    };
  }, []);

  return { theme, toggle: toggleTheme };
}
