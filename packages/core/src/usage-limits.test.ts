import { describe, expect, it } from "vitest";
import {
  UsageLimitExceededError,
  buildPlanEventLimitSqlCase,
  evaluateWorkspaceEventUsage,
  getPlanEventLimit,
} from "./usage-limits.js";

describe("workspace usage limits", () => {
  it("allows an event below the monthly plan limit", () => {
    const decision = evaluateWorkspaceEventUsage(
      {
        planId: "free",
        currentPeriodStart: new Date("2026-06-01T00:00:00.000Z"),
        currentPeriodEventCount: 49_999,
      },
      new Date("2026-06-15T00:00:00.000Z"),
    );

    expect(decision).toEqual({
      allowed: true,
      periodStart: new Date("2026-06-01T00:00:00.000Z"),
      eventCount: 50_000,
    });
  });

  it("blocks an event at the monthly plan limit", () => {
    const decision = evaluateWorkspaceEventUsage(
      {
        planId: "free",
        currentPeriodStart: new Date("2026-06-01T00:00:00.000Z"),
        currentPeriodEventCount: 50_000,
      },
      new Date("2026-06-15T00:00:00.000Z"),
    );

    expect(decision).toEqual({
      allowed: false,
      periodStart: new Date("2026-06-01T00:00:00.000Z"),
      eventCount: 50_000,
    });
  });

  it("resets usage when the monthly period has elapsed", () => {
    const now = new Date("2026-07-02T00:00:00.000Z");
    const decision = evaluateWorkspaceEventUsage(
      {
        planId: "free",
        currentPeriodStart: new Date("2026-06-01T00:00:00.000Z"),
        currentPeriodEventCount: 50_000,
      },
      now,
    );

    expect(decision).toEqual({
      allowed: true,
      periodStart: now,
      eventCount: 1,
    });
  });

  it("maps scale to an unlimited event plan", () => {
    expect(getPlanEventLimit("scale")).toBeNull();
    expect(new UsageLimitExceededError()).toBeInstanceOf(Error);
  });

  it("builds SQL plan limit cases from the shared runtime limits", () => {
    expect(buildPlanEventLimitSqlCase('w."planId"')).toContain("WHEN 'free' THEN 50000");
    expect(buildPlanEventLimitSqlCase('w."planId"')).toContain("WHEN 'scale' THEN NULL");
    expect(buildPlanEventLimitSqlCase('w."planId"')).not.toContain("enterprise");
  });
});
