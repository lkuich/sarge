import { describe, expect, it } from "vitest";
import { buildSargeTrackingDomain, eventMatchesConfiguredHost, normalizeSiteDomain } from "./sarge-demo";

describe("project site domains", () => {
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
    expect(eventMatchesConfiguredHost({ url: "https://sarge.example.com/products" }, "sarge.example.com")).toBe(true);
    expect(eventMatchesConfiguredHost({ url: "https://www.sarge.example.com/products" }, "sarge.example.com")).toBe(true);
    expect(eventMatchesConfiguredHost({ referrer: "https://sarge.example.com/cart" }, "sarge.example.com")).toBe(true);
    expect(eventMatchesConfiguredHost({}, "sarge.example.com")).toBe(true);
    expect(eventMatchesConfiguredHost({ url: "https://branch-preview.example.vercel.app/products" }, "sarge.example.com")).toBe(false);
    expect(eventMatchesConfiguredHost({ url: "https://example.com/products" }, "sarge.example.com")).toBe(false);
  });
});
