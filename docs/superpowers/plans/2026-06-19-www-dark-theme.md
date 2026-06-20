# WWW Dark Theme by Default — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make the `www` app render dark by default with a persistent light/dark toggle, brand-consistent palettes in both themes, a theme-aware shader background, and Clerk widgets that match the dark default.

**Architecture:** A single `src/lib/theme.ts` module owns all theming state (types, default, persistence, the pre-paint init script, and shader palettes). A `useTheme` React hook exposes it to islands; `ThemeToggle` and `shaderBackground` consume the hook. `global.css` is rewired so the `.dark` class actually drives every shadcn token. Both Astro layouts ship `class="dark"` on `<html>` plus an inline init script that applies the stored choice before first paint.

**Tech Stack:** Astro 6 (SSR, Cloudflare adapter), React 19 islands, Tailwind v4, shadcn, `shaders` (Paper Design) for the background, `@clerk/astro` + `@clerk/themes`, Vitest + jsdom for unit tests.

## Global Constraints

- Package manager for `www`: **npm** (run all installs as `cd www && npm ...`). `www` is NOT part of the root pnpm workspace.
- Node engine: `>=22.12.0` (from `www/package.json`).
- Default theme: **dark**, regardless of OS `prefers-color-scheme`.
- No `console.*` — none needed here; storage failures are swallowed silently.
- No `any` types — all new TS uses explicit types.
- Path alias: `@/*` → `www/src/*` (from `www/tsconfig.json`). Test files import relatively to avoid needing the alias in the test runner.
- All commands below assume CWD is `www/` unless noted.

---

## File Structure

- `src/lib/theme.ts` (new) — theme types, constants, pure + DOM helpers, init script string, shader palettes. Source of truth.
- `src/lib/theme.test.ts` (new) — Vitest unit tests for the pure/DOM logic.
- `vitest.config.ts` (new) — Vitest config (jsdom env).
- `src/hooks/useTheme.ts` (new) — React hook exposing theme + toggle to islands.
- `src/components/ThemeToggle.tsx` (new) — Sun/Moon toggle island.
- `src/components/shaderBackground.tsx` (modify) — make palette theme-aware.
- `src/styles/global.css` (modify) — rewire tokens to `var(--*)`, branded light/dark palettes, `.site-shell` transparent body.
- `src/layouts/SiteLayout.astro` (modify) — dark default, init script, toggle, shader background.
- `src/layouts/AppLayout.astro` (modify) — dark default, init script, toggle.
- `astro.config.mjs` (modify) — Clerk `baseTheme: dark`.
- `package.json` (modify) — add `@clerk/themes` dep, `vitest`/`jsdom` dev deps, `test` script.

---

## Task 1: Theme module + unit tests

**Files:**
- Create: `www/vitest.config.ts`
- Create: `www/src/lib/theme.ts`
- Test: `www/src/lib/theme.test.ts`
- Modify: `www/package.json` (dev deps + `test` script)

**Interfaces:**
- Consumes: nothing.
- Produces:
  - `type Theme = "light" | "dark"`
  - `const THEME_STORAGE_KEY: string` (`"theme"`)
  - `const THEME_CHANGE_EVENT: string` (`"themechange"`)
  - `const DEFAULT_THEME: Theme` (`"dark"`)
  - `function resolveNextTheme(current: Theme): Theme`
  - `function getActiveTheme(): Theme`
  - `function setTheme(theme: Theme): void`
  - `function toggleTheme(): Theme`
  - `const THEME_INIT_SCRIPT: string`
  - `interface ShaderPalette { base: string; colorA: string; colorB: string }`
  - `const SHADER_PALETTES: Record<Theme, ShaderPalette>`

- [ ] **Step 1: Install test dev deps**

Run:
```bash
cd www && npm install -D vitest jsdom
```
Expected: installs succeed; `vitest` and `jsdom` appear under `devDependencies` in `www/package.json`.

- [ ] **Step 2: Add the `test` script to `package.json`**

In `www/package.json`, add to the `"scripts"` object:
```json
"test": "vitest run"
```

- [ ] **Step 3: Create `vitest.config.ts`**

`www/vitest.config.ts`:
```ts
import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    environment: "jsdom",
  },
});
```

- [ ] **Step 4: Write the failing tests**

