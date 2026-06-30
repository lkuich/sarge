export type DiagnosticSeverity = "critical" | "warning" | "info";

export interface DiagnosticEvent {
  name: string;
  occurredAt: string;
  sessionId: string;
  userId: string;
  properties?: Record<string, unknown>;
  url?: string | null;
  title?: string | null;
}

export interface DiagnosticFinding {
  id: string;
  title: string;
  severity: DiagnosticSeverity;
  summary: string;
  evidence: string[];
  recommendation: string;
  agentPrompt: string;
}

export interface TrackingPlanEvent {
  name: string;
  requiredProperties?: string[];
}

export interface TrackingPlan {
  events: TrackingPlanEvent[];
}

export const ecommerceTrackingPlan: TrackingPlan = {
  events: [
    { name: "page.view" },
    { name: "product.viewed", requiredProperties: ["product_id"] },
    { name: "cart.added", requiredProperties: ["product_id", "price"] },
    { name: "checkout.started", requiredProperties: ["value", "currency"] },
    { name: "purchase.completed", requiredProperties: ["order_id", "value", "currency"] }
  ]
};

export const analyzeEvents = (
  events: DiagnosticEvent[],
  plan: TrackingPlan = ecommerceTrackingPlan
): DiagnosticFinding[] => {
  const diagnosticEvents = events.filter((event) => !isSargeTestTraffic(event));
  if (diagnosticEvents.length === 0) return [];

  const findings: DiagnosticFinding[] = [];
  const eventsByName = new Map<string, DiagnosticEvent[]>();

  for (const event of diagnosticEvents) {
    const eventList = eventsByName.get(event.name) ?? [];
    eventList.push(event);
    eventsByName.set(event.name, eventList);
  }

  const checkouts = eventsByName.get("checkout.started") ?? [];
  const purchases = eventsByName.get("purchase.completed") ?? [];
  const purchaseSessions = new Set(purchases.map((event) => event.sessionId));
  const checkoutSessionsWithoutPurchase = unique(
    checkouts
      .filter((event) => !purchaseSessions.has(event.sessionId))
      .map((event) => event.sessionId)
  );

  if (checkoutSessionsWithoutPurchase.length > 0) {
    findings.push(
      createFinding({
        id: "checkout-without-purchase",
        title: "Checkout starts without completed purchase events",
        severity: "critical",
        summary:
          "Recent data includes checkout sessions that never emitted `purchase.completed`.",
        evidence: checkoutSessionsWithoutPurchase
          .slice(0, 5)
          .map((sessionId) => `Session ${sessionId} started checkout with no purchase event.`),
        recommendation:
          "Confirm the order confirmation route emits `purchase.completed` after payment succeeds.",
        agentPrompt:
          "Inspect the checkout success flow and add a Sarge `purchase.completed` event after payment confirmation. Include `order_id`, `value`, and `currency`."
      })
    );
  }

  const duplicateOrderIds = findDuplicateOrderIds(purchases);
  if (duplicateOrderIds.length > 0) {
    findings.push(
      createFinding({
        id: "duplicate-purchase-order",
        title: "Duplicate purchase events detected",
        severity: "critical",
        summary:
          "At least one order ID appears in more than one `purchase.completed` event.",
        evidence: duplicateOrderIds
          .slice(0, 5)
          .map(({ orderId, count }) => `Order ${orderId} appeared ${count} times.`),
        recommendation:
          "Deduplicate the purchase emitter and make sure reloads or client retries cannot resend the same order.",
        agentPrompt:
          "Find every call site that emits Sarge `purchase.completed`. Make it idempotent per order ID and prevent duplicate sends on reload, hydration, or retry paths."
      })
    );
  }

  const metaPurchases = (eventsByName.get("meta.pixel.fire") ?? []).filter(isMetaPurchase);
  const metaPurchaseSessions = new Set(metaPurchases.map((event) => event.sessionId));

  if (metaPurchases.length > 0 && purchases.length === 0) {
    findings.push(
      createFinding({
        id: "meta-purchase-without-sarge-purchase",
        title: "Meta Purchase fires without Sarge purchase",
        severity: "warning",
        summary:
          "The watchdog observed Meta Purchase calls, but Sarge did not receive matching `purchase.completed` events.",
        evidence: metaPurchases
          .slice(0, 5)
          .map((event) =>
            appendImplementationNote(`Meta Purchase observed in session ${event.sessionId}.`, event)
          ),
        recommendation:
          "Mirror the purchase event into Sarge wherever the Meta Purchase pixel is triggered.",
        agentPrompt: appendImplementationNotesToPrompt(
          "Locate Meta `fbq('track', 'Purchase', ...)` calls and add an adjacent Sarge `purchase.completed` event with order ID, value, and currency.",
          metaPurchases
        )
      })
    );
  }

  const purchaseSessionsWithoutMeta = unique(
    purchases
      .filter((event) => !metaPurchaseSessions.has(event.sessionId))
      .map((event) => event.sessionId)
  );

  if (purchases.length > 0 && purchaseSessionsWithoutMeta.length === purchases.length) {
    findings.push(
      createFinding({
        id: "sarge-purchase-without-meta-purchase",
        title: "Sarge purchases have no observed Meta Purchase",
        severity: "warning",
        summary:
          "Sarge received purchase events, but the watchdog did not observe Meta Purchase calls in those sessions.",
        evidence: purchaseSessionsWithoutMeta
          .slice(0, 5)
          .map((sessionId) => `Sarge purchase recorded in session ${sessionId}.`),
        recommendation:
          "Confirm Sarge loads before Meta fires and check whether Meta Purchase is missing or blocked.",
        agentPrompt:
          "Inspect the purchase confirmation page. Verify that Meta `fbq('track', 'Purchase', ...)` fires after consent and that Sarge loads early enough to observe it."
      })
    );
  }

  const missingRequiredProperties = findMissingRequiredProperties(diagnosticEvents, plan);
  if (missingRequiredProperties.length > 0) {
    findings.push(
      createFinding({
        id: "missing-required-properties",
        title: "Tracking plan properties are missing",
        severity: "warning",
        summary:
          "Some expected ecommerce events are arriving without required properties.",
        evidence: missingRequiredProperties.slice(0, 8),
        recommendation:
          "Update event emitters so required properties are included consistently before events are sent.",
        agentPrompt:
          "Audit Sarge event emitters against the ecommerce tracking plan. Add missing required properties without renaming existing event names."
      })
    );
  }

  if (!eventsByName.has("page.view")) {
    findings.push(
      createFinding({
        id: "missing-page-view-events",
        title: "No page view events in this sample",
        severity: "info",
        summary:
          "No `page.view` events were found. In SPAs this usually means route changes are not wired into Sarge.",
        evidence: ["The current event sample contains zero `page.view` events."],
        recommendation:
          "Emit `page.view` on initial load and after client-side route changes.",
        agentPrompt:
          "Find the app router or root layout and emit Sarge `page.view` on first render plus every client-side route transition."
      })
    );
  }

  return findings;
};

