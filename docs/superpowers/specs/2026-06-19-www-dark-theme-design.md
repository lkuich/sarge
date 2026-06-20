# WWW App — Dark Theme by Default

**Date:** 2026-06-19
**Status:** Approved (design)
**Scope:** `www/` (Astro + Tailwind v4 + shadcn + Clerk + Paper Design shaders)

## Problem

The WWW app has no theme switcher and renders light. We want it to render **dark by
default**, with a working light/dark **toggle**, a **brand-consistent** palette in both
themes (blue primary, teal accent — not generic grayscale), and the newly-added shader
background tracking the active theme.

## Current state (why the existing `.dark` does nothing)

`www/src/styles/global.css` is half-migrated:

- The `@theme inline` block **hardcodes the light branded colors** directly into the
  `--color-*` tokens Tailwind uses (warm bg, blue primary `oklch(0.488 0.193 264.1)`,
  teal accent `oklch(0.91 0.03 177.2)`).
- The `:root` / `.dark` blocks define a **separate, grayscale** shadcn variable set
  (`--background`, `--card`, …) that only feeds the sidebar/chart tokens.

Because the main `--color-*` tokens are hardcoded and not wired to `var(--background)`
etc., toggling `.dark` has no effect on the primary surfaces. There is no `.dark` class
applied to `<html>` in either layout, and Clerk has no `appearance` configured.

## Goals

1. Dark is the default theme on first load (no light flash).
2. A persistent toggle lets users switch to light; choice survives reloads.
3. Brand palette (blue primary, teal accent, tinted neutrals) in **both** themes.
4. The shader background swaps palette to match the active theme, live.
5. Clerk's own widgets render dark to match the default.

## Non-goals

- No system (`prefers-color-scheme`) auto-detection — default is dark regardless of OS.
- No live re-theming of Clerk's own widgets on toggle (see Trade-offs).
- No redesign of components/layout beyond color wiring + adding the toggle/shader.

## Architecture — one bounded theming unit

All theming logic lives in a single module so the toggle, component colors, Clerk
default, and shader palette stay in sync from one place.

### `src/lib/theme.ts` (source of truth)

```ts
export type Theme = "light" | "dark";
export const THEME_STORAGE_KEY = "theme";
export const DEFAULT_THEME: Theme = "dark";

export function resolveNextTheme(current: Theme): Theme; // pure: "dark" -> "light", "light" -> "dark"
export function getActiveTheme(): Theme;                 // reads <html>.classList
export function setTheme(theme: Theme): void;            // toggles .dark on <html>, persists, dispatches "themechange"
export function toggleTheme(): Theme;                    // setTheme(resolveNextTheme(getActiveTheme()))

// Inline pre-paint script string, injected in <head> before first paint.
export const THEME_INIT_SCRIPT: string;

// Shader colors per theme (hex, consumed by shaderBackground.tsx)
export const SHADER_PALETTES: Record<Theme, { base: string; colorA: string; colorB: string }>;
```

`THEME_INIT_SCRIPT` (runs synchronously in `<head>`, before paint):

```js
(function () {
  try {
    var stored = localStorage.getItem("theme");
    var dark = stored ? stored === "dark" : true; // default dark
    document.documentElement.classList.toggle("dark", dark);
  } catch (e) {
    document.documentElement.classList.add("dark");
  }
})();
```

`setTheme` dispatches a `window` `CustomEvent("themechange", { detail: theme })` so islands
update live. Cross-tab sync (the `storage` event) is handled in the `useTheme` hook, not here.

### `src/hooks/useTheme.ts`

React hook for islands. Returns `{ theme, toggle }`. On mount reads `getActiveTheme()`,
subscribes to the `themechange` event (and the `storage` event for cross-tab sync), and
cleans up on unmount.

### `src/components/ThemeToggle.tsx`

Small React island using lucide `Sun`/`Moon`. Renders a button (with `aria-label`) that
calls `toggle()`. Shows Moon in light mode, Sun in dark mode. Placed in the header of both
`SiteLayout.astro` and `AppLayout.astro`.

### `src/components/shaderBackground.tsx` (existing, made theme-aware)

