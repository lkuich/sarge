import { describe, expect, it } from "vitest";
import {
  createEnvironmentCredential,
  createProject,
  createWebhookEndpoint,
  saveWorkspacePrivacySettings,
  type WorkspaceAccess,
} from "./sarge-demo";

const memberAccess = {
  userId: "user_member",
  organizationId: "org_123",
  role: "user",
} satisfies WorkspaceAccess;

describe("organization authorization", () => {
  it("blocks organization members from admin-only mutations before database access", async () => {
    await expect(createEnvironmentCredential(memberAccess, undefined, "env_123", "server")).resolves.toEqual({
      success: false,
      error: "Only organization admins can manage server-side credentials.",
    });
    await expect(createProject(memberAccess, undefined, { name: "Store", domain: "store.example.com" })).resolves.toEqual({
      success: false,
      error: "Only organization admins can create projects.",
    });
    await expect(createWebhookEndpoint(memberAccess, undefined, "env_123", { name: "Orders", url: "https://example.com" })).resolves.toEqual({
      success: false,
      error: "Only organization admins can create webhooks.",
    });
    await expect(saveWorkspacePrivacySettings(memberAccess, undefined, {})).resolves.toEqual({
      success: false,
      error: "Only organization admins can manage workspace data controls.",
    });
  });
});
