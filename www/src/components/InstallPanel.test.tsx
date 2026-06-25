import React from "react";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, describe, expect, it } from "vitest";

import InstallPanel from "./InstallPanel";

(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

let root: Root | null = null;
let container: HTMLDivElement | null = null;

afterEach(() => {
  if (root) {
    act(() => root?.unmount());
  }
  root = null;
  container?.remove();
  container = null;
});

describe("InstallPanel", () => {
  it("shows one Claude setup prompt copy action without an agent dropdown", () => {
    render(<InstallPanel prompt="Install Sarge with this prompt." />);

    const buttons = Array.from(container?.querySelectorAll("button") ?? []);
    const primaryButton = buttons.find((button) => button.textContent?.trim() === "Copy setup prompt");

    expect(primaryButton).toBeTruthy();
    expect(buttons.some((button) => button.getAttribute("aria-label") === "Choose your coding agent")).toBe(false);
    expect(container?.textContent).not.toContain("Open in Claude Code");
    expect(container?.textContent).not.toContain("Codex");
    expect(container?.textContent).not.toContain("Cursor");
    expect(primaryButton?.className).toContain("rounded-none");
    expect(primaryButton?.className).not.toContain("rounded-md");
    expect(primaryButton?.querySelector<HTMLElement>("[data-claude-icon]")?.style.maskImage).toContain("/claude.svg");
  });
});

function render(ui: React.ReactNode) {
  container = document.createElement("div");
  document.body.append(container);
  root = createRoot(container);

  act(() => {
    root?.render(ui);
  });
}
