import { existsSync, readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const sourcePath = (path: string) => fileURLToPath(new URL(path, import.meta.url));
const readSource = (path: string) => readFileSync(sourcePath(path), "utf8");

describe("public legal pages and acceptance mechanisms", () => {
  it("ships public privacy and terms pages with review-ready SaaS coverage", () => {
    expect(existsSync(sourcePath("./pages/legal/privacy.astro"))).toBe(true);
    expect(existsSync(sourcePath("./pages/legal/terms.astro"))).toBe(true);

    const privacy = readSource("./pages/legal/privacy.astro");
    const terms = readSource("./pages/legal/terms.astro");

    expect(privacy).toContain("Privacy Policy");
    expect(privacy).toContain("Effective June 25, 2026");
    expect(privacy).toContain("browser event data");
    expect(privacy).toContain("service providers");
    expect(privacy).toContain("privacy@sargetrack.app");
    expect(privacy).toContain("data-subject-request");

    expect(terms).toContain("Terms of Service");
    expect(terms).toContain("Effective June 25, 2026");
    expect(terms).toContain("customer content");
    expect(terms).toContain("acceptable use");
    expect(terms).toContain("terms@sargetrack.app");
  });

  it("links privacy and terms from public, auth, and app surfaces", () => {
    const siteLayout = readSource("./layouts/SiteLayout.astro");
    const appLayout = readSource("./layouts/AppLayout.astro");
    const signUp = readSource("./pages/sign-up.astro");
    const overview = readSource("./pages/app/index.astro");

    for (const source of [siteLayout, appLayout, signUp, overview]) {
      expect(source).toContain('href="/legal/privacy"');
      expect(source).toContain('href="/legal/terms"');
    }

    expect(signUp).toContain("By creating an account");
    expect(appLayout).toContain("Legal");
  });

  it("requires workspace owners to accept the current legal terms before workspace creation", () => {
    const schema = readSource("../../apps/api/prisma/schema.prisma");
    const overview = readSource("./pages/app/index.astro");
    const demoData = readSource("./lib/sarge-demo.ts");

    expect(schema).toContain("termsAcceptedAt");
    expect(schema).toContain("termsAcceptedVersion");
    expect(schema).toContain("privacyAcceptedVersion");
    expect(schema).toContain("termsAcceptedIp");
    expect(schema).toContain("termsAcceptedUserAgent");

    expect(demoData).toContain('export const CURRENT_LEGAL_VERSION = "2026-06-25";');
    expect(demoData).toContain("workspaceLegalAcceptanceRequired");
    expect(demoData).toContain("acceptWorkspaceLegalTerms");
    expect(demoData).toContain("termsAcceptedAt: Date | null;");

    expect(overview).toContain("needsLegalAcceptance");
    expect(overview).toContain('intent === "accept-legal-terms"');
    expect(overview).toContain('name="acceptLegalTerms"');
    expect(overview).toContain("I agree to the Terms of Service and acknowledge the Privacy Policy.");
    expect(overview).toContain("Legal acceptance is required before creating a workspace.");
  });
});
