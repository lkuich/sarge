import type { AuthFn } from "@clerk/astro/server";
import type { AccountMember, WorkspaceAccess } from "./sarge-demo";

type ClerkAuth = ReturnType<AuthFn>;

export const getWorkspaceAccess = (auth: ClerkAuth): WorkspaceAccess | null => {
  if (!auth.userId || !auth.orgId) return null;

  return {
    userId: auth.userId,
    organizationId: auth.orgId,
    role: auth.has({ role: "org:admin" }) ? "admin" : "user",
  };
};

export const getActiveOrganizationRedirect = (requestUrl: string) => {
  const requestedUrl = new URL(requestUrl);
  const returnPath = `${requestedUrl.pathname}${requestedUrl.search}`;
  return `/select-organization?redirect_url=${encodeURIComponent(returnPath)}`;
};

export const mapOrganizationMemberships = (
  memberships: Array<{
    id: string;
    role: string;
    createdAt: number;
    publicUserData?: {
      userId: string;
      identifier: string;
      firstName: string | null;
      lastName: string | null;
    } | null;
  }>,
): AccountMember[] =>
  memberships.map((membership) => {
    const user = membership.publicUserData;
    const name = [user?.firstName, user?.lastName].filter(Boolean).join(" ");

    return {
      id: user?.userId ?? membership.id,
      name: name || user?.identifier || "Organization member",
      email: user?.identifier ?? "",
      role: membership.role === "org:admin" ? "admin" : "user",
      lastActive: new Intl.DateTimeFormat("en-US", {
        month: "short",
        day: "numeric",
        year: "numeric",
      }).format(new Date(membership.createdAt)),
    };
  });