`www/src/lib/theme.test.ts`:
```ts
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  DEFAULT_THEME,
  THEME_CHANGE_EVENT,
  THEME_STORAGE_KEY,
  getActiveTheme,
  resolveNextTheme,
  setTheme,
  toggleTheme,
} from "./theme";

afterEach(() => {
  document.documentElement.classList.remove("dark");
  localStorage.clear();
});

describe("resolveNextTheme", () => {
  it("returns light when current is dark", () => {
    expect(resolveNextTheme("dark")).toBe("light");
  });
  it("returns dark when current is light", () => {
    expect(resolveNextTheme("light")).toBe("dark");
  });
});

describe("setTheme", () => {
  it("adds the dark class and persists when set to dark", () => {
    setTheme("dark");
    expect(document.documentElement.classList.contains("dark")).toBe(true);
    expect(localStorage.getItem(THEME_STORAGE_KEY)).toBe("dark");
  });
  it("removes the dark class and persists when set to light", () => {
    document.documentElement.classList.add("dark");
    setTheme("light");
    expect(document.documentElement.classList.contains("dark")).toBe(false);
    expect(localStorage.getItem(THEME_STORAGE_KEY)).toBe("light");
  });
  it("dispatches a themechange event carrying the new theme", () => {
    const handler = vi.fn();
    window.addEventListener(THEME_CHANGE_EVENT, handler);
    setTheme("light");
    window.removeEventListener(THEME_CHANGE_EVENT, handler);
    expect(handler).toHaveBeenCalledTimes(1);
    const event = handler.mock.calls[0][0] as CustomEvent<string>;
    expect(event.detail).toBe("light");
  });
});

describe("getActiveTheme", () => {
  it("reflects the dark class on <html>", () => {
    document.documentElement.classList.add("dark");
    expect(getActiveTheme()).toBe("dark");
    document.documentElement.classList.remove("dark");
    expect(getActiveTheme()).toBe("light");
  });
});

describe("toggleTheme", () => {
  it("flips the active theme and returns the new value", () => {
    document.documentElement.classList.add("dark");
    expect(toggleTheme()).toBe("light");
    expect(getActiveTheme()).toBe("light");
  });
});

describe("DEFAULT_THEME", () => {
  it("is dark", () => {
    expect(DEFAULT_THEME).toBe("dark");
  });
});
```

- [ ] **Step 5: Run tests to verify they fail**

Run:
```bash
cd www && npm run test
```
Expected: FAIL — cannot resolve module `./theme` (file does not exist yet).

- [ ] **Step 6: Implement `theme.ts`**

`www/src/lib/theme.ts`:
```ts
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
```

- [ ] **Step 7: Run tests to verify they pass**

Run:
```bash
cd www && npm run test
```
Expected: PASS — all tests green.

- [ ] **Step 8: Commit**

```bash
git add www/vitest.config.ts www/src/lib/theme.ts www/src/lib/theme.test.ts www/package.json www/package-lock.json
git commit -m "feat(www): add theme module with light/dark logic and tests"
```

---

## Task 2: Rewire global.css to brand-consistent light/dark palettes

**Files:**
- Modify: `www/src/styles/global.css`

**Interfaces:**
- Consumes: nothing (CSS).
- Produces: a working `.dark` class that drives every `--color-*` token; a `.site-shell` body modifier that makes the body background transparent (used by the shader layer in Task 6).

This task has no unit test — CSS is verified by a successful build (Step 4) and by the manual render in Task 6.

- [ ] **Step 1: Rewire the `@theme inline` color tokens to reference the variables**

