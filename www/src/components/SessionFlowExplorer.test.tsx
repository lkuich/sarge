import React from "react";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, describe, expect, it, vi } from "vitest";

import { SessionFlowExplorer } from "./SessionFlowExplorer";

(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

vi.mock("@xyflow/react", () => ({
  Background: () => null,
  BackgroundVariant: { Dots: "dots" },
  Controls: () => null,
  MarkerType: { ArrowClosed: "arrowclosed" },
  MiniMap: () => null,
  ReactFlow: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
}));

const events = [
  event("complete-page", "page.view", "complete", 0),
  event("complete-conversion", "checkout.started", "complete", 1),
  event("complete-watchdog", "meta.pixel.fire", "complete", 2),
  event("complete-custom", "discount.applied", "complete", 3),
  event("missing-custom-page", "page.view", "missing-custom", 4),
  event("missing-custom-conversion", "purchase.completed", "missing-custom", 5),
  event("missing-custom-watchdog", "google.tag.fire", "missing-custom", 6),
  event("page-only", "page.view", "page-only", 7),
];

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

describe("SessionFlowExplorer event filters", () => {
  it("defaults event category filters to selected AND filters without an All chip", () => {
    render(<SessionFlowExplorer events={events} />);

    expect(container?.textContent).toContain("1 of 3 sessions");
    expect(hasButtonNamed("All")).toBe(false);
    expect(buttonNamed("Conversion")?.getAttribute("aria-pressed")).toBe("true");
    expect(buttonNamed("Page views")?.getAttribute("aria-pressed")).toBe("true");
    expect(buttonNamed("Watchdog")?.getAttribute("aria-pressed")).toBe("true");
    expect(buttonNamed("Custom")?.getAttribute("aria-pressed")).toBe("true");
  });

  it("uses color to distinguish selected flow toggles", () => {
    render(<SessionFlowExplorer events={events} />);

    expect(buttonNamed("Session")?.className).toContain("bg-primary");
    expect(buttonNamed("Session")?.getAttribute("aria-pressed")).toBe("true");
    expect(buttonNamed("User")?.className).not.toContain("bg-primary");
    expect(buttonNamed("User")?.getAttribute("aria-pressed")).toBe("false");
    expect(buttonNamed("Conversion")?.className).toContain("bg-primary");
    expect(buttonNamed("All time")?.className).toContain("bg-primary");
    expect(buttonNamed("All time")?.getAttribute("aria-pressed")).toBe("true");
  });

  it("defaults to real traffic and can switch to impersonation test traffic", () => {
    render(<SessionFlowExplorer events={[...trafficEvents("real-flow"), ...trafficEvents("test-flow", true)]} />);

    expect(container?.textContent).toContain("1 of 1 sessions");
    expect(container?.textContent).toContain("real-flow");
    expect(container?.textContent).not.toContain("test-flow");
    expect(buttonNamed("Real traffic")?.getAttribute("aria-pressed")).toBe("true");
    expect(buttonNamed("Test traffic")?.getAttribute("aria-pressed")).toBe("false");

    act(() => {
      buttonNamed("Test traffic")?.click();
    });

    expect(container?.textContent).toContain("1 of 1 sessions");
    expect(container?.textContent).toContain("test-flow");
    expect(container?.textContent).not.toContain("real-flow");
    expect(buttonNamed("Real traffic")?.getAttribute("aria-pressed")).toBe("false");
    expect(buttonNamed("Test traffic")?.getAttribute("aria-pressed")).toBe("true");
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

function hasButtonNamed(name: string) {
  return Boolean(buttonNamed(name));
}

function buttonNamed(name: string) {
  return Array.from(container?.querySelectorAll("button") ?? []).find(
    (button) => button.textContent?.trim() === name,
  );
}

function event(id: string, name: string, sessionId: string, minute: number) {
  const occurredAt = new Date(Date.UTC(2026, 5, 20, 12, minute)).toISOString();

  return {
    id,
    name,
    occurredAt,
    receivedAt: occurredAt,
    sessionId,
    userId: `user-${sessionId}`,
    url: `https://example.com/${sessionId}`,
    properties: {},
  };
}

function trafficEvents(sessionId: string, testTraffic = false) {
  return [
    event(`${sessionId}-page`, "page.view", sessionId, 0),
    event(`${sessionId}-conversion`, "checkout.started", sessionId, 1),
    event(`${sessionId}-watchdog`, "meta.pixel.fire", sessionId, 2),
    event(`${sessionId}-custom`, "discount.applied", sessionId, 3),
  ].map((flowEvent) => ({
    ...flowEvent,
    properties: testTraffic
      ? {
          sarge_test: true,
          sarge_test_mode: "impersonation",
          sarge_tester_user_id: "tester-123",
          sarge_impersonated_user_id: sessionId,
        }
      : {},
  }));
}
