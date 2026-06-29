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

  it("surfaces custom domain guidance and a minified pixel download for CORS-sensitive installs", () => {
    const projectDetail = readSource("./projects/[projectId].astro");
    const newProject = readSource("./projects/new.astro");
    const demoData = readSource("../../lib/sarge-demo.ts");
    const schema = readSource("../../../../apps/api/prisma/schema.prisma");

    expect(projectDetail).toContain("const trackingDomain = resolveSargeTrackingDomain(customDomain);");
    expect(projectDetail).toContain("const customDomainPixelDownloadUrl = buildCustomPixelDownloadUrl(pixelUrl, trackingDomain);");
    expect(projectDetail).toContain("const customDomain = project.customDomain;");
    expect(projectDetail).toContain("const displayedTrackingDomain = trackingDomain;");
    expect(projectDetail).toContain("const customDomainPixelUrl = `https://${trackingDomain}/pixel.js?env=${encodeURIComponent(selectedEnvironment.id)}`;");
    expect(projectDetail).toContain("data-custom-domain-guidance");
    expect(projectDetail).toContain("Sarge tracking subdomain");
    expect(projectDetail).toContain("CNAME");
    expect(projectDetail).not.toContain("Mapped environment");
    expect(projectDetail).toContain("CORS-sensitive");
    expect(projectDetail).toContain("data-download-custom-domain-pixel-script");
    expect(projectDetail).toContain('download="sarge-custom-domain-pixel.min.js"');
    expect(projectDetail).not.toContain("data-download-pixel-script");
    expect(projectDetail).not.toContain('download="sarge-pixel.min.js"');
    expect(newProject).toContain('name="domain"');
    expect(newProject).toContain("Site domain");
    expect(newProject).toContain("required");
    expect(newProject).not.toContain('name="slug"');
    expect(demoData).toContain("customDomain: string;");
    expect(demoData).toContain("buildSargeTrackingDomain(siteDomain)");
    expect(schema).toContain("customDomain          String              @unique");
    expect(schema).not.toContain("slug                  String");
  });

  it("links the custom domain from the project title", () => {
    const projectDetail = readSource("./projects/[projectId].astro");
    const appLayout = readSource("../../layouts/AppLayout.astro");

    expect(projectDetail).toContain("const customDomainHeadingLink = {");
    expect(projectDetail).toContain("label: customDomain,");
    expect(projectDetail).toContain("href: `https://${displayedTrackingDomain}`,");
    expect(projectDetail).toContain("headingLink={customDomainHeadingLink}");
    expect(appLayout).toContain("headingLink?: HeadingLink;");
    expect(appLayout).toContain("{headingLink && (");
    expect(appLayout).toContain('href={headingLink.href}');
    expect(appLayout).toContain("{headingLink.label}");
  });

  it("uses the tracked site domain in affiliate capture link examples", () => {
    const projectDetail = readSource("./projects/[projectId].astro");

    expect(projectDetail).toContain("const trackedSiteDomain = resolveTrackedSiteDomain(customDomain);");
    expect(projectDetail).toContain("const affiliateCaptureUrl = `https://${trackedSiteDomain}/?sarge_ref=summer-campaign&sarge_aff=partner-42`;");
    expect(projectDetail).toContain('<pre class="whitespace-pre-wrap break-all rounded-md border bg-muted p-3 font-mono text-xs leading-5"><code>{affiliateCaptureUrl}</code></pre>');
    expect(projectDetail).not.toContain("https://shop.example.com/?sarge_ref=summer-campaign");
  });

  it("includes affiliate attribution fields in event streams and event details", () => {
    const projectDetail = readSource("./projects/[projectId].astro");
    const demoData = readSource("../../lib/sarge-demo.ts");

    expect(demoData).toContain("ref?: string;");
    expect(demoData).toContain("affiliate?: string;");
    expect(demoData).toContain("e.ref,");
    expect(demoData).toContain("e.affiliate,");
    expect(demoData).toContain("const attribution = readSargeAttributionFromUrl(event.url);");
    expect(demoData).toContain("ref: event.ref ?? attribution.ref,");
    expect(demoData).toContain("affiliate: event.affiliate ?? attribution.affiliate,");
    expect(projectDetail).toContain("Ref/Campaign");
    expect(projectDetail).toContain("{event.ref ?? \"Not captured\"}");
    expect(projectDetail).toContain("Affiliate");
    expect(projectDetail).toContain("{event.affiliate ?? \"Not captured\"}");
  });

  it("uses site ids for project sharing instead of project slugs", () => {
    const projectDetail = readSource("./projects/[projectId].astro");
    const demoData = readSource("../../lib/sarge-demo.ts");

    expect(projectDetail).toContain("project.siteId,");
    expect(projectDetail).not.toContain("project.slug,");
    expect(demoData).toContain("getOwnedSiteById");
    expect(demoData).not.toContain("getOwnedSiteBySlug");
  });

  it("keeps slug-derived scoped hosts out of the install details card", () => {
    const projectDetail = readSource("./projects/[projectId].astro");

    expect(projectDetail).toContain("{displayedTrackingDomain}");
    expect(projectDetail).not.toContain("<p class=\"font-mono\">{selectedEnvironment.endpointHost}</p>");
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
    const demoData = readSource("../../lib/sarge-demo.ts");
    const pulsePanel = projectDetail.indexOf("data-project-pulse");
    const installPanel = projectDetail.indexOf("data-install-pixel-details");

    expect(projectDetail).toContain("const eventTypeMix = selectedEnvironment.eventMix24h;");
    expect(projectDetail).toContain("const eventVolumeDelta = buildMetricDelta(selectedEnvironment.eventCount24h, selectedEnvironment.previousEventCount24h);");
    expect(projectDetail).toContain("const recentSessionDelta = buildMetricDelta(selectedEnvironment.sessionCount24h, selectedEnvironment.previousSessionCount24h);");
    expect(projectDetail).toContain("const recentUserDelta = buildMetricDelta(selectedEnvironment.userCount24h, selectedEnvironment.previousUserCount24h);");
    expect(projectDetail).toContain("const weeklyTrafficChart = buildTrafficTrendChart(selectedEnvironment.trafficTrend7d);");
    expect(projectDetail).toContain("formatCount,");
    expect(projectDetail).toContain("Project pulse");
    expect(projectDetail).toContain("Event mix");
    expect(projectDetail).toContain("Last 24h vs previous 24h");
    expect(projectDetail).toContain("Sessions");
    expect(projectDetail).toContain("Users");
    expect(projectDetail).toContain("Weekly traffic");
    expect(projectDetail).toContain("Events received by day");
    expect(projectDetail).toContain("buildTrafficTrendChart");
    expect(projectDetail).toContain("renderMetricDelta");
    expect(projectDetail).toContain("formatMetricDeltaTitle");
    expect(projectDetail).toContain("data-project-pulse");
    expect(projectDetail).toContain("data-project-traffic-trend");
    expect(projectDetail).not.toContain("data-project-pulse-summary");
    expect(projectDetail).not.toContain("data-event-pulse-bars");
    expect(projectDetail).not.toContain("function buildEventPulseBars");
    expect(demoData).toContain('COUNT(e.id) FILTER (WHERE e."occurredAt" >= NOW() - INTERVAL \'48 hours\' AND e."occurredAt" < NOW() - INTERVAL \'24 hours\')::int AS "previousEventCount24h"');
    expect(demoData).toContain('"eventMix24h"');
    expect(demoData).toContain('"trafficTrend7d"');
    expect(demoData).toContain("normalizeTrafficTrend");
    expect(demoData).toContain("previousEventCount24h: environment.previousEventCount24h ?? 0");
    expect(demoData).toContain("sessionCount24h: environment.sessionCount24h ?? 0");
    expect(demoData).toContain("userCount24h: environment.userCount24h ?? 0");
    expect(pulsePanel).toBeGreaterThan(-1);
    expect(installPanel).toBeGreaterThan(pulsePanel);
  });

  it("keeps the session flow explorer off the Worker render path", () => {
    const projectDetail = readSource("./projects/[projectId].astro");

    expect(projectDetail).toContain("const flowEvents = selectedEnvironment.recentEvents.slice(0, 80);");
    expect(projectDetail).toContain("const flowEventsEndpoint = `${debugStreamEndpoint}?limit=80`;");
    expect(projectDetail).toContain("<SessionFlowExplorer events={flowEvents} refreshEndpoint={flowEventsEndpoint} client:only=\"react\" />");
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
    expect(projectDetail).toContain('const isAiReviewEnabled = selectedEnvironment.environment === "production" && canUseAiReview;');
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
    expect(demoData).toContain("serverSecretLimitSqlCase");
    expect(demoData).toContain("postbackTokenLimitSqlCase");
    expect(demoData).toContain("Upgrade to add more server event secrets.");
    expect(demoData).toContain("Upgrade to add more postback tokens.");
    expect(demoData).toContain('te."serverEventSecretHash" IS NOT NULL');
    expect(demoData).toContain('te."postbackTokenHash" IS NOT NULL');
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

  it("sets up Cloudflare Email-backed project invite mutations", () => {
    const demoData = readSource("../../lib/sarge-demo.ts");
    const mailer = readSource("../../lib/project-invite-email.ts");
    const packageJson = readSource("../../../../www/package.json");
    const wranglerConfig = readSource("../../../../www/wrangler.jsonc");
    const projectDetail = readSource("./projects/[projectId].astro");

    expect(packageJson).not.toContain('"@sendgrid/mail"');
    expect(wranglerConfig).toContain('"send_email"');
    expect(wranglerConfig).toContain('"name": "EMAIL"');
    expect(projectDetail).toContain("emailSender: env.EMAIL");
    expect(mailer).toContain("emailSender");
    expect(mailer).toContain("Cloudflare Email");
    expect(mailer).not.toContain('@sendgrid/mail');
    expect(mailer).not.toContain("SENDGRID_API_KEY");
    expect(mailer).toContain("SARGE_EMAIL_FROM");
    expect(mailer).toContain("sendProjectInviteEmail");
    expect(mailer).toContain("sendProjectAccessNotificationEmail");
    expect(mailer).toContain("Project invite saved, but email was not sent");

    expect(demoData).toContain("export const shareProject");
    expect(demoData).toContain("export const updateProjectShare");
    expect(demoData).toContain("export const removeProjectShare");
    expect(demoData).toContain("sendProjectAccessNotificationEmail");
    expect(demoData).toContain("normalizeInviteEmail");
  });

  it("enforces project share limits from the owning workspace plan", () => {
    const demoData = readSource("../../lib/sarge-demo.ts");
    const projectDetail = readSource("./projects/[projectId].astro");

    expect(demoData).toContain("const projectShareLimitSqlCase");
    expect(demoData).toContain('COUNT(ps.id)::int AS "shareCount"');
    expect(demoData).toContain("Project share limit reached. Upgrade to invite more people.");
    expect(demoData).toContain("existingShareId");
    expect(projectDetail).toContain("const projectShareLimit = account.plan.limits.projectShares;");
    expect(projectDetail).toContain("const projectShareCount = project.shares.length;");
    expect(projectDetail).toContain("shareLimit={projectShareLimit}");
    expect(projectDetail).toContain("shareCount={projectShareCount}");
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
    expect(projectDetail).toContain("canCreateWebhooks = canManageProject(project) && canUseWebhooks");
    expect(projectDetail).toContain("canManageCredentials = canManageProject(project) && (canUseServerEvents || canUsePostbacks)");

    expect(shareDialog).toContain("data-project-share-dialog");
    expect(shareDialog).toContain('name="intent" value="share-project"');
    expect(shareDialog).toContain('name="intent" value="update-project-share"');
    expect(shareDialog).toContain('name="intent" value="remove-project-share"');
    expect(shareDialog).toContain('name="role"');
    expect(shareDialog).toContain("Shared user limit");
    expect(shareDialog).toContain("shareLimitReached");
    expect(shareDialog).toContain('href="/app/billing"');
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

  it("polls the debug stream without a full page refresh", () => {
    const projectDetail = readSource("./projects/[projectId].astro");
    const eventStreamApi = readSource("../api/project-events/[environmentId].ts");

    expect(projectDetail).toContain("const debugStreamEndpoint = `/api/project-events/${selectedEnvironment.id}`;");
    expect(projectDetail).toContain("data-live-debug-stream");
    expect(projectDetail).toContain("data-events-endpoint={debugStreamEndpoint}");
    expect(projectDetail).toContain("setInterval(refreshDebugStream, 2000)");
    expect(projectDetail).toContain("renderDebugEvents");
    expect(projectDetail).not.toContain("window.location.reload()");

    expect(eventStreamApi).toContain("Astro.locals.auth()");
    expect(eventStreamApi).toContain('headers: { "Cache-Control": "no-store" }');
    expect(eventStreamApi).toContain('Astro.url.searchParams.get("limit")');
    expect(eventStreamApi).toContain("selectedEnvironment.recentEvents.slice(0, limit)");
  });

  it("shows affiliate tracking and latent conversion windows in the project view", () => {
    const projectDetail = readSource("./projects/[projectId].astro");
    const demoData = readSource("../../lib/sarge-demo.ts");

    expect(demoData).toContain("attributionTtlDays: number;");
    expect(demoData).toContain("attributionTtlDays: environment.attributionTtlDays");
    expect(projectDetail).toContain("const attributionWindowDays = selectedEnvironment.attributionTtlDays;");
    expect(projectDetail).toContain("data-affiliate-tracking-card");
    expect(projectDetail).toContain("Affiliate tracking");
    expect(projectDetail).toContain("Latent conversion window");
    expect(projectDetail).toContain("sarge_ref");
    expect(projectDetail).toContain("sarge_aff");
    expect(projectDetail).toContain("{attributionWindowDays} days");
    expect(projectDetail).toContain("affiliate.conversion");
    expect(projectDetail).toContain("postbackEndpointTemplate");
    expect(projectDetail).toContain('Replace <code class="font-mono">{"{postbackToken}"}</code> with the token created in Tracking credentials above.');
  });

  it("gates paid project detail features by plan entitlements", () => {
    const projectDetail = readSource("./projects/[projectId].astro");

    expect(projectDetail).toContain('canUseFeature(account.planId, "aiReview")');
    expect(projectDetail).toContain('canUseFeature(account.planId, "webhooks")');
    expect(projectDetail).toContain('canUseFeature(account.planId, "serverEvents")');
    expect(projectDetail).toContain('canUseFeature(account.planId, "postbacks")');
    expect(projectDetail).toContain("AI review is available on Growth and higher");
    expect(projectDetail).toContain("Webhooks are available on Starter and higher");
    expect(projectDetail).toContain("Server-side calls are available on Starter and higher");
  });

  it("documents affiliate tracking and latent conversions in the tracking client guide", () => {
    const trackingGuide = readSource("../../../../docs/TRACKING_CLIENT.md");
    const installGuide = readSource("../../../../docs/INSTALLATION.md");
    const publicInstallGuide = readSource("../../../../www/public/docs/install.md");

    expect(trackingGuide).toContain("## Affiliate Tracking");
    expect(trackingGuide).toContain("Latent conversions");
    expect(trackingGuide).toContain("default window is 28 days");
    expect(trackingGuide).toContain("sarge_ref");
    expect(trackingGuide).toContain("sarge_aff");
    expect(trackingGuide).toContain("affiliate.conversion");
    expect(trackingGuide).toContain("https://track.sargetrack.app/v2/postback/{siteEnvironmentId}/{postbackToken}");
    expect(installGuide).toContain("environment attribution window");
    expect(installGuide).toContain("defaults to 28 days");
    expect(installGuide).toContain("affiliate.conversion");
    expect(publicInstallGuide).toContain("environment attribution window");
    expect(publicInstallGuide).toContain("defaults to 28 days");
    expect(publicInstallGuide).toContain("affiliate.conversion");
  });

  it("requires short-lived verification links instead of permanent public event stream URLs", () => {
    const projectDetail = readSource("./projects/[projectId].astro");
    const verifyPage = readSource("../verify/[siteId].astro");
    const demoData = readSource("../../lib/sarge-demo.ts");

    expect(projectDetail).toContain("createPublicVerificationLink");
    expect(projectDetail).toContain('intent === "create-public-verification-link"');
    expect(projectDetail).toContain("createdPublicVerificationUrl");
    expect(projectDetail).toContain("Create 30-minute verify link");
    expect(projectDetail).toContain("expires in 30 minutes");
    expect(projectDetail).not.toContain('href={publicVerifyUrl}');

    expect(verifyPage).toContain('Astro.url.searchParams.get("key")');
    expect(verifyPage).toContain("getPublicEventStream(siteId, verificationKey, env.DATABASE_URL)");
    expect(verifyPage).toContain("Verification link unavailable");

    expect(demoData).toContain("export const createPublicVerificationLink");
    expect(demoData).toContain("verificationKey: string | null");
    expect(demoData).toContain("sha256Hex(verificationKey)");
    expect(demoData).toContain('"expiresAt" > NOW()');
    expect(demoData).toContain("expiresAt: new Date(Date.now() + 30 * 60 * 1000)");
  });
});
