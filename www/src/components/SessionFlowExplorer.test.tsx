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
  ReactFlow: ({
    children,
    nodes = [],
    edges = [],
  }: {
    children: React.ReactNode;
    nodes?: Array<{
      id: string;
      data: { label: React.ReactNode };
      position?: { x: number; y: number };
      style?: Record<string, unknown>;
    }>;
    edges?: Array<{ id: string; style?: Record<string, unknown> }>;
  }) => (
    <div>
      {nodes.map((node) => (
        <div
          key={node.id}
          data-flow-node={node.id}
          data-flow-position={JSON.stringify(node.position ?? {})}
          data-flow-style={JSON.stringify(node.style ?? {})}
        >
          {node.data.label}
        </div>
      ))}
      {edges.map((edge) => (
        <div key={edge.id} data-flow-edge={edge.id} data-flow-style={JSON.stringify(edge.style ?? {})} />
      ))}
      {children}
    </div>
  ),
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
  it("defaults event category filters to selected without requiring every category", () => {
    render(<SessionFlowExplorer events={events} />);

    expect(container?.textContent).toContain("3 of 3 users");
    expect(hasButtonNamed("All")).toBe(false);
    expect(buttonNamed("Conversion")?.getAttribute("aria-pressed")).toBe("true");
    expect(buttonNamed("Page views")?.getAttribute("aria-pressed")).toBe("true");
    expect(buttonNamed("Watchdog")?.getAttribute("aria-pressed")).toBe("true");
    expect(buttonNamed("Custom")?.getAttribute("aria-pressed")).toBe("true");
  });

  it("uses color to distinguish selected flow toggles", () => {
    render(<SessionFlowExplorer events={events} />);

    expect(modeButtonLabels()).toEqual(["User", "Session"]);
    expect(buttonNamed("Session")?.className).not.toContain("bg-primary");
    expect(buttonNamed("Session")?.getAttribute("aria-pressed")).toBe("false");
    expect(buttonNamed("User")?.className).toContain("bg-primary");
    expect(buttonNamed("User")?.getAttribute("aria-pressed")).toBe("true");
    expect(buttonNamed("Conversion")?.className).toContain("bg-primary");
    expect(buttonNamed("All time")?.getAttribute("aria-pressed")).toBe("false");
    expect(buttonNamed("Last hour")?.className).toContain("bg-primary");
    expect(buttonNamed("Last hour")?.getAttribute("aria-pressed")).toBe("true");
  });

  it("defaults to real traffic and can switch to impersonation test traffic", () => {
    render(<SessionFlowExplorer events={[...trafficEvents("real-flow"), ...trafficEvents("test-flow", true)]} />);

    expect(container?.textContent).toContain("1 of 1 users");
    expect(container?.textContent).toContain("real-flow");
    expect(container?.textContent).not.toContain("test-flow");
    expect(buttonNamed("Real traffic")?.getAttribute("aria-pressed")).toBe("true");
    expect(buttonNamed("Test traffic")?.getAttribute("aria-pressed")).toBe("false");

    act(() => {
      buttonNamed("Test traffic")?.click();
    });

    expect(container?.textContent).toContain("1 of 1 users");
    expect(container?.textContent).toContain("test-flow");
    expect(container?.textContent).not.toContain("real-flow");
    expect(buttonNamed("Real traffic")?.getAttribute("aria-pressed")).toBe("false");
    expect(buttonNamed("Test traffic")?.getAttribute("aria-pressed")).toBe("true");
  });

  it("shows test sessions when all category chips are selected and some event categories are absent", () => {
    render(<SessionFlowExplorer events={sparseTrafficEvents("test-flow", true)} />);

    act(() => {
      buttonNamed("Test traffic")?.click();
    });

    expect(container?.textContent).toContain("1 of 1 users");
    expect(container?.textContent).toContain("test-flow");
    expect(container?.textContent).toContain("2 of 2 events");
    expect(container?.textContent).toContain("1 visible");
  });

  it("colors test traffic nodes and flow lines with the destructive chart color", () => {
    render(<SessionFlowExplorer events={sparseTrafficEvents("test-flow", true)} />);

    act(() => {
      buttonNamed("Test traffic")?.click();
    });

    expect(flowStyle('[data-flow-node="group:user-test-flow"]')).toContain("--color-destructive");
    expect(flowStyle('[data-flow-node="event:test-flow-page"]')).toContain("--color-destructive");
    expect(flowStyle('[data-flow-edge="group:user-test-flow->event:test-flow-page"]')).toContain("--color-destructive");
    expect(flowStyle('[data-flow-edge="event:test-flow-page->event:test-flow-watchdog"]')).toContain(
      "--color-destructive",
    );
  });

  it("starts a new row for each page view while keeping the flow connected", () => {
    render(
      <SessionFlowExplorer
        events={[
          event("multi-page-page-1", "page.view", "multi-page", 0),
          event("multi-page-watchdog-1", "meta.pixel.fire", "multi-page", 1),
          event("multi-page-page-2", "page.view", "multi-page", 2),
          event("multi-page-conversion-2", "checkout.started", "multi-page", 3),
        ]}
      />,
    );

    expect(flowPosition('[data-flow-node="event:multi-page-page-1"]')).toEqual({ x: 250, y: 0 });
    expect(flowPosition('[data-flow-node="event:multi-page-watchdog-1"]')).toEqual({ x: 500, y: 0 });
    expect(flowPosition('[data-flow-node="event:multi-page-page-2"]')).toEqual({ x: 250, y: 154 });
    expect(flowPosition('[data-flow-node="event:multi-page-conversion-2"]')).toEqual({ x: 500, y: 154 });
    expect(container?.querySelector('[data-flow-edge="event:multi-page-watchdog-1->event:multi-page-page-2"]')).not.toBeNull();
  });

  it("adds a user node before session nodes in session mode", () => {
    render(
      <SessionFlowExplorer
        events={[
          { ...event("session-a-page", "page.view", "session-a", 0), userId: "shared-user" },
          { ...event("session-a-watchdog", "meta.pixel.fire", "session-a", 1), userId: "shared-user" },
          { ...event("session-b-page", "page.view", "session-b", 2), userId: "shared-user" },
          { ...event("session-b-conversion", "checkout.started", "session-b", 3), userId: "shared-user" },
        ]}
      />,
    );

    act(() => {
      buttonNamed("Session")?.click();
    });

    expect(flowPosition('[data-flow-node="user:shared-user"]')).toEqual({ x: 0, y: 125 });
    expect(flowPosition('[data-flow-node="group:session-b"]')).toEqual({ x: 250, y: 0 });
    expect(flowPosition('[data-flow-node="group:session-a"]')).toEqual({ x: 250, y: 250 });
    expect(flowPosition('[data-flow-node="event:session-b-page"]')).toEqual({ x: 500, y: 0 });
    expect(container?.querySelector('[data-flow-edge="user:shared-user->group:session-b"]')).not.toBeNull();
    expect(container?.querySelector('[data-flow-edge="user:shared-user->group:session-a"]')).not.toBeNull();
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

function modeButtonLabels() {
  return Array.from(container?.querySelectorAll("button") ?? [])
    .map((button) => button.textContent?.trim())
    .filter((label) => label === "User" || label === "Session");
}

function flowStyle(selector: string) {
  return container?.querySelector<HTMLElement>(selector)?.dataset.flowStyle ?? "";
}

function flowPosition(selector: string) {
  return JSON.parse(container?.querySelector<HTMLElement>(selector)?.dataset.flowPosition ?? "{}");
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

function sparseTrafficEvents(sessionId: string, testTraffic = false) {
  return [
    event(`${sessionId}-page`, "page.view", sessionId, 0),
    event(`${sessionId}-watchdog`, "meta.pixel.fire", sessionId, 1),
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