In `www/src/styles/global.css`, replace the hardcoded color values (lines ~12–30, the `--color-background` through `--color-ring` block) with variable references. Replace this block:
```css
  --color-background: oklch(0.985 0.004 84.6);
  --color-foreground: oklch(0.171 0.006 285.9);
  --color-card: oklch(1 0 0);
  --color-card-foreground: oklch(0.171 0.006 285.9);
  --color-popover: oklch(1 0 0);
  --color-popover-foreground: oklch(0.171 0.006 285.9);
  --color-primary: oklch(0.488 0.193 264.1);
  --color-primary-foreground: oklch(0.985 0.004 84.6);
  --color-secondary: oklch(0.942 0.013 84.6);
  --color-secondary-foreground: oklch(0.171 0.006 285.9);
  --color-muted: oklch(0.942 0.013 84.6);
  --color-muted-foreground: oklch(0.489 0.012 285.9);
  --color-accent: oklch(0.91 0.03 177.2);
  --color-accent-foreground: oklch(0.171 0.006 285.9);
  --color-destructive: oklch(0.57 0.205 29.2);
  --color-destructive-foreground: oklch(0.985 0.004 84.6);
  --color-border: oklch(0.884 0.016 84.6);
  --color-input: oklch(0.884 0.016 84.6);
  --color-ring: oklch(0.488 0.193 264.1);
```
with:
```css
  --color-background: var(--background);
  --color-foreground: var(--foreground);
  --color-card: var(--card);
  --color-card-foreground: var(--card-foreground);
  --color-popover: var(--popover);
  --color-popover-foreground: var(--popover-foreground);
  --color-primary: var(--primary);
  --color-primary-foreground: var(--primary-foreground);
  --color-secondary: var(--secondary);
  --color-secondary-foreground: var(--secondary-foreground);
  --color-muted: var(--muted);
  --color-muted-foreground: var(--muted-foreground);
  --color-accent: var(--accent);
  --color-accent-foreground: var(--accent-foreground);
  --color-destructive: var(--destructive);
  --color-destructive-foreground: var(--destructive-foreground);
  --color-border: var(--border);
  --color-input: var(--input);
  --color-ring: var(--ring);
```
Leave the rest of `@theme inline` (fonts, the radius scale, sidebar/chart references) unchanged.

- [ ] **Step 2: Replace the `:root` block with the branded light palette**

Replace the entire existing `:root { ... }` block with:
```css
:root {
  --background: oklch(0.985 0.004 84.6);
  --foreground: oklch(0.171 0.006 285.9);
  --card: oklch(1 0 0);
  --card-foreground: oklch(0.171 0.006 285.9);
  --popover: oklch(1 0 0);
  --popover-foreground: oklch(0.171 0.006 285.9);
  --primary: oklch(0.488 0.193 264.1);
  --primary-foreground: oklch(0.985 0.004 84.6);
  --secondary: oklch(0.942 0.013 84.6);
  --secondary-foreground: oklch(0.171 0.006 285.9);
  --muted: oklch(0.942 0.013 84.6);
  --muted-foreground: oklch(0.489 0.012 285.9);
  --accent: oklch(0.91 0.03 177.2);
  --accent-foreground: oklch(0.171 0.006 285.9);
  --destructive: oklch(0.57 0.205 29.2);
  --destructive-foreground: oklch(0.985 0.004 84.6);
  --border: oklch(0.884 0.016 84.6);
  --input: oklch(0.884 0.016 84.6);
  --ring: oklch(0.488 0.193 264.1);
  --chart-1: oklch(0.488 0.193 264.1);
  --chart-2: oklch(0.70 0.12 177.2);
  --chart-3: oklch(0.60 0.16 290);
  --chart-4: oklch(0.75 0.15 70);
  --chart-5: oklch(0.65 0.20 20);
  --sidebar: oklch(0.97 0.006 84.6);
  --sidebar-foreground: oklch(0.171 0.006 285.9);
  --sidebar-primary: oklch(0.488 0.193 264.1);
  --sidebar-primary-foreground: oklch(0.985 0.004 84.6);
  --sidebar-accent: oklch(0.91 0.03 177.2);
  --sidebar-accent-foreground: oklch(0.171 0.006 285.9);
  --sidebar-border: oklch(0.884 0.016 84.6);
  --sidebar-ring: oklch(0.488 0.193 264.1);
}
```
(Note: `--radius` stays defined in `@theme inline`; do not add it here.)

- [ ] **Step 3: Replace the `.dark` block with the branded dark palette**

