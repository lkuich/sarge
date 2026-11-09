// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from "vitest";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js";
import { handleManagementMcp, type ManagementPrincipal } from "./management-mcp";
import * as sarge from "./sarge-demo";
import * as tokens from "./management-tokens";
import * as billing from "./stripe-billing";
import * as notifications from "./notifications";

vi.mock("./sarge-demo");
vi.mock("./management-tokens");
vi.mock("./stripe-billing");
vi.mock("./notifications");

const principal: ManagementPrincipal = {
  access: { userId: "user_admin", organizationId: "org_1", role: "admin" }, workspaceId: "wrk_1", email: "admin@example.com",
};
const env = { DATABASE_URL: "postgresql://test", AI_SUMMARY_MODEL: "test-model" };
const authenticate = vi.fn(async () => principal as ManagementPrincipal | null);
const rpc = (method: string, params?: unknown) => ({ jsonrpc: "2.0", id: 1, method, params });
const request = (body: unknown, headers: Record<string, string> = {}) => new Request("https://sargetrack.app/api/mcp", {
  method: "POST", headers: { "content-type": "application/json", accept: "application/json, text/event-stream", authorization: "Bearer sarge_manage_test", ...headers }, body: JSON.stringify(body),
});
const call = async (name: string, args: Record<string, unknown> = {}) => {
  const response = await handleManagementMcp(request(rpc("tools/call", { name, arguments: args })), env, authenticate);
  return (await response.json()).result;
};

beforeEach(() => {
  vi.resetAllMocks();
  authenticate.mockResolvedValue(principal);
  vi.mocked(sarge.getViewerAccount).mockResolvedValue({
    id: "wrk_1", ownedProjects: [{ siteId: "site_1", name: "Store", environments: [{ id: "env_1", environment: "production", pixelUrl: "https://track.sargetrack.app/pixel.js?env=env_1" }] }],
    sharedProjects: [{ siteId: "site_shared", environments: [{ id: "env_shared" }] }],
  } as never);
});

