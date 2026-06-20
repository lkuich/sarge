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
