export type Theme = "light" | "dark";

export const THEME_STORAGE_KEY = "theme";
export const THEME_CHANGE_EVENT = "themechange";
export const DEFAULT_THEME: Theme = "dark";

/** Pure: the opposite theme. */
export function resolveNextTheme(current: Theme): Theme {
  return current === "dark" ? "light" : "dark";
}

/** Read the theme currently applied to <html>. Client-only. */
export function getActiveTheme(): Theme {
  return document.documentElement.classList.contains("dark") ? "dark" : "light";
}

/** Apply a theme: toggle the class, persist it, and notify listeners. Client-only. */
export function setTheme(theme: Theme): void {
  document.documentElement.classList.toggle("dark", theme === "dark");
  try {
    localStorage.setItem(THEME_STORAGE_KEY, theme);
  } catch {
    // Ignore storage failures (private mode, disabled storage, etc.).
  }
  window.dispatchEvent(new CustomEvent<Theme>(THEME_CHANGE_EVENT, { detail: theme }));
}

/** Flip light<->dark, returning the new theme. Client-only. */
export function toggleTheme(): Theme {
  const next = resolveNextTheme(getActiveTheme());
  setTheme(next);
  return next;
}

/**
 * Inline <head> script that applies the persisted theme before first paint,
 * defaulting to dark when nothing is stored. Injected via `set:html`.
 */
export const THEME_INIT_SCRIPT = `(function(){try{var t=localStorage.getItem("${THEME_STORAGE_KEY}");var d=t?t==="dark":${DEFAULT_THEME === "dark"};document.documentElement.classList.toggle("dark",d);}catch(e){document.documentElement.classList.${DEFAULT_THEME === "dark" ? "add" : "remove"}("dark");}})();`;

export interface ShaderPalette {
  base: string;
  colorA: string;
  colorB: string;
}

/** Shader colors per theme, consumed by shaderBackground.tsx. */
export const SHADER_PALETTES: Record<Theme, ShaderPalette> = {
  dark: { base: "#09060f", colorA: "#0073b5", colorB: "#1f0761" },
  light: { base: "#eef1f8", colorA: "#3b5bdb", colorB: "#7ac7c2" },
};
