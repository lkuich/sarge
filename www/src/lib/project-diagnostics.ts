import type { SargeEvent } from "./sarge-demo";

export type DiagnosticSeverity = "critical" | "warning" | "info";

export interface ProjectDiagnostic {
  id: string;
  title: string;
  severity: DiagnosticSeverity;
  summary: string;
  evidence: string[];
  recommendation: string;
  agentPrompt: string;
}

const trackingPlan = new Map<string, string[]>([
  ["product.viewed", ["product_id"]],
  ["cart.added", ["product_id", "price"]],
  ["checkout.started", ["value", "currency"]],
  ["purchase.completed", ["order_id", "value", "currency"]],
]);

export const analyzeProjectEvents = (events: SargeEvent[]): ProjectDiagnostic[] => {
  const diagnosticEvents = events.filter((event) => !isSargeTestTraffic(event));
  if (diagnosticEvents.length === 0) return [];

  const findings: ProjectDiagnostic[] = [];
  const checkouts = diagnosticEvents.filter((event) => event.name === "checkout.started");
  const purchases = diagnosticEvents.filter((event) => event.name === "purchase.completed");
  const purchaseSessions = new Set(purchases.map((event) => event.sessionId));
  const missingPurchaseSessions = unique(
    checkouts
      .filter((event) => !purchaseSessions.has(event.sessionId))
      .map((event) => event.sessionId),
  );

  if (missingPurchaseSessions.length > 0) {
    findings.push({
      id: "checkout-without-purchase",
      title: "Checkout starts without purchase",
      severity: "critical",
      summary: "Some sessions start checkout but never emit `purchase.completed`.",
      evidence: missingPurchaseSessions
        .slice(0, 4)
        .map((sessionId) => `Session ${sessionId} started checkout with no purchase event.`),
      recommendation: "Emit `purchase.completed` only after payment succeeds, with order ID, value, and currency.",
      agentPrompt:
        "Inspect the checkout success flow and add a Sarge `purchase.completed` event after payment confirmation. Include `order_id`, `value`, and `currency`.",
    });
  }

  const duplicateOrders = findDuplicateOrderIds(purchases);
  if (duplicateOrders.length > 0) {
    findings.push({
      id: "duplicate-purchase-order",
      title: "Duplicate purchase events",
      severity: "critical",
      summary: "A completed order appears more than once in the event stream.",
      evidence: duplicateOrders
        .slice(0, 4)
        .map(({ orderId, count }) => `Order ${orderId} appeared ${count} times.`),
      recommendation: "Make purchase tracking idempotent per order so reloads or retries cannot resend it.",
      agentPrompt:
        "Find every Sarge `purchase.completed` emitter. Make the send idempotent per `order_id` and prevent duplicate sends during reload, hydration, or retry paths.",
    });
  }

  const metaPurchases = diagnosticEvents.filter(
    (event) =>
      event.name === "meta.pixel.fire" &&
      readStringProperty(event.properties, "event_name")?.toLowerCase() === "purchase",
  );
  const metaPurchaseSessions = new Set(metaPurchases.map((event) => event.sessionId));

  if (metaPurchases.length > 0 && purchases.length === 0) {
    findings.push({
      id: "meta-purchase-without-sarge-purchase",
      title: "Meta Purchase is not mirrored",
      severity: "warning",
      summary: "The watchdog observed Meta Purchase calls, but Sarge has no matching purchase events.",
      evidence: metaPurchases
        .slice(0, 4)
        .map((event) => appendImplementationNote(`Meta Purchase observed in session ${event.sessionId}.`, event)),
      recommendation: "Mirror Meta Purchase into Sarge so debugging data has the same conversion boundary.",
      agentPrompt: appendImplementationNotesToPrompt(
        "Locate Meta `fbq('track', 'Purchase', ...)` calls and add an adjacent Sarge `purchase.completed` event with order ID, value, and currency.",
        metaPurchases,
      ),
    });
  }

  const purchasesMissingMeta = unique(
    purchases
      .filter((event) => !metaPurchaseSessions.has(event.sessionId))
      .map((event) => event.sessionId),
  );
  if (purchases.length > 0 && purchasesMissingMeta.length === purchases.length) {
    findings.push({
      id: "sarge-purchase-without-meta-purchase",
      title: "Meta Purchase was not observed",
      severity: "warning",
      summary: "Sarge received purchases, but the watchdog did not see Meta Purchase fire in those sessions.",
      evidence: purchasesMissingMeta
        .slice(0, 4)
        .map((sessionId) => `Sarge purchase recorded in session ${sessionId}.`),
      recommendation: "Check whether Meta is blocked, delayed by consent, or firing before Sarge loads.",
      agentPrompt:
        "Inspect the purchase confirmation page. Verify Meta `fbq('track', 'Purchase', ...)` fires after consent and that Sarge loads early enough to observe it.",
    });
  }

  const missingProperties = findMissingRequiredProperties(diagnosticEvents);
  if (missingProperties.length > 0) {
    findings.push({
      id: "missing-required-properties",
      title: "Tracking plan fields are missing",
      severity: "warning",
      summary: "Some ecommerce events are arriving without the fields needed for useful debugging.",
      evidence: missingProperties.slice(0, 6),
      recommendation: "Update event emitters so required properties are present before sending.",
      agentPrompt:
        "Audit Sarge event emitters against the ecommerce tracking plan. Add missing required properties without renaming existing event names.",
    });
  }

  if (!diagnosticEvents.some((event) => event.name === "page.view")) {
    findings.push({
      id: "missing-page-view-events",
      title: "No page views detected",
      severity: "info",
      summary: "No `page.view` events are present in this sample.",
      evidence: ["The current event sample contains zero `page.view` events."],
      recommendation: "Emit `page.view` on initial load and after client-side route changes.",
      agentPrompt:
        "Find the app router or root layout and emit Sarge `page.view` on first render plus every client-side route transition.",
    });
  }

  return findings;
};

