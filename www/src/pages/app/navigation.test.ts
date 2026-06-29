import { existsSync, readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const sourcePath = (path: string) => fileURLToPath(new URL(path, import.meta.url));
const readSource = (path: string) => readFileSync(sourcePath(path), "utf8");

describe("app navigation routes", () => {
  it("keeps the app shell in the top nav instead of a sidebar", () => {
    const layout = readSource("../../layouts/AppLayout.astro");

    expect(layout).not.toContain("<aside");
    expect(layout).not.toContain('href="/app/projects"');
    expect(layout).not.toContain('href="/admin"');
    expect(layout).not.toContain('label: "Admin"');
    expect(layout).toContain('href="/app"');
    expect(layout).toContain('href="/docs"');
    expect(layout).toContain('href="/app/notifications"');
    expect(layout).toContain('Docs');
    expect(layout).toContain("{account.name}");
    expect(layout).toContain("{account.role}");
    expect(layout).toContain("{account.plan.name}");
    expect(layout).toContain("<UserButton />");
    expect(layout).not.toContain("ThemeToggle");
    expect(layout).toContain('active === "notifications"');
    expect(layout).toContain('active === "billing"');
    expect(layout).toContain(">BETA<");
  });

  it("does not ship the old admin page", () => {
    expect(existsSync(sourcePath("../admin/index.astro"))).toBe(false);
  });

  it("serves project sections from the overview page and removes the old projects index", () => {
    const overview = readSource("./index.astro");

    expect(existsSync(sourcePath("./projects/index.astro"))).toBe(false);
    expect(overview).toContain('heading={needsWorkspaceSetup ? "Create your workspace" : "Overview"}');
    expect(overview).toContain("projectCountLabel");
    expect(overview).toContain("New project");
    expect(overview).toContain('href={`/app/projects/${project.siteId}`}');
  });

  it("keeps overview metrics high-level without duplicating the project list", () => {
    const overview = readSource("./index.astro");

    expect(overview).toContain("data-overview-metrics");
    expect(overview).toContain("Coverage");
    expect(overview).toContain("Throughput");
    expect(overview).toContain("Attention");
    expect(overview).toContain("buildProjectDistribution(account.projects)");
    expect(overview).not.toContain("data-project-distribution");
    expect(overview).not.toContain("Recent project activity");
    expect(overview).not.toContain("<Table>");
  });

  it("routes project flows back to overview instead of the removed index", () => {
    const newProject = readSource("./projects/new.astro");
    const projectDetail = readSource("./projects/[projectId].astro");

    expect(newProject).not.toContain('href="/app/projects"');
    expect(projectDetail).not.toContain('href="/app/projects"');
    expect(projectDetail).not.toContain('Astro.redirect("/app/projects")');
    expect(newProject).toContain('href="/app"');
    expect(projectDetail).toContain('Astro.redirect("/app")');
  });

  it("uses stable site ids for project routes instead of user-facing slugs", () => {
    const overview = readSource("./index.astro");
    const newProject = readSource("./projects/new.astro");
    const projectDetail = readSource("./projects/[projectId].astro");
    const demoData = readSource("../../lib/sarge-demo.ts");

    expect(overview).toContain('href={`/app/projects/${project.siteId}`}');
    expect(newProject).toContain("Astro.redirect(`/app/projects/${result.project.siteId}`, 303)");
    expect(projectDetail).toContain('href: environment === "production" ? `/app/projects/${project.siteId}` : `/app/projects/${project.siteId}?environment=${environment}`,');
    expect(projectDetail).not.toContain('if (Astro.params.projectId !== project.siteId) return Astro.redirect(`/app/projects/${project.siteId}${Astro.url.search}`, 301);');
    expect(projectDetail).not.toContain('href: environment === "production" ? `/app/projects/${project.slug}`');
    expect(demoData).toContain("siteId: string;");
    expect(demoData).toContain("project.siteId === projectId");
    expect(demoData).not.toContain("project.slug === projectId");
  });

  it("lets an owner delete an empty workspace from overview", () => {
    const overview = readSource("./index.astro");
    const demoData = readSource("../../lib/sarge-demo.ts");

    expect(demoData).toContain("export const deleteWorkspace");
    expect(overview).toContain('intent === "delete-workspace"');
    expect(overview).toContain("data-delete-workspace");
    expect(overview).toContain("Delete empty workspace");
    expect(overview).toContain("Only empty workspaces can be deleted.");
  });

  it("separates owned and shared projects using Clerk viewer emails", () => {
    const overview = readSource("./index.astro");
    const newProject = readSource("./projects/new.astro");
    const projectDetail = readSource("./projects/[projectId].astro");
    const account = readSource("./account.astro");
    const demoData = readSource("../../lib/sarge-demo.ts");

    expect(overview).toContain("Astro.locals.currentUser()");
    expect(newProject).toContain("Astro.locals.currentUser()");
    expect(projectDetail).toContain("Astro.locals.currentUser()");
    expect(account).toContain("Astro.locals.currentUser()");
    expect(overview).toContain("viewerEmails");
    expect(overview).toContain("Your workspace");
    expect(overview).toContain("Shared with you");
    expect(overview).toContain("account.ownedProjects");
    expect(overview).toContain("account.sharedProjects");

    expect(demoData).toContain("interface GetViewerAccountOptions");
    expect(demoData).toContain("viewerEmails?: string[];");
    expect(demoData).toContain("mapProjectShare");
    expect(demoData).toContain("ownership: \"shared\"");
  });

  it("models billing plan and usage on the workspace account", () => {
    const demoData = readSource("../../lib/sarge-demo.ts");
    const schema = readSource("../../../../apps/api/prisma/schema.prisma");
    const layout = readSource("../../layouts/AppLayout.astro");

    expect(schema).toContain("planId");
    expect(schema).toContain("billingStatus");
    expect(schema).toContain("currentPeriodEventCount");
    expect(demoData).toContain("planId: PlanId;");
    expect(demoData).toContain("plan: PlanDefinition;");
    expect(demoData).toContain("currentPeriodEventCount: number;");
    expect(layout).toContain("account.plan.name");
  });

  it("surfaces project and event usage limits from the active plan", () => {
    const demoData = readSource("../../lib/sarge-demo.ts");
    const overview = readSource("./index.astro");
    const newProject = readSource("./projects/new.astro");

    expect(demoData).toContain("canCreateProjectForPlan");
    expect(demoData).toContain("getAccountUsage");
    expect(demoData).toContain("limited_workspace");
    expect(demoData).toContain("inserted_environments");
    expect(demoData.match(/sql\.transaction/g)?.length).toBeGreaterThanOrEqual(4);
    expect(demoData.match(/FOR UPDATE/g)?.length).toBeGreaterThanOrEqual(4);
    expect(demoData).not.toContain("const createProjectEnvironments");
    expect(overview).toContain("getLimitUsagePrompt");
    expect(overview).toContain("eventUsagePrompt");
    expect(overview).toContain("projectUsagePrompt");
    expect(overview).toContain("data-usage-limit-prompt");
    expect(overview).toContain("data-plan-usage-panel");
    expect(overview).toContain("account.plan.limits.eventsPerMonth");
    expect(newProject).toContain("canCreateProjectForPlan(account)");
    expect(newProject).toContain("Upgrade to add more projects");
  });

  it("defaults users to non-admin unless explicitly listed in SARGE_ADMIN_USER_IDS", () => {
    const demoData = readSource("../../lib/sarge-demo.ts");

    expect(demoData).toContain("if (adminIds.size === 0) return 'user';");
    expect(demoData).toContain("return adminIds.has(userId) ? 'admin' : 'user';");
    expect(demoData).not.toContain("if (adminIds.size === 0) return 'admin';");
  });

  it("filters visible event logs by the owning workspace plan retention", () => {
    const demoData = readSource("../../lib/sarge-demo.ts");

    expect(demoData).toContain("buildPlanRetentionFilterSql");
    expect(demoData).toContain("const eventRetentionFilterSql");
    expect(demoData).toContain('JOIN "Workspace" w ON w.id = s."workspaceId"');
    expect(demoData.match(/sql\.unsafe\(eventRetentionFilterSql\)/g)?.length).toBeGreaterThanOrEqual(3);
  });

  it("adds a billing page with the recommended pricing ladder", () => {
    const billing = readSource("./billing.astro");
    const layout = readSource("../../layouts/AppLayout.astro");

    expect(layout).toContain('href="/app/billing"');
    expect(billing).toContain('active="billing"');
    expect(billing).toContain("createCheckoutSession");
    expect(billing).toContain("createBillingPortalSession");
    expect(billing).toContain('name="intent" value="checkout-plan"');
    expect(billing).toContain('name="intent" value="billing-portal"');
    expect(billing).toContain('name="planId"');
    expect(billing).toContain("Free");
    expect(billing).toContain("$19");
    expect(billing).toContain("$99");
    expect(billing).toContain("Contact us");
    expect(billing).not.toContain("Enterprise");
    expect(billing).toContain("50k events/month");
    expect(billing).toContain("1 shared user/project");
    expect(billing).toContain("3 shared users/project");
    expect(billing).toContain("10 shared users/project");
    expect(billing).toContain("Unlimited shared users/project");
    expect(billing).toContain("2M events/month");
    expect(billing).toContain("Custom events/month");
    expect(billing).toContain("Basic affiliate attribution");
    expect(billing).toContain("Server-side calls");
    expect(billing).toContain("Partner postbacks");
    expect(billing).toContain("3 webhooks");
    expect(billing).toContain("AI review");
    expect(billing).toContain("Tracked page monitoring");
    expect(billing).toContain("Exports and alerts");
    expect(billing).toContain("SSO/SAML");
    expect(billing).toContain("Audit logs");
    expect(billing).toContain("Warehouse sync");
  });

  it("adds notification preferences with durable email settings and dedupe", () => {
    const notificationsPage = readSource("./notifications.astro");
    const notifications = readSource("../../lib/notifications.ts");
    const schema = readSource("../../../../apps/api/prisma/schema.prisma");

    expect(schema).toContain("model NotificationPreference");
    expect(schema).toContain("model NotificationDelivery");
    expect(schema).toContain("@@unique([workspaceId, userId, category])");
    expect(schema).toContain("@@unique([workspaceId, recipientEmail, category, fingerprint])");

    expect(notifications).toContain("tracking_stopped");
    expect(notifications).toContain("page_health_failure");
    expect(notifications).toContain("usage_limit_risk");
    expect(notifications).toContain("billing_action_needed");
    expect(notifications).toContain("collaboration_access");
    expect(notifications).toContain("sendNotificationWithDedupe");
    expect(notifications).toContain("loadNotificationPreferences");
    expect(notifications).toContain("saveNotificationPreferences");

    expect(notificationsPage).toContain('active="notifications"');
    expect(notificationsPage).toContain("data-notification-preferences");
    expect(notificationsPage).toContain('name="intent" value="save-notifications"');
    expect(notificationsPage).toContain('type="checkbox"');
    expect(notificationsPage).toContain("Always sent");
    expect(notificationsPage).toContain("Upgrade to Growth");
    expect(notificationsPage).toContain("Choose which email alerts you want to receive.");
    expect(notificationsPage).not.toContain("Email status");
    expect(notificationsPage).not.toContain("Cloudflare");
    expect(notificationsPage).not.toContain("SARGE_EMAIL_FROM");
    expect(notificationsPage).not.toContain("workspace sender");
    expect(notificationsPage).not.toContain("deduped");
    expect(notificationsPage).not.toContain("data-model");
  });

  it("receives Stripe webhooks through a signature-verified endpoint", () => {
    const webhook = readSource("../api/stripe/webhook.ts");

    expect(webhook).toContain("constructEventAsync");
    expect(webhook).toContain("createSubtleCryptoProvider");
    expect(webhook).toContain("handleStripeWebhookEvent");
    expect(webhook).toContain("stripe-signature");
  });

  it("documents the public pricing and feature gating strategy", () => {
    const homepage = readSource("../index.astro");
    const pricingDoc = readSource("../../../../docs/PRICING.md");

    expect(homepage).toContain("Free");
    expect(homepage).toContain("$35");
    expect(homepage).toContain("$149");
    expect(homepage).not.toContain("Enterprise");
    expect(homepage).toContain("Contact us");
    expect(homepage).toContain("1 shared user/project");
    expect(homepage).toContain("3 shared users/project");
    expect(homepage).toContain("10 shared users/project");
    expect(homepage).toContain("Unlimited shared users/project");
    expect(homepage).toContain("Tracked page monitoring");
    expect(homepage).toContain("tracked Production URLs for new 404s, 500s, timeouts");
    expect(pricingDoc).toContain("tracking assurance");
    expect(pricingDoc).toContain("Do not gate the core install path");
    expect(pricingDoc).toContain("Gate these because they map to business value");
  });
});