export const isSargeTestTraffic = (event: DiagnosticEvent) =>
  event.properties?.sarge_test === true;

const createFinding = (finding: DiagnosticFinding): DiagnosticFinding => finding;

const appendImplementationNote = (message: string, event: DiagnosticEvent) => {
  const note = readImplementationNote(event);
  return note ? `${message} Implementation note: ${note}` : message;
};

const appendImplementationNotesToPrompt = (prompt: string, events: DiagnosticEvent[]) => {
  const notes = unique(events.map(readImplementationNote).filter((note): note is string => Boolean(note)));
  if (notes.length === 0) return prompt;
  return `${prompt}\n\nImplementation notes from Sarge watchdog events:\n${notes.map((note) => `- ${note}`).join("\n")}`;
};

const readImplementationNote = (event: DiagnosticEvent) => {
  const implementation = event.properties?.implementation;
  if (!implementation || typeof implementation !== "object" || Array.isArray(implementation)) return undefined;
  const note = (implementation as Record<string, unknown>).note;
  return typeof note === "string" && note.trim() ? note.trim() : undefined;
};

const findDuplicateOrderIds = (events: DiagnosticEvent[]) => {
  const counts = new Map<string, number>();

  for (const event of events) {
    const orderId = readStringProperty(event.properties, "order_id");
    if (!orderId) continue;
    counts.set(orderId, (counts.get(orderId) ?? 0) + 1);
  }

  return Array.from(counts.entries())
    .filter(([, count]) => count > 1)
    .map(([orderId, count]) => ({ orderId, count }));
};

const findMissingRequiredProperties = (events: DiagnosticEvent[], plan: TrackingPlan) => {
  const requirements = new Map(
    plan.events
      .filter((event) => event.requiredProperties && event.requiredProperties.length > 0)
      .map((event) => [event.name, event.requiredProperties ?? []])
  );
  const missing: string[] = [];

  for (const event of events) {
    const requiredProperties = requirements.get(event.name);
    if (!requiredProperties) continue;

    for (const property of requiredProperties) {
      if (!hasProperty(event.properties, property)) {
        missing.push(
          `${event.name} missing ${property} in session ${event.sessionId}.`
        );
      }
    }
  }

  return missing;
};

const isMetaPurchase = (event: DiagnosticEvent) => {
  const eventName = readStringProperty(event.properties, "event_name");
  return normalizeName(eventName) === "purchase";
};

const hasProperty = (properties: Record<string, unknown> | undefined, key: string) => {
  if (!properties || !(key in properties)) return false;
  const value = properties[key];
  return value !== undefined && value !== null && value !== "";
};

const readStringProperty = (
  properties: Record<string, unknown> | undefined,
  key: string
) => {
  const value = properties?.[key];
  return typeof value === "string" && value.trim() ? value.trim() : undefined;
};

const normalizeName = (value: string | undefined) =>
  value?.trim().toLowerCase().replace(/[\s_-]+/g, ".") ?? "";

const unique = <T>(values: T[]) => Array.from(new Set(values));
