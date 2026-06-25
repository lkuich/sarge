import { describe, expect, it } from "vitest";
import { buildSargeTrackingDomain, normalizeSiteDomain } from "./sarge-demo";

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
});