Consumes `useTheme()`, looks up `SHADER_PALETTES[theme]`, and feeds those colors into
`<SolidColor>` and `<Plasma>`. Re-renders when the theme changes.

## CSS rewire — `src/styles/global.css`

1. Keep `@import` lines, `@custom-variant dark (&:is(.dark *))`, fonts, and the existing
   custom radius scale.
2. Rewire **every semantic token** in `@theme inline` to reference the raw variable:
   `--color-background: var(--background)`, `--color-primary: var(--primary)`, … (the
   sidebar/chart tokens already do this).
3. Move the branded light palette into `:root`, and add a brand-consistent `.dark` palette.
   The `body` grid-gradient (built from `var(--color-border)` / `var(--color-background)`)
   then follows the theme automatically.

### `:root` (light — branded, carried over from today's look)

```
--background: oklch(0.985 0.004 84.6);  --foreground: oklch(0.171 0.006 285.9);
--card: oklch(1 0 0);                    --card-foreground: oklch(0.171 0.006 285.9);
--popover: oklch(1 0 0);                 --popover-foreground: oklch(0.171 0.006 285.9);
--primary: oklch(0.488 0.193 264.1);     --primary-foreground: oklch(0.985 0.004 84.6);
--secondary: oklch(0.942 0.013 84.6);    --secondary-foreground: oklch(0.171 0.006 285.9);
--muted: oklch(0.942 0.013 84.6);        --muted-foreground: oklch(0.489 0.012 285.9);
--accent: oklch(0.91 0.03 177.2);        --accent-foreground: oklch(0.171 0.006 285.9);
--destructive: oklch(0.57 0.205 29.2);   --destructive-foreground: oklch(0.985 0.004 84.6);
--border: oklch(0.884 0.016 84.6);       --input: oklch(0.884 0.016 84.6);
--ring: oklch(0.488 0.193 264.1);
--chart-1: oklch(0.488 0.193 264.1); --chart-2: oklch(0.70 0.12 177.2); --chart-3: oklch(0.60 0.16 290);
--chart-4: oklch(0.75 0.15 70);      --chart-5: oklch(0.65 0.20 20);
--sidebar: oklch(0.97 0.006 84.6); --sidebar-foreground: oklch(0.171 0.006 285.9);
--sidebar-primary: oklch(0.488 0.193 264.1); --sidebar-primary-foreground: oklch(0.985 0.004 84.6);
--sidebar-accent: oklch(0.91 0.03 177.2);    --sidebar-accent-foreground: oklch(0.171 0.006 285.9);
--sidebar-border: oklch(0.884 0.016 84.6);   --sidebar-ring: oklch(0.488 0.193 264.1);
```

### `.dark` (brand-consistent dark — target values, fine-tune visually during impl)

```
--background: oklch(0.16 0.015 280);  --foreground: oklch(0.96 0.004 84.6);
--card: oklch(0.21 0.015 280);        --card-foreground: oklch(0.96 0.004 84.6);
--popover: oklch(0.21 0.015 280);     --popover-foreground: oklch(0.96 0.004 84.6);
--primary: oklch(0.62 0.19 264.1);     --primary-foreground: oklch(0.98 0.004 84.6);
--secondary: oklch(0.27 0.015 280);    --secondary-foreground: oklch(0.96 0.004 84.6);
--muted: oklch(0.27 0.015 280);        --muted-foreground: oklch(0.71 0.02 270);
--accent: oklch(0.34 0.055 195);       --accent-foreground: oklch(0.96 0.004 84.6);
--destructive: oklch(0.65 0.20 25);    --destructive-foreground: oklch(0.98 0.004 84.6);
--border: oklch(1 0 0 / 10%);          --input: oklch(1 0 0 / 14%);
--ring: oklch(0.62 0.19 264.1);
--chart-1: oklch(0.62 0.19 264.1); --chart-2: oklch(0.72 0.12 180); --chart-3: oklch(0.65 0.18 295);
--chart-4: oklch(0.78 0.15 75);    --chart-5: oklch(0.68 0.20 25);
--sidebar: oklch(0.19 0.015 280); --sidebar-foreground: oklch(0.96 0.004 84.6);
--sidebar-primary: oklch(0.62 0.19 264.1); --sidebar-primary-foreground: oklch(0.98 0.004 84.6);
--sidebar-accent: oklch(0.27 0.015 280);   --sidebar-accent-foreground: oklch(0.96 0.004 84.6);
--sidebar-border: oklch(1 0 0 / 10%);      --sidebar-ring: oklch(0.62 0.19 264.1);
```