Replace the entire existing `.dark { ... }` block with:
```css
.dark {
  --background: oklch(0.16 0.015 280);
  --foreground: oklch(0.96 0.004 84.6);
  --card: oklch(0.21 0.015 280);
  --card-foreground: oklch(0.96 0.004 84.6);
  --popover: oklch(0.21 0.015 280);
  --popover-foreground: oklch(0.96 0.004 84.6);
  --primary: oklch(0.62 0.19 264.1);
  --primary-foreground: oklch(0.98 0.004 84.6);
  --secondary: oklch(0.27 0.015 280);
  --secondary-foreground: oklch(0.96 0.004 84.6);
  --muted: oklch(0.27 0.015 280);
  --muted-foreground: oklch(0.71 0.02 270);
  --accent: oklch(0.34 0.055 195);
  --accent-foreground: oklch(0.96 0.004 84.6);
  --destructive: oklch(0.65 0.20 25);
  --destructive-foreground: oklch(0.98 0.004 84.6);
  --border: oklch(1 0 0 / 10%);
  --input: oklch(1 0 0 / 14%);
  --ring: oklch(0.62 0.19 264.1);
  --chart-1: oklch(0.62 0.19 264.1);
  --chart-2: oklch(0.72 0.12 180);
  --chart-3: oklch(0.65 0.18 295);
  --chart-4: oklch(0.78 0.15 75);
  --chart-5: oklch(0.68 0.20 25);
  --sidebar: oklch(0.19 0.015 280);
  --sidebar-foreground: oklch(0.96 0.004 84.6);
  --sidebar-primary: oklch(0.62 0.19 264.1);
  --sidebar-primary-foreground: oklch(0.98 0.004 84.6);
  --sidebar-accent: oklch(0.27 0.015 280);
  --sidebar-accent-foreground: oklch(0.96 0.004 84.6);
  --sidebar-border: oklch(1 0 0 / 10%);
  --sidebar-ring: oklch(0.62 0.19 264.1);
}
```

- [ ] **Step 4: Add the `.site-shell` body modifier inside `@layer base`**

Inside the existing `@layer base { ... }` block in `global.css`, after the `body { ... }` rule, add:
```css
  body.site-shell {
    background: transparent;
  }
```
This lets the fixed shader layer (Task 6) show through on marketing pages while the app dashboard keeps the grid background.

- [ ] **Step 5: Verify the build compiles**

Run:
```bash
cd www && npm run build
```
Expected: build succeeds with no CSS errors. (The app still renders light at this point because no `.dark` class is applied to `<html>` yet — that lands in Task 6.)

- [ ] **Step 6: Commit**

```bash
git add www/src/styles/global.css
git commit -m "feat(www): wire shadcn tokens to themable vars with branded light/dark palettes"
```

---

## Task 3: useTheme hook

**Files:**
- Create: `www/src/hooks/useTheme.ts`

**Interfaces:**
- Consumes: `Theme`, `DEFAULT_THEME`, `THEME_CHANGE_EVENT`, `THEME_STORAGE_KEY`, `getActiveTheme`, `setTheme`, `toggleTheme` from `@/lib/theme`.
- Produces: `function useTheme(): { theme: Theme; toggle: () => void }`.

This hook is verified through the component render check in Task 6 (no standalone unit test — would require adding React Testing Library, which is out of scope for the approved spec).

- [ ] **Step 1: Implement the hook**

`www/src/hooks/useTheme.ts`:
```ts
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
```

- [ ] **Step 2: Verify it type-checks via build**

Run:
```bash
cd www && npm run build
```
Expected: build succeeds (the hook is not yet imported anywhere, so this only confirms it compiles).

- [ ] **Step 3: Commit**

```bash
git add www/src/hooks/useTheme.ts
git commit -m "feat(www): add useTheme hook for theme-aware islands"
```

---

## Task 4: ThemeToggle component

**Files:**
- Create: `www/src/components/ThemeToggle.tsx`

**Interfaces:**
- Consumes: `useTheme` from `@/hooks/useTheme`; `Sun`, `Moon` from `lucide-react`.
- Produces: default export `ThemeToggle` (a React component, no props).

Verified visually in Task 6.

- [ ] **Step 1: Implement the component**

Use `className` (not `class`) to match the existing `.tsx` components in `src/components/ui/`.

`www/src/components/ThemeToggle.tsx`:
```tsx
import { Moon, Sun } from "lucide-react";
import { useTheme } from "@/hooks/useTheme";

export default function ThemeToggle() {
  const { theme, toggle } = useTheme();
  const isDark = theme === "dark";

  return (
    <button
      type="button"
      onClick={toggle}
      aria-label={isDark ? "Switch to light theme" : "Switch to dark theme"}
      className="inline-flex size-9 items-center justify-center rounded-md border text-muted-foreground transition hover:bg-accent hover:text-accent-foreground"
    >
      {isDark ? <Sun className="size-4" /> : <Moon className="size-4" />}
      <span className="sr-only">Toggle theme</span>
    </button>
  );
}
```

- [ ] **Step 2: Verify it type-checks via build**

Run:
```bash
cd www && npm run build
```
Expected: build succeeds.

- [ ] **Step 3: Commit**

