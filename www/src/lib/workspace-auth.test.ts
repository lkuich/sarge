import { describe, expect, it } from "vitest";
import { getActiveOrganizationRedirect, getWorkspaceAccess, mapOrganizationMemberships } from "./workspace-auth";

describe("Clerk organization workspace access", () => {
  it("maps the active Clerk organization and admin role into server access", () => {
    const access = getWorkspaceAccess({
      userId: "user_123",
      orgId: "org_123",
      has: ({ role }: { role?: string }) => role === "org:admin",
    } as never);

    expect(access).toEqual({
      userId: "user_123",
      organizationId: "org_123",
      role: "admin",
    });
  });

  it("requires an active organization and defaults organization members to user access", () => {
    expect(
      getWorkspaceAccess({
        userId: "user_123",
        orgId: null,
        has: () => false,
      } as never),
    ).toBeNull();

    expect(
      getWorkspaceAccess({
        userId: "user_123",
        orgId: "org_123",
        has: () => false,
      } as never),
    ).toMatchObject({ role: "user" });
  });

  it("maps Clerk memberships for the account member table", () => {
    expect(
      mapOrganizationMemberships([
        {
          id: "membership_123",
          role: "org:admin",
          createdAt: Date.UTC(2026, 6, 23),
          publicUserData: {
            userId: "user_123",
            identifier: "admin@example.com",
            firstName: "Ada",
            lastName: "Lovelace",
          },
        },
      ]),
    ).toEqual([
      expect.objectContaining({
        id: "user_123",
        name: "Ada Lovelace",
        email: "admin@example.com",
        role: "admin",
      }),
    ]);
  });

  it("preserves only local return paths when selecting an organization", () => {
    expect(getActiveOrganizationRedirect("https://sargetrack.app/app/billing?checkout=success")).toBe(
      "/select-organization?redirect_url=%2Fapp%2Fbilling%3Fcheckout%3Dsuccess",
    );
  });
});