const isSargeTestTraffic = (event: SargeEvent) => event.properties.sarge_test === true;

const appendImplementationNote = (message: string, event: SargeEvent) => {
  const note = readImplementationNote(event);
  return note ? `${message} Implementation note: ${note}` : message;
};

const appendImplementationNotesToPrompt = (prompt: string, events: SargeEvent[]) => {
  const notes = unique(events.map(readImplementationNote).filter((note): note is string => Boolean(note)));
  if (notes.length === 0) return prompt;
  return `${prompt}\n\nImplementation notes from Sarge watchdog events:\n${notes.map((note) => `- ${note}`).join("\n")}`;
};

const readImplementationNote = (event: SargeEvent) => {
  const implementation = event.properties.implementation;
  if (!implementation || typeof implementation !== "object" || Array.isArray(implementation)) return undefined;
  const note = (implementation as Record<string, unknown>).note;
  return typeof note === "string" && note.trim() ? note.trim() : undefined;
};

const findDuplicateOrderIds = (events: SargeEvent[]) => {
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

const findMissingRequiredProperties = (events: SargeEvent[]) => {
  const missing: string[] = [];

  for (const event of events) {
    const requiredProperties = trackingPlan.get(event.name);
    if (!requiredProperties) continue;

    for (const property of requiredProperties) {
      if (!hasProperty(event.properties, property)) {
        missing.push(`${event.name} missing ${property} in session ${event.sessionId}.`);
      }
    }
  }

  return missing;
};

const hasProperty = (properties: Record<string, unknown>, key: string) => {
  if (!(key in properties)) return false;
  const value = properties[key];
  return value !== undefined && value !== null && value !== "";
};

const readStringProperty = (properties: Record<string, unknown>, key: string) => {
  const value = properties[key];
  return typeof value === "string" && value.trim() ? value.trim() : undefined;
};

const unique = <T>(values: T[]) => Array.from(new Set(values));