```bash
git add www/src/components/ThemeToggle.tsx
git commit -m "feat(www): add ThemeToggle island"
```

---

## Task 5: Make the shader background theme-aware

**Files:**
- Modify: `www/src/components/shaderBackground.tsx`

**Interfaces:**
- Consumes: `useTheme` from `@/hooks/useTheme`; `SHADER_PALETTES` from `@/lib/theme`.
- Produces: default export `ShaderEffect` (unchanged name/signature) that now renders with theme-matched colors.

- [ ] **Step 1: Replace the file contents**

`www/src/components/shaderBackground.tsx`:
```tsx
import {
  Shader,
  Pixelate,
  Plasma,
  SineWave,
  SolidColor,
} from "shaders/react";
import { SHADER_PALETTES } from "@/lib/theme";
import { useTheme } from "@/hooks/useTheme";

export default function ShaderEffect() {
  const { theme } = useTheme();
  const palette = SHADER_PALETTES[theme];

  return (
    <Shader>
      <SolidColor color={palette.base} />
      <Pixelate
        gap={{
          type: "map",
          curve: 0.35,
          source: "idmmbhthud5inxgebqc",
          channel: "alphaInverted",
          inputMax: 1,
          inputMin: 0,
          outputMax: 1,
          outputMin: 0.16,
        }}
        roundness={0.2}
        scale={74}
      >
        <Plasma
          balance={57}
          colorA={palette.colorA}
          colorB={palette.colorB}
          contrast={1.6}
          density={3.3}
          intensity={1.8}
        />
      </Pixelate>
      <SineWave
        id="idmmbhthud5inxgebqc"
        amplitude={0.1}
        angle={159}
        frequency={0.7}
        position={{ x: 0.3, y: 0.62 }}
        softness={1}
        thickness={1}
        visible={false}
      />
    </Shader>
  );
}
```

- [ ] **Step 2: Verify it type-checks via build**

Run:
```bash
cd www && npm run build
```
Expected: build succeeds.

- [ ] **Step 3: Commit**

```bash
git add www/src/components/shaderBackground.tsx
git commit -m "feat(www): drive shader palette from active theme"
```

---

## Task 6: Wire layouts — dark default, init script, toggle; homepage shader

**Files:**
- Modify: `www/src/layouts/SiteLayout.astro`
- Modify: `www/src/layouts/AppLayout.astro`
- Modify: `www/src/pages/index.astro`

**Interfaces:**
- Consumes: `THEME_INIT_SCRIPT` from `@/lib/theme`; `ThemeToggle` from `@/components/ThemeToggle`; `ShaderEffect` from `@/components/shaderBackground`; the `.dark` palette and `.site-shell` rule from Task 2.
- Produces: both layouts render dark by default with a live toggle. `SiteLayout` accepts a `shader?: boolean` prop; when true it renders the shader background and makes the body transparent. Only the **homepage** (`index.astro`) opts in — the auth pages (`sign-in.astro`, `sign-up.astro`) also use `SiteLayout` but do NOT pass the prop, so they keep the normal grid background.

This task's deliverable is the visible dark theme — verified by a manual render (controller-handled) plus build.

- [ ] **Step 1: Update `SiteLayout.astro` frontmatter imports and add the `shader` prop**

In `www/src/layouts/SiteLayout.astro`, change the import block at the top so it reads:
```astro
---
import { Show, SignInButton, SignUpButton, UserButton } from "@clerk/astro/components";
import ThemeToggle from "@/components/ThemeToggle";
import ShaderEffect from "@/components/shaderBackground";
import { THEME_INIT_SCRIPT } from "@/lib/theme";
import "../styles/global.css";

interface Props {
  title?: string;
  shader?: boolean;
}

const { title = "Sarge", shader = false } = Astro.props;
---
```

- [ ] **Step 2: Set the dark default on `<html>` and add the init script**

In `SiteLayout.astro`, change `<html lang="en">` to `<html lang="en" class="dark">`, and make the init script the FIRST child of `<head>`:
```astro
<html lang="en" class="dark">
  <head>
    <script is:inline set:html={THEME_INIT_SCRIPT} />
    <meta charset="utf-8" />
    <link rel="icon" type="image/svg+xml" href="/favicon.svg" />
    <link rel="icon" href="/favicon.ico" />
    <meta name="viewport" content="width=device-width" />
    <meta name="generator" content={Astro.generator} />
    <title>{title}</title>
  </head>
```

