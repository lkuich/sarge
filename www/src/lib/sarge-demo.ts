export type AccountRole = "admin" | "user";
export type ProjectStatus = "active" | "paused" | "draft";

export interface AccountMember {
  id: string;
  name: string;
  email: string;
  role: AccountRole;
  lastActive: string;
}

export interface SargeProject {
  id: string;
  slug: string;
  name: string;
  endpointHost: string;
  status: ProjectStatus;
  environment: "production" | "staging";
  eventCount24h: number;
  failedEvents24h: number;
  lastEventAt: string;
  pixelVersion: string;
}

export interface SargeAccount {
  id: string;
  name: string;
  slug: string;
  role: AccountRole;
  plan: string;
  projects: SargeProject[];
  members: AccountMember[];
}

const adminIds = new Set(
  (import.meta.env.SARGE_ADMIN_USER_IDS ?? "")
    .split(",")
    .map((value: string) => value.trim())
    .filter(Boolean),
);

const resolveRole = (userId: string): AccountRole => {
  if (adminIds.size === 0) return "admin";
  return adminIds.has(userId) ? "admin" : "user";
};

export const getViewerAccount = (userId: string): SargeAccount => {
  const role = resolveRole(userId);

  return {
    id: "acct_demo",
    name: "Demo Account",
    slug: "demo",
    role,
    plan: "Hosted shared",
    projects: [
      {
        id: "site_demo",
        slug: "demo-site",
        name: "Demo Site",
        endpointHost: "sarge.lkuich.com",
        status: "active",
        environment: "production",
        eventCount24h: 184,
        failedEvents24h: 2,
        lastEventAt: "2 minutes ago",
        pixelVersion: "0.1.0",
      },
      {
        id: "site_checkout",
        slug: "checkout-lab",
        name: "Checkout Lab",
        endpointHost: "checkout.sarge.local",
        status: "draft",
        environment: "staging",
        eventCount24h: 0,
        failedEvents24h: 0,
        lastEventAt: "No events yet",
        pixelVersion: "0.1.0",
      },
    ],
    members: [
      {
        id: "mem_admin",
        name: "Account Admin",
        email: "admin@example.com",
        role: "admin",
        lastActive: "Today",
      },
      {
        id: "mem_user",
        name: "Debug User",
        email: "debugger@example.com",
        role: "user",
        lastActive: "Yesterday",
      },
    ],
  };
};

export const getProject = (account: SargeAccount, slug: string) =>
  account.projects.find((project) => project.slug === slug);

export const canAdministerAccount = (account: SargeAccount) => account.role === "admin";

export const formatCount = (value: number) => new Intl.NumberFormat("en-US").format(value);
