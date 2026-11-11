import { describe, expect, it } from "vitest";
import { buildSargeTrackingDomain, eventMatchesConfiguredHost, normalizeSiteDomain, resolveTrackedSiteDomain } from "./sarge-demo";

describe("project site domains", () => {
  it.each([
    ["sarge.storypane.dev", "storypane.dev"],
    ["thebotoxcourse.com", "thebotoxcourse.com"],
    ["sarge.shop.example.com", "shop.example.com"],
    ["https://WWW.SARGE.Example.COM/path", "example.com"],
    ["sargetrack.app", "sargetrack.app"],
  ])("displays the tracked website for %s", (configuredDomain, siteDomain) => {
    expect(resolveTrackedSiteDomain(configuredDomain)).toBe(siteDomain);
  });

  it("normalizes the tracked site domain entered during project setup", () => {
    expect(normalizeSiteDomain(" HTTPS://WWW.Example.COM/products?utm=abc ")).toBe("example.com");
    expect(normalizeSiteDomain("shop.example.com")).toBe("shop.example.com");
  });

  it("rejects missing or invalid site domains", () => {
    expect(normalizeSiteDomain("")).toBeNull();
    expect(normalizeSiteDomain("example")).toBeNull();
    expect(normalizeSiteDomain("https://events_example.com")).toBeNull();
    expect(normalizeSiteDomain("track.sargetrack.app")).toBeNull();
  });

  it("builds the Sarge DNS subdomain from the tracked site domain", () => {
    expect(buildSargeTrackingDomain("example.com")).toBe("sarge.example.com");
    expect(buildSargeTrackingDomain("shop.example.com")).toBe("sarge.shop.example.com");
  });

  it("matches captured event traffic to the configured project host", () => {
    expect(eventMatchesConfiguredHost({ url: "https://example.com/products" }, "sarge.example.com")).toBe(true);
    expect(eventMatchesConfiguredHost({ url: "https://www.example.com/products" }, "sarge.example.com")).toBe(true);
    expect(eventMatchesConfiguredHost({ referrer: "https://example.com/cart" }, "sarge.example.com")).toBe(true);
    expect(eventMatchesConfiguredHost({}, "sarge.example.com")).toBe(true);
    expect(eventMatchesConfiguredHost({ url: "https://branch-preview.example.vercel.app/products" }, "sarge.example.com")).toBe(false);
    expect(eventMatchesConfiguredHost({ url: "https://sarge.example.com/products" }, "sarge.example.com")).toBe(false);
  });
});
