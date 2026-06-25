import { describe, expect, it } from "vitest";
import { planEventLimits } from "@sarge/core";
import { buildPlanLimitSqlCase, canUseFeature, formatPlanLimit, getPlanDefinition, planDefinitions } from "./pricing";

describe("pricing plan definitions", () => {
  it("defines the public Sarge plan ladder", () => {
    expect(planDefinitions.map((plan) => plan.id)).toEqual(["free", "starter", "growth", "scale", "enterprise"]);
    expect(getPlanDefinition("starter")).toMatchObject({
      id: "starter",
      name: "Starter",
      monthlyPriceUsd: 49,
      limits: {
        projects: 3,
        eventsPerMonth: 250_000,
        retentionDays: 30,
        serverSecrets: 1,
        postbackTokens: 1,
        webhooks: 3,
      },
    });
    expect(getPlanDefinition("growth")).toMatchObject({
      monthlyPriceUsd: 149,
      limits: {
        projects: 10,
        eventsPerMonth: 2_000_000,
        retentionDays: 90,
      },
      features: expect.arrayContaining(["aiReview", "exports", "configurableAttributionWindow", "editSharing"]),
    });
    expect(getPlanDefinition("scale")).toMatchObject({
      monthlyPriceUsd: 399,
      limits: {
        projects: 25,
        eventsPerMonth: 10_000_000,
        retentionDays: 180,
      },
      features: expect.arrayContaining(["clientWorkspaces", "scheduledAiAudits", "apiExport"]),
    });
  });

  it("keeps core installation and basic attribution available on Free", () => {
    expect(canUseFeature("free", "installPixel")).toBe(true);
    expect(canUseFeature("free", "debugStream")).toBe(true);
    expect(canUseFeature("free", "publicVerify")).toBe(true);
    expect(canUseFeature("free", "basicAffiliateAttribution")).toBe(true);
    expect(canUseFeature("free", "aiReview")).toBe(false);
    expect(canUseFeature("free", "webhooks")).toBe(false);
  });

  it("formats finite and unlimited limits for UI copy", () => {
    expect(formatPlanLimit(50_000, "events")).toBe("50,000 events");
    expect(formatPlanLimit(null, "webhooks")).toBe("Unlimited webhooks");
  });

  it("keeps UI event limits synchronized with runtime ingestion limits", () => {
    expect(Object.fromEntries(planDefinitions.map((plan) => [plan.id, plan.limits.eventsPerMonth]))).toEqual(planEventLimits);
  });

  it("builds SQL limit cases from plan definitions", () => {
    expect(buildPlanLimitSqlCase("projects", 'w."planId"')).toContain("WHEN 'free' THEN 1");
    expect(buildPlanLimitSqlCase("webhooks", 'w."planId"')).toContain("WHEN 'starter' THEN 3");
    expect(buildPlanLimitSqlCase("webhooks", 'w."planId"')).toContain("WHEN 'scale' THEN NULL");
  });
});
