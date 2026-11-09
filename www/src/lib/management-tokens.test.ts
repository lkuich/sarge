// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from "vitest";
import { sha256Hex } from "@sarge/core";
import { authenticateManagementToken, createManagementToken, findManagementToken, listManagementTokens, revokeManagementToken } from "./management-tokens";

const { sql } = vi.hoisted(() => ({ sql: vi.fn() }));
vi.mock("@neondatabase/serverless", () => ({ neon: () => sql }));
const access = { userId: "user_1", organizationId: "org_1", role: "admin" as const };
const token = `sarge_manage_${"a".repeat(43)}`;
const databaseUrl = "postgresql://test";
const membership = vi.fn();
const getUser = vi.fn();
const clerk = { organizations: { getOrganizationMembershipList: membership }, users: { getUser } };

beforeEach(() => {
  vi.resetAllMocks();
  sql.mockResolvedValue([{ id: "t1", workspaceId: "wrk_1", organizationId: "org_1", userId: "user_1" }]);
  membership.mockResolvedValue({ data: [{ role: "org:admin", publicUserData: { userId: "user_1" } }] });
  getUser.mockResolvedValue({ primaryEmailAddressId: "email1", emailAddresses: [{ id: "email1", emailAddress: "admin@example.com", verification: { status: "verified" } }] });
});

describe("management token lifecycle", () => {
  it.each(["sarge_read_abc", "server-secret", "sarge_manage_short", ""])("rejects other credential types before database access: %s", async (value) => {
    expect(await findManagementToken(databaseUrl, value)).toBeNull();
    expect(sql).not.toHaveBeenCalled();
  });

  it("stores only a hash and scopes creation to the admin's organization", async () => {
    const created = await createManagementToken(access, databaseUrl);
    expect(created).toMatch(/^sarge_manage_[A-Za-z0-9_-]{43}$/);
    const [query, ...params] = sql.mock.calls[0];
    expect(query.join("")).toContain('WHERE "clerkOrganizationId" =');
    expect(params).toContain(await sha256Hex(created));
    expect(params).toContain("org_1");
    expect(params).toContain("user_1");
    expect(params).not.toContain(created);
  });

  it("looks up only active hashes, lists no hashes and scopes revocation to the organization", async () => {
    await findManagementToken(databaseUrl, token);
    expect(sql.mock.calls[0][0].join("")).toContain('t."revokedAt" IS NULL');
    expect(sql.mock.calls[0].slice(1)).toEqual([await sha256Hex(token)]);
    await listManagementTokens(access, databaseUrl);
    expect(sql.mock.calls[1][0].join("")).not.toContain("tokenHash");
    expect(await revokeManagementToken(access, databaseUrl, "t1")).toEqual({ success: true });
    expect(sql.mock.calls[2].slice(1)).toEqual(["t1", "org_1"]);
    sql.mockResolvedValue([]);
    expect(await findManagementToken(databaseUrl, token)).toBeNull();
    expect(await revokeManagementToken(access, databaseUrl, "foreign_token")).toEqual({ success: false });
  });

  it("prevents members from creating, listing or revoking management credentials", async () => {
    const member = { ...access, role: "user" as const };
    await expect(createManagementToken(member, databaseUrl)).rejects.toThrow("Only organization admins");
    await expect(listManagementTokens(member, databaseUrl)).rejects.toThrow("Only organization admins");
    await expect(revokeManagementToken(member, databaseUrl, "t1")).rejects.toThrow("Only organization admins");
    expect(sql).not.toHaveBeenCalled();
  });

  it("resolves the current admin and uses only the verified primary email", async () => {
    expect(await authenticateManagementToken(databaseUrl, token, clerk as never)).toEqual({ access, workspaceId: "wrk_1", email: "admin@example.com" });
    expect(membership).toHaveBeenCalledWith({ organizationId: "org_1", userId: ["user_1"], limit: 1 });
    getUser.mockResolvedValue({ emailAddresses: [], primaryEmailAddressId: null });
    expect(await authenticateManagementToken(databaseUrl, token, clerk as never)).toMatchObject({ email: "" });
  });

  it.each([
    { data: [] }, { data: [{ role: "org:member", publicUserData: { userId: "user_1" } }] },
    { data: [{ role: "org:admin", publicUserData: { userId: "someone_else" } }] },
  ])("revokes effective access on removal, demotion or mismatched membership %j", async (response) => {
    membership.mockResolvedValue(response);
    expect(await authenticateManagementToken(databaseUrl, token, clerk as never)).toBeNull();
    expect(getUser).not.toHaveBeenCalled();
  });

  it("fails closed when Clerk is unavailable", async () => {
    membership.mockRejectedValue(new Error("Clerk unavailable"));
    await expect(authenticateManagementToken(databaseUrl, token, clerk as never)).rejects.toThrow("Clerk unavailable");
    expect(getUser).not.toHaveBeenCalled();
  });
});
