import { neon } from "@neondatabase/serverless";
import { sha256Hex } from "@sarge/core";
import type { WorkspaceAccess } from "./sarge-demo";
import type { clerkClient } from "@clerk/astro/server";
import type { ManagementPrincipal } from "./management-mcp";

export interface ManagementTokenIdentity {
  id: string;
  workspaceId: string;
  organizationId: string;
  userId: string;
}

export const findManagementToken = async (databaseUrl: string | undefined, token: string): Promise<ManagementTokenIdentity | null> => {
  if (!databaseUrl || !/^sarge_manage_[A-Za-z0-9_-]{43}$/.test(token)) return null;
  const rows = await neon(databaseUrl)`
    SELECT t.id, t."workspaceId", w."clerkOrganizationId" AS "organizationId", t."createdByUserId" AS "userId"
    FROM "ManagementToken" t JOIN "Workspace" w ON w.id = t."workspaceId"
    WHERE t."tokenHash" = ${await sha256Hex(token)} AND t."revokedAt" IS NULL
      AND w."clerkOrganizationId" IS NOT NULL
    LIMIT 1
  `;
  return (rows[0] as ManagementTokenIdentity | undefined) ?? null;
};

export const authenticateManagementToken = async (databaseUrl: string | undefined, token: string, client: ReturnType<typeof clerkClient>): Promise<ManagementPrincipal | null> => {
  const identity = await findManagementToken(databaseUrl, token);
  if (!identity) return null;
  // Check current membership on every request so removal or demotion also revokes access.
  const memberships = await client.organizations.getOrganizationMembershipList({
    organizationId: identity.organizationId, userId: [identity.userId], limit: 1,
  });
  if (!memberships.data.some((item) => item.publicUserData?.userId === identity.userId && item.role === "org:admin")) return null;
  const user = await client.users.getUser(identity.userId);
  const email = user.emailAddresses.find((item) => item.id === user.primaryEmailAddressId && item.verification?.status === "verified")?.emailAddress ?? "";
  return { access: { userId: identity.userId, organizationId: identity.organizationId, role: "admin" }, workspaceId: identity.workspaceId, email };
};

export const createManagementToken = async (access: WorkspaceAccess, databaseUrl: string | undefined) => {
  if (access.role !== "admin") throw new Error("Only organization admins can manage MCP tokens.");
  if (!databaseUrl) throw new Error("Database unavailable");
  const bytes = crypto.getRandomValues(new Uint8Array(32));
  const token = `sarge_manage_${btoa(String.fromCharCode(...bytes)).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "")}`;
  const rows = await neon(databaseUrl)`
    INSERT INTO "ManagementToken" (id, "workspaceId", "createdByUserId", "tokenHash")
    SELECT ${crypto.randomUUID()}, id, ${access.userId}, ${await sha256Hex(token)}
    FROM "Workspace" WHERE "clerkOrganizationId" = ${access.organizationId}
    RETURNING id
  `;
  if (!rows[0]) throw new Error("Create your workspace before creating an MCP token.");
  return token;
};

export const listManagementTokens = async (access: WorkspaceAccess, databaseUrl: string | undefined) => {
  if (access.role !== "admin") throw new Error("Only organization admins can manage MCP tokens.");
  if (!databaseUrl) throw new Error("Database unavailable");
  return neon(databaseUrl)`
    SELECT t.id, t."createdByUserId", t."createdAt"
    FROM "ManagementToken" t JOIN "Workspace" w ON w.id = t."workspaceId"
    WHERE w."clerkOrganizationId" = ${access.organizationId} AND t."revokedAt" IS NULL
    ORDER BY t."createdAt" DESC
  `;
};

export const revokeManagementToken = async (access: WorkspaceAccess, databaseUrl: string | undefined, id: string) => {
  if (access.role !== "admin") throw new Error("Only organization admins can manage MCP tokens.");
  if (!databaseUrl) throw new Error("Database unavailable");
  const rows = await neon(databaseUrl)`
    UPDATE "ManagementToken" t SET "revokedAt" = NOW() FROM "Workspace" w
    WHERE t.id = ${id} AND t."workspaceId" = w.id AND w."clerkOrganizationId" = ${access.organizationId}
      AND t."revokedAt" IS NULL
    RETURNING t.id
  `;
  return { success: rows.length === 1 };
};