- [ ] **Step 3: Conditionally render the shell class + shader, and add the toggle to the nav**

In `SiteLayout.astro`, gate the `site-shell` body class and the shader layer on the `shader` prop (so only the homepage gets them), and add `<ThemeToggle />` to the nav unconditionally (the toggle should appear on every SiteLayout page). The body should read:
```astro
  <body class:list={[{ "site-shell": shader }]}>
    {shader && (
      <div class="pointer-events-none fixed inset-0 -z-10 overflow-hidden" aria-hidden="true">
        <ShaderEffect client:load />
      </div>
    )}

    <header class="mx-auto flex min-h-16 w-full max-w-6xl items-center justify-between gap-4 px-4 py-3 md:px-6">
      <a class="flex items-center gap-3 font-semibold tracking-tight" href="/" aria-label="Sarge home">
        <span class="grid size-9 place-items-center rounded-md border bg-primary text-sm font-black text-primary-foreground shadow-sm">
          S
        </span>
        <span>Sarge</span>
      </a>

      <nav class="flex items-center justify-end gap-2" aria-label="Account">
        <Show when="signed-out">
          <div class="flex items-center gap-2">
            <SignInButton mode="modal" />
            <SignUpButton mode="modal" />
          </div>
        </Show>
        <Show when="signed-in">
          <a class="rounded-md px-3 py-2 text-sm font-medium text-muted-foreground hover:bg-accent hover:text-accent-foreground" href="/app">
            Dashboard
          </a>
          <UserButton />
        </Show>
        <ThemeToggle client:load />
      </nav>
    </header>

    <main>
      <slot />
    </main>
  </body>
```

- [ ] **Step 4: Opt the homepage into the shader**

In `www/src/pages/index.astro`, change the opening layout tag to pass the `shader` prop. Change:
```astro
<SiteLayout title="Sarge">
```
to:
```astro
<SiteLayout title="Sarge" shader>
```
(Leave `sign-in.astro` and `sign-up.astro` unchanged — they keep using `<SiteLayout>` with no `shader` prop, so no shader and the normal grid background.)

- [ ] **Step 5: Update `AppLayout.astro` frontmatter imports**

In `www/src/layouts/AppLayout.astro`, add to the existing import block (keep the existing imports), so the top includes:
```astro
import { UserButton } from "@clerk/astro/components";
import { ChevronRight, Home } from "lucide-react";
import type { SargeAccount } from "@/lib/sarge-demo";
import ThemeToggle from "@/components/ThemeToggle";
import { THEME_INIT_SCRIPT } from "@/lib/theme";
import "../styles/global.css";
```

- [ ] **Step 6: Set the dark default + init script on `AppLayout`**

In `AppLayout.astro`, change `<html lang="en">` to `<html lang="en" class="dark">` and add the init script as the first child of `<head>`:
```astro
<html lang="en" class="dark">
  <head>
    <script is:inline set:html={THEME_INIT_SCRIPT} />
    <meta charset="utf-8" />
    <link rel="icon" type="image/svg+xml" href="/favicon.svg" />
    <link rel="icon" href="/favicon.ico" />
    <meta name="viewport" content="width=device-width" />
    <meta name="generator" content={Astro.generator} />
    <title>{title}</title>
  </head>
```

- [ ] **Step 7: Add the toggle to the `AppLayout` header**

In `AppLayout.astro`, in the header's right-side `<div class="flex items-center gap-3">`, add `<ThemeToggle />` before `<UserButton />`:
```astro
            <div class="flex items-center gap-3">
              <span class="hidden rounded-full border bg-card px-3 py-1 text-xs font-medium text-muted-foreground sm:inline-flex">
                {account.role}
              </span>
              <ThemeToggle client:load />
              <UserButton />
            </div>
```

- [ ] **Step 8: Build**

Run:
```bash
cd www && npm run build
```
Expected: build succeeds.

- [ ] **Step 9: Manual render check (controller-handled)**

The interactive visual verification is done by the controller (not this implementer), via a dev server / browser. The intended outcome to confirm later:
- The landing page (`/`) loads **dark** with no light flash, and the shader background is visible behind the content.
- The toggle flips light/dark; the shader palette changes with it; the choice persists across reload.
- The auth pages (`/sign-in`, `/sign-up`) load dark with the **grid** background and **no shader**.
- A dashboard route (e.g. `/app`) loads dark with the grid background (no shader) and the toggle works there too.