describe("management MCP", () => {
  it("supports SDK discovery and project creation with the verified workspace principal", async () => {
    const client = new Client({ name: "test", version: "1" });
    const transport = new StreamableHTTPClientTransport(new URL("https://sargetrack.app/api/mcp"), {
      requestInit: { headers: { authorization: "Bearer sarge_manage_test" } },
      fetch: async (url, init) => handleManagementMcp(new Request(url, init), env, authenticate),
    });
    try {
      await client.connect(transport);
      const tools = (await client.listTools()).tools;
      expect(tools).toHaveLength(24);
      expect(tools.find((tool) => tool.name === "request_deletion")?.annotations?.destructiveHint).toBe(true);
      expect(tools.find((tool) => tool.name === "list_projects")?.annotations?.readOnlyHint).toBe(true);
      vi.mocked(sarge.createProject).mockResolvedValue({ success: true, project: { siteId: "site_new" } } as never);
      const result = await client.callTool({ name: "create_project", arguments: { name: "Storypane", domain: "storypane.dev" } });
      expect(result.structuredContent).toMatchObject({ success: true, project: { siteId: "site_new" } });
      expect(sarge.createProject).toHaveBeenCalledWith(principal.access, env.DATABASE_URL, { name: "Storypane", domain: "storypane.dev" });
      authenticate.mockResolvedValue(null);
      expect((await handleManagementMcp(request(rpc("tools/list")), env, authenticate)).status).toBe(401);
    } finally { await client.close(); }
  });

  it("gets installation details and keeps other workspaces and shared projects inaccessible", async () => {
    expect((await call("get_installation", { projectId: "site_1" })).structuredContent).toMatchObject({ siteEnvironmentId: "env_1", snippet: '<script async src="https://track.sargetrack.app/pixel.js?env=env_1"></script>' });
    expect((await call("get_project", { projectId: "site_shared" })).isError).toBe(true);
    expect((await call("list_projects")).structuredContent.projects).toHaveLength(1);
    for (const environmentId of ["env_foreign", "env_shared"]) {
      expect((await call("list_events", { environmentId })).isError).toBe(true);
      expect((await call("mark_test_traffic", { environmentId, kind: "user", subjectId: "u1" })).isError).toBe(true);
      expect((await call("create_verification_link", { environmentId })).isError).toBe(true);
    }
    expect(sarge.getProjectEnvironmentEventPage).not.toHaveBeenCalled();
    expect(sarge.markProjectTrafficAsTest).not.toHaveBeenCalled();
    expect(sarge.createPublicVerificationLink).not.toHaveBeenCalled();
  });

  it("passes event pagination and test filters to the existing query", async () => {
    vi.mocked(sarge.getProjectEnvironmentEventPage).mockResolvedValue({ events: [], nextCursor: "next", totalEvents: 3, totalUsers: 2, totalSessions: 2 });
    const args = { environmentId: "env_1", traffic: "test", limit: 20, cursor: '["2026-11-09T00:00:00Z","e1"]', search: "u1" };
    expect((await call("list_events", args)).structuredContent).toMatchObject({ siteEnvironmentId: "env_1", nextCursor: "next" });
    expect(sarge.getProjectEnvironmentEventPage).toHaveBeenCalledWith(env.DATABASE_URL, "env_1", { traffic: "test", limit: 20, cursor: args.cursor, search: "u1" });
  });

  it.each([
    ["create_environment_credential", { environmentId: "env_1", kind: "api-read" }, "createEnvironmentCredential", [principal.access, env.DATABASE_URL, "env_1", "api-read"]],
    ["request_deletion", { scope: "site", targetSiteId: "site_1", confirmation: "DELETE" }, "createDeletionRequest", [principal.access, env.DATABASE_URL, { scope: "site", targetSiteId: "site_1", confirmation: "DELETE" }]],
    ["create_webhook", { environmentId: "env_1", name: "Orders", url: "https://example.com/webhook" }, "createWebhookEndpoint", [principal.access, env.DATABASE_URL, "env_1", { name: "Orders", url: "https://example.com/webhook" }]],
  ] as const)("delegates %s to the same permission-checked dashboard service", async (name, args, service, expected) => {
    vi.mocked(sarge[service]).mockResolvedValue({ success: false, error: "Plan limit reached" } as never);
    const result = await call(name, args);
    expect(result).toMatchObject({ isError: true, structuredContent: { error: "Plan limit reached" } });
    expect(sarge[service]).toHaveBeenCalledWith(...expected);
  });

  it("creates billing links and saves only the token owner's notification preferences", async () => {
    vi.mocked(billing.createCheckoutSession).mockResolvedValue({ success: true, url: "https://checkout.stripe.com/test" });
    expect((await call("create_checkout_link", { planId: "starter" })).structuredContent.success).toBe(true);
    expect(billing.createCheckoutSession).toHaveBeenCalledWith(expect.objectContaining({ access: principal.access, customerEmail: principal.email, appUrl: "https://sargetrack.app" }));
    vi.mocked(notifications.saveNotificationPreferences).mockResolvedValue({ success: true });
    await call("save_notifications", { enabledCategoryIds: ["tracking_stopped"] });
    expect(notifications.saveNotificationPreferences).toHaveBeenCalledWith(expect.objectContaining({ userId: "user_admin", workspaceId: "wrk_1", email: principal.email }));
    vi.mocked(tokens.revokeManagementToken).mockResolvedValue({ success: true });
    await call("revoke_management_token", { tokenId: "token_1" });
    expect(tokens.revokeManagementToken).toHaveBeenCalledWith(principal.access, env.DATABASE_URL, "token_1");
  });

  it.each([
    ["create_project", { name: "Store", domain: "example.com", organizationId: "org_other" }],
    ["request_deletion", { scope: "workspace" }], ["delete_empty_workspace", { confirmation: "yes" }],
    ["list_events", { environmentId: "env_1", limit: 10000 }],
    ["create_environment_credential", { environmentId: "env_1", kind: "admin" }],
  ])("rejects malformed %s arguments before database operations", async (name, args) => {
    expect((await call(name as string, args as Record<string, unknown>)).isError).toBe(true);
    expect(sarge.createProject).not.toHaveBeenCalled();
    expect(sarge.createDeletionRequest).not.toHaveBeenCalled();
    expect(sarge.deleteWorkspace).not.toHaveBeenCalled();
    expect(sarge.createEnvironmentCredential).not.toHaveBeenCalled();
  });

  it("rejects missing, read-only, revoked and non-admin authentication; fails closed on errors", async () => {
    authenticate.mockResolvedValue(null);
    expect((await handleManagementMcp(request(rpc("tools/list")), env, authenticate)).status).toBe(401);
    authenticate.mockResolvedValue({ ...principal, access: { ...principal.access, role: "user" } });
    expect((await handleManagementMcp(request(rpc("tools/list")), env, authenticate)).status).toBe(401);
    authenticate.mockRejectedValue(new Error("private DB connection string"));
    const response = await handleManagementMcp(request(rpc("tools/list")), env, authenticate);
    expect(response.status).toBe(500);
    expect(await response.text()).not.toContain("private");
  });

  it("rejects foreign origins, unsupported methods and oversized bodies", async () => {
    expect((await handleManagementMcp(request(rpc("tools/list"), { origin: "https://evil.example" }), env, authenticate)).status).toBe(403);
    expect(authenticate).not.toHaveBeenCalled();
    expect((await handleManagementMcp(new Request("https://sargetrack.app/api/mcp", { headers: { authorization: "Bearer token" } }), env, authenticate)).status).toBe(405);
    expect((await handleManagementMcp(request(rpc("tools/call", { name: "create_project", arguments: { name: "x".repeat(65536) } })), env, authenticate)).status).toBe(413);
  });
});