## Layouts

Both `SiteLayout.astro` and `AppLayout.astro`:

- `<html lang="en" class="dark">` — SSR default matches the init script's default.
- First child of `<head>`: `<script is:inline set:html={THEME_INIT_SCRIPT} />`.
- Add `<ThemeToggle client:load />` to the header nav.

## Shader background

- Render as a **fixed, full-bleed layer behind content on the homepage only**
  (`index.astro`). `SiteLayout` takes a `shader?: boolean` prop (default false); when true
  it renders the shader and applies `.site-shell` (transparent body). Only `index.astro`
  passes the prop. The auth pages (`sign-in.astro`, `sign-up.astro`) also use `SiteLayout`
  but omit the prop, so they keep the normal grid background. The app dashboard
  (`AppLayout`) likewise keeps the grid background.
  (Decision: homepage-only, confirmed by user during execution.)
- Palettes:
  - `dark`: `{ base: "#09060f", colorA: "#0073b5", colorB: "#1f0761" }` (keep the look the
    user authored).
  - `light`: `{ base: "#eef1f8", colorA: "#3b5bdb", colorB: "#7ac7c2" }` (lightened so it
    reads on a light background; brand blue + teal).

## Clerk

Configure `clerk()` in `astro.config.mjs` with a dark `appearance.variables` object
(serializable CSS-color values matching the `.dark` palette: `colorBackground`,
`colorForeground`, `colorPrimary`, `colorInput`, `colorInputForeground`, `colorMuted`,
`colorMutedForeground`, `colorBorder`, `colorRing`, `colorNeutral`, `colorDanger`). This
makes the sign-in/up pages and `UserButton` dropdown render dark to match the default.

**Why not `baseTheme: dark`?** (Discovered during verification.) `@clerk/astro@3.4.6`
ships clerk-js v6 (Core 3), but the only stable `@clerk/themes` (2.4.57) targets Core 2, so
its `dark` baseTheme object is silently ignored at runtime (and the object also doesn't
survive @clerk/astro's server→client prop boundary). The serializable `variables` approach
is version-stable and needs no `@clerk/themes` dependency.

**Trade-off (accepted for v1):** Clerk appearance is set server-side, so Clerk's own
widgets stay dark even if a user toggles to light. Everything else re-themes live.

## Testing

- **Unit (Vitest):** `resolveNextTheme` (pure) and the persistence behavior of `setTheme`
  (writes the key, toggles the class, dispatches the event). Add minimal Vitest setup to
  `www` since none exists.
- **Manual render (run skill / `astro build` + preview):**
  - First load is dark, no light flash.
  - Toggle flips light/dark and persists across reload.
  - Shader palette changes with the theme.
  - Clerk sign-in/up + `UserButton` render dark.
  - `astro build` succeeds.

## Files touched

- `www/src/lib/theme.ts` (new)
- `www/src/hooks/useTheme.ts` (new)
- `www/src/components/ThemeToggle.tsx` (new)
- `www/src/components/shaderBackground.tsx` (edit — theme-aware + placement)
- `www/src/styles/global.css` (edit — rewire tokens + branded light/dark palettes)
- `www/src/layouts/SiteLayout.astro` (edit — dark default, init script, toggle, optional `shader` prop)
- `www/src/layouts/AppLayout.astro` (edit — dark default, init script, toggle)
- `www/src/pages/index.astro` (edit — opt into the shader via `<SiteLayout shader>`)
- `www/astro.config.mjs` (edit — Clerk dark `appearance.variables`)
- `www/package.json` (add Vitest dev deps)
- `www/src/lib/theme.test.ts` (new)
