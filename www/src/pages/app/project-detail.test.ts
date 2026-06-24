import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const sourcePath = (path: string) => fileURLToPath(new URL(path, import.meta.url));
const readSource = (path: string) => readFileSync(sourcePath(path), "utf8");

describe("project detail install panel", () => {
  it("collapses the install pixel section by default once the project is active", () => {
    const projectDetail = readSource("./projects/[projectId].astro");

    expect(projectDetail).toContain('const isPixelActive = pixelInstallStatus === "active";');
    expect(projectDetail).toContain("data-install-pixel-details");
    expect(projectDetail).toContain("open={!isPixelActive}");
  });

  it("uses environment-specific event activity for the install badge and collapse state", () => {
    const projectDetail = readSource("./projects/[projectId].astro");

    expect(projectDetail).toContain("selectedEnvironment.eventCount24h > 0 || selectedEnvironment.recentEvents.length > 0");
    expect(projectDetail).toContain('const pixelInstallStatus = getPixelInstallStatus(selectedEnvironment.status, hasSelectedEnvironmentEvents);');
    expect(projectDetail).toContain("<Badge>{pixelInstallStatus}</Badge>");
    expect(projectDetail).not.toContain("<Badge>{selectedEnvironment.status}</Badge>");
  });

  it("adds a compact project pulse panel above operational sections", () => {
    const projectDetail = readSource("./projects/[projectId].astro");
    const pulsePanel = projectDetail.indexOf("data-project-pulse");
    const installPanel = projectDetail.indexOf("data-install-pixel-details");

    expect(projectDetail).toContain("const eventPulseBars = buildEventPulseBars(selectedEnvironment.recentEvents, selectedEnvironment.eventCount24h);");
    expect(projectDetail).toContain("const eventTypeMix = buildEventTypeMix(selectedEnvironment.recentEvents);");
    expect(projectDetail).toContain("formatCount,");
    expect(projectDetail).toContain("Project pulse");
    expect(projectDetail).toContain("Event mix");
    expect(projectDetail).toContain("data-project-pulse");
    expect(projectDetail).toContain("data-event-pulse-bars");
    expect(pulsePanel).toBeGreaterThan(-1);
    expect(installPanel).toBeGreaterThan(pulsePanel);
  });

  it("keeps the session flow explorer off the Worker render path", () => {
    const projectDetail = readSource("./projects/[projectId].astro");

    expect(projectDetail).toContain("const flowEvents = selectedEnvironment.recentEvents.slice(0, 80);");
    expect(projectDetail).toContain("<SessionFlowExplorer events={flowEvents} client:only=\"react\" />");
    expect(projectDetail).not.toContain("<SessionFlowExplorer events={flowEvents} client:visible />");
  });

  it("supports production, staging, and development environments", () => {
    const projectDetail = readSource("./projects/[projectId].astro");
    const demoData = readSource("../../lib/sarge-demo.ts");
    const schema = readSource("../../../../apps/api/prisma/schema.prisma");

    expect(projectDetail).toContain("environmentOptions");
    expect(projectDetail).toContain("projectEnvironmentOptions");
    expect(projectDetail).toContain("selectedEnvironmentLabel");
    expect(projectDetail).toContain("selectedEnvironment.pixelUrl");
    expect(projectDetail).toContain("selectedEnvironment.recentEvents");
    expect(projectDetail).toContain('const isAiReviewEnabled = selectedEnvironment.environment === "production";');
    expect(projectDetail).toContain("AI recommendations are available for Production");
    expect(projectDetail).not.toContain("Staging is planned");
    expect(projectDetail).not.toContain("disabled>Staging</button>");

    expect(demoData).toContain("export type ProjectEnvironment = 'production' | 'staging' | 'development';");
    expect(demoData).toContain("export interface SargeProjectEnvironment");
    expect(demoData).toContain("environments: SargeProjectEnvironment[];");
    expect(demoData).toContain("environmentLabels");
    expect(demoData).toContain("production: 'Production'");
    expect(demoData).toContain("staging: 'Staging'");
    expect(demoData).toContain("development: 'Development'");

    expect(schema).toContain("model SiteEnvironment");
    expect(schema).toContain("siteEnvironmentId");
    expect(schema).toContain("@@unique([siteId, environment])");
  });

  it("keeps AI review findings from widening the page", () => {
    const projectDetail = readSource("./projects/[projectId].astro");

    expect(projectDetail).toContain('<Card className="min-w-0 lg:col-span-2" data-ai-review-card>');
    expect(projectDetail).toContain('<CardContent className="grid min-w-0 gap-3">');
    expect(projectDetail).toContain("rounded-md border p-4 min-w-0 overflow-hidden");
    expect(projectDetail).toContain("mt-3 grid min-w-0 gap-3 text-sm md:grid-cols-2");
    expect(projectDetail).toContain("mt-3 max-w-full overflow-x-auto rounded-md border bg-background p-3 text-xs leading-5");
  });

  it("includes a test impersonation helper with copy and live-update hooks", () => {
    const projectDetail = readSource("./projects/[projectId].astro");

    expect(projectDetail).toContain("const projectTesterUserId = buildProjectTesterUserId(selectedEnvironment.id, userId);");
    expect(projectDetail).toContain("const recentUserOptions = buildRecentUserOptions(selectedEnvironment.recentEvents, projectTesterUserId);");
    expect(projectDetail).toContain("data-test-impersonation-card");
    expect(projectDetail).toContain("data-copy-tester-id");
    expect(projectDetail).toContain("data-impersonation-user-input");
    expect(projectDetail).toContain("data-recent-impersonation-user");
    expect(projectDetail).toContain("data-impersonation-code");
    expect(projectDetail).toContain("data-copy-impersonation-code");
    expect(projectDetail).toContain("buildImpersonationConsoleSnippet");
    expect(projectDetail).toContain("updateImpersonationCode");
  });

  it("lets admins manage server-side and postback credentials per environment", () => {
    const projectDetail = readSource("./projects/[projectId].astro");
    const demoData = readSource("../../lib/sarge-demo.ts");

    expect(projectDetail).toContain("createEnvironmentCredential");
    expect(projectDetail).toContain('intent === "rotate-server-credential"');
    expect(projectDetail).toContain('intent === "rotate-postback-token"');
    expect(projectDetail).toContain("Server-side calls");
    expect(projectDetail).toContain("selectedEnvironment.serverEventSecretConfigured");
    expect(projectDetail).toContain("selectedEnvironment.postbackTokenConfigured");
    expect(projectDetail).toContain("data-copy-credential");
    expect(projectDetail).toContain("/v2/server/events");
    expect(projectDetail).toContain("/v2/postback/");

    expect(demoData).toContain("serverEventSecretConfigured: boolean;");
    expect(demoData).toContain("postbackTokenConfigured: boolean;");
    expect(demoData).toContain("export const createEnvironmentCredential");
    expect(demoData).toContain("serverEventSecretHash");
    expect(demoData).toContain("postbackTokenHash");
  });

  it("shows rotated server and postback credentials inside their own rows", () => {
    const projectDetail = readSource("./projects/[projectId].astro");

    expect(projectDetail).toContain("createdServerCredentialToken");
    expect(projectDetail).toContain("createdPostbackCredentialToken");
    expect(projectDetail).toContain("createdServerCredentialCurl");
    expect(projectDetail).toContain("curl -X POST");
    expect(projectDetail).toContain("authorization: Bearer ${createdServerCredentialToken}");
    expect(projectDetail).toContain('"siteId": "${selectedEnvironment.id}"');
    expect(projectDetail).toContain("Server event secret rotated");
    expect(projectDetail).toContain("Postback token rotated");
    expect(projectDetail).not.toContain("createdCredentialName");
    expect(projectDetail).not.toContain("createdCredentialToken &&");
  });

  it("models project shares with view and edit roles", () => {
    const demoData = readSource("../../lib/sarge-demo.ts");
    const schema = readSource("../../../../apps/api/prisma/schema.prisma");

    expect(schema).toContain("model ProjectShare");
    expect(schema).toContain("projectShares");
    expect(schema).toContain("ProjectShare[]");
    expect(schema).toContain('@@unique([siteId, email])');
    expect(schema).toContain('@@index([acceptedUserId])');

    expect(demoData).toContain('export type ProjectShareRole = "view" | "edit";');
    expect(demoData).toContain("export interface ProjectShare");
    expect(demoData).toContain('ownership: "owned" | "shared";');
    expect(demoData).toContain("shareRole?: ProjectShareRole;");
    expect(demoData).toContain("shares: ProjectShare[];");
    expect(demoData).toContain("ownedProjects: SargeProject[];");
    expect(demoData).toContain("sharedProjects: SargeProject[];");
  });

  it("sets up SendGrid-backed project invite mutations", () => {
    const demoData = readSource("../../lib/sarge-demo.ts");
    const mailer = readSource("../../lib/project-invite-email.ts");
    const packageJson = readSource("../../../../www/package.json");

    expect(packageJson).toContain('"@sendgrid/mail"');
    expect(mailer).toContain('@sendgrid/mail');
    expect(mailer).toContain("SENDGRID_API_KEY");
    expect(mailer).toContain("SARGE_EMAIL_FROM");
    expect(mailer).toContain("sendProjectInviteEmail");
    expect(mailer).toContain("Project invite saved, but email was not sent");

    expect(demoData).toContain("export const shareProject");
    expect(demoData).toContain("export const updateProjectShare");
    expect(demoData).toContain("export const removeProjectShare");
    expect(demoData).toContain("normalizeInviteEmail");
  });

  it("renders a project share dialog and gates management controls by project access", () => {
    const projectDetail = readSource("./projects/[projectId].astro");
    const shareDialog = readSource("../../components/ProjectShareDialog.tsx");

    expect(projectDetail).toContain("ProjectShareDialog");
    expect(projectDetail).toContain("canShareProject");
    expect(projectDetail).toContain("canManageProject");
    expect(projectDetail).toContain('intent === "share-project"');
    expect(projectDetail).toContain('intent === "update-project-share"');
    expect(projectDetail).toContain('intent === "remove-project-share"');
    expect(projectDetail).toContain("<ProjectShareDialog");
    expect(projectDetail).toContain("{canShareProject &&");
    expect(projectDetail).toContain("canCreateWebhooks = canManageProject(project)");
    expect(projectDetail).toContain("canManageCredentials = canManageProject(project)");

    expect(shareDialog).toContain("data-project-share-dialog");
    expect(shareDialog).toContain('name="intent" value="share-project"');
    expect(shareDialog).toContain('name="intent" value="update-project-share"');
    expect(shareDialog).toContain('name="intent" value="remove-project-share"');
    expect(shareDialog).toContain('name="role"');
  });

  it("places test impersonation and server-side calls side-by-side above the debug stream", () => {
    const projectDetail = readSource("./projects/[projectId].astro");
    const toolsRow = projectDetail.indexOf('<div class="grid gap-4 lg:col-span-2 xl:grid-cols-2">');
    const impersonationCard = projectDetail.indexOf("data-test-impersonation-card");
    const serverSideCard = projectDetail.indexOf("Server-side calls");
    const debugStreamCard = projectDetail.indexOf("Debug stream");

    expect(toolsRow).toBeGreaterThan(-1);
    expect(impersonationCard).toBeGreaterThan(toolsRow);
    expect(serverSideCard).toBeGreaterThan(impersonationCard);
    expect(debugStreamCard).toBeGreaterThan(serverSideCard);
  });
});
