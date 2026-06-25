import { describe, expect, it } from "vitest";
import {
  buildNotificationFingerprint,
  getDefaultEmailEnabled,
  mergeNotificationPreferences,
  notificationCategories,
  sendNotificationWithDedupe,
  type NotificationDeliveryRepository,
} from "./notifications";

describe("notification preferences", () => {
  it("defaults admins into operational alerts while shared users opt in", () => {
    expect(getDefaultEmailEnabled("tracking_stopped", "admin")).toBe(true);
    expect(getDefaultEmailEnabled("page_health_failure", "user")).toBe(false);
    expect(getDefaultEmailEnabled("collaboration_access", "user")).toBe(true);
    expect(notificationCategories.some((category) => category.id === "usage_limit_risk")).toBe(true);
  });

  it("merges persisted rows over defaults", () => {
    const preferences = mergeNotificationPreferences("admin", [
      { category: "page_health_failure", emailEnabled: false },
    ]);

    expect(preferences.find((preference) => preference.category.id === "page_health_failure")?.emailEnabled).toBe(false);
    expect(preferences.find((preference) => preference.category.id === "tracking_stopped")?.emailEnabled).toBe(true);
  });

  it("builds stable dedupe fingerprints", () => {
    expect(
      buildNotificationFingerprint({
        category: "usage_limit_risk",
        workspaceId: "wrk_1",
        resourceId: "events",
        severity: "95",
      }),
    ).toBe("usage_limit_risk:wrk_1:events:95");
  });

  it("sends once per fingerprint and records skipped duplicates", async () => {
    const sentMessages: unknown[] = [];
    const seen = new Set<string>();
    const repository: NotificationDeliveryRepository = {
      async hasDelivery(input) {
        return seen.has(input.fingerprint);
      },
      async recordDelivery(input) {
        seen.add(input.fingerprint);
      },
    };
    const emailSender = {
      async send(message: unknown) {
        sentMessages.push(message);
      },
    };

    const first = await sendNotificationWithDedupe({
      repository,
      emailSender,
      emailFrom: "alerts@sargetrack.app",
      workspaceId: "wrk_1",
      recipientEmail: "admin@example.com",
      category: "usage_limit_risk",
      fingerprint: "usage_limit_risk:wrk_1:events:95",
      subject: "Usage limit warning",
      text: "You are close to your event limit.",
      html: "<p>You are close to your event limit.</p>",
    });
    const second = await sendNotificationWithDedupe({
      repository,
      emailSender,
      emailFrom: "alerts@sargetrack.app",
      workspaceId: "wrk_1",
      recipientEmail: "admin@example.com",
      category: "usage_limit_risk",
      fingerprint: "usage_limit_risk:wrk_1:events:95",
      subject: "Usage limit warning",
      text: "You are close to your event limit.",
      html: "<p>You are close to your event limit.</p>",
    });

    expect(first.sent).toBe(true);
    expect(second.sent).toBe(false);
    expect(second.skipped).toBe("duplicate");
    expect(sentMessages).toHaveLength(1);
  });
});
