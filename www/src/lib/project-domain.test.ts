import { describe, expect, it } from "vitest";
import { normalizeTrackingSubdomain } from "./sarge-demo";

describe("project tracking subdomains", () => {
  it("normalizes exact tracking subdomains entered during project setup", () => {
    expect(normalizeTrackingSubdomain(" HTTPS://Events.Example.COM/pixel.js?env=abc ")).toBe("events.example.com");
    expect(normalizeTrackingSubdomain("events.example.com")).toBe("events.example.com");
  });

  it("rejects missing or invalid tracking subdomains", () => {
    expect(normalizeTrackingSubdomain("")).toBeNull();
    expect(normalizeTrackingSubdomain("example")).toBeNull();
    expect(normalizeTrackingSubdomain("example.com")).toBeNull();
    expect(normalizeTrackingSubdomain("https://events_example.com")).toBeNull();
    expect(normalizeTrackingSubdomain("track.sargetrack.app")).toBeNull();
  });
});