The implementer should run `npm run build` (Step 8) and stop there; do not start a dev server.

- [ ] **Step 10: Commit**

```bash
git add www/src/layouts/SiteLayout.astro www/src/layouts/AppLayout.astro www/src/pages/index.astro
git commit -m "feat(www): default to dark theme with init script, toggle, and homepage shader"
```

---

## Task 7: Clerk dark theme

**Files:**
- Modify: `www/astro.config.mjs`

> **Revised during verification.** The original plan used `clerk({ appearance: { baseTheme: dark } })` with `@clerk/themes`. Visual verification found Clerk still rendered light: `@clerk/astro@3.4.6` ships clerk-js v6 (Core 3), but the only stable `@clerk/themes` (2.4.57) targets Core 2, so its `dark` baseTheme is silently ignored (and the object doesn't survive @clerk/astro's server→client prop serialization). Replaced with a serializable `appearance.variables` dark palette; `@clerk/themes` is not used.

**Interfaces:**
- Consumes: the `clerk()` integration's `appearance` option.
- Produces: Clerk-rendered UI (sign-in/up pages, `UserButton`) renders dark.

- [ ] **Step 1: Configure the Clerk integration with dark `appearance.variables`**

In `www/astro.config.mjs`, define a serializable dark appearance (CSS colors matching the `.dark` palette) and pass it to `clerk()`. Do NOT import `@clerk/themes`. Core 3 variable keys: `colorBackground`, `colorForeground`, `colorPrimary`, `colorPrimaryForeground`, `colorInput`, `colorInputForeground`, `colorMuted`, `colorMutedForeground`, `colorBorder`, `colorRing`, `colorNeutral` (white, for correct dark-mode neutral derivation), `colorDanger`:
```js
const clerkDarkAppearance = {
  variables: {
    colorBackground: '#1b1a23',
    colorForeground: '#f4f3f1',
    colorPrimary: '#5571f0',
    colorPrimaryForeground: '#fafafa',
    colorInput: '#26252f',
    colorInputForeground: '#f4f3f1',
    colorMuted: '#26252f',
    colorMutedForeground: '#a7a6b3',
    colorBorder: 'rgba(255, 255, 255, 0.12)',
    colorRing: '#5571f0',
    colorNeutral: '#ffffff',
    colorDanger: '#e5484d',
  },
};
// integrations: [clerk({ appearance: clerkDarkAppearance }), react()]
```

- [ ] **Step 2: Build**

Run:
```bash
cd www && npm run build
```
Expected: build succeeds.

- [ ] **Step 3: Render check for Clerk (controller-handled)**

Open `/sign-in` and `/sign-up`; confirm the Clerk forms render dark (dark card, light text, dark inputs, brand-blue primary button). Signed in, the `UserButton` dropdown uses the same global appearance.

- [ ] **Step 4: Commit**

```bash
git add www/astro.config.mjs www/package.json www/package-lock.json
git commit -m "feat(www): render Clerk widgets dark via appearance variables"
```

---

## Final Verification

- [ ] **Run the unit suite**

```bash
cd www && npm run test
```
Expected: all theme tests PASS.

- [ ] **Production build**

```bash
cd www && npm run build
```
Expected: succeeds.

- [ ] **Full manual pass** (re-run the checks from Task 6 Step 8 and Task 7 Step 4 together): dark default, no flash, toggle + persistence, shader on SiteLayout only, Clerk dark.

---

## Self-Review Notes (author)

- **Spec coverage:** §CSS rewire → Task 2; §default-dark + flash-free init → Tasks 1 (`THEME_INIT_SCRIPT`) + 6; §toggle → Tasks 1/3/4/6; §theme-aware shader → Tasks 1 (`SHADER_PALETTES`) + 5 + 6 (placement); §Clerk → Task 7; §testing → Task 1 unit tests + Task 6/7 manual render. All covered.
- **Type consistency:** `Theme`, `getActiveTheme`, `setTheme`, `toggleTheme`, `resolveNextTheme`, `THEME_INIT_SCRIPT`, `SHADER_PALETTES`, `ShaderPalette` names are identical across theme.ts, the test, the hook, and the shader. `useTheme` returns `{ theme, toggle }`, consumed exactly that way in ThemeToggle.
- **Known follow-up (accepted in spec):** Clerk's `baseTheme` is server-set, so its own widgets stay dark even if a user toggles to light. Documented as a v1 trade-off.
