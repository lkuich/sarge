export type PlanId = "free" | "starter" | "growth" | "scale";

export type PlanFeature =
  | "installPixel"
  | "debugStream"
  | "publicVerify"
  | "basicAffiliateAttribution"
  | "sessionFlowExplorer"
  | "serverEvents"
  | "postbacks"
  | "webhooks"
  | "viewSharing"
  | "editSharing"
  | "aiReview"
  | "exports"
  | "alerts"
  | "configurableAttributionWindow"
  | "clientWorkspaces"
  | "scheduledAiAudits"
  | "apiExport"
  | "dedicatedEndpoint"
  | "sso"
  | "auditLogs"
  | "warehouseSync";

export interface PlanLimits {
  projects: number | null;
  projectShares: number | null;
  eventsPerMonth: number | null;
  retentionDays: number | null;
  serverSecrets: number | null;
  postbackTokens: number | null;
  webhooks: number | null;
}

export interface PlanDefinition {
  id: PlanId;
  name: string;
  monthlyPriceUsd: number | null;
  description: string;
  limits: PlanLimits;
  features: PlanFeature[];
}

export type LimitUsagePromptLevel = "warning" | "urgent" | "blocked";

export interface LimitUsagePrompt {
  level: LimitUsagePromptLevel;
  percentUsed: number;
  targetPlanName: string | null;
  message: string;
}

export interface LimitUsagePromptInput {
  used: number;
  limit: number | null;
  noun: "events" | "projects";
  planId: PlanId;
}

export const planDefinitions: PlanDefinition[] = [
  {
    id: "free",
    name: "Free",
    monthlyPriceUsd: 0,
    description: "Install Sarge, verify events, and debug one project.",
    limits: {
      projects: 1,
      projectShares: 1,
      eventsPerMonth: 50_000,
      retentionDays: 7,
      serverSecrets: 0,
      postbackTokens: 0,
      webhooks: 0,
    },
    features: ["installPixel", "debugStream", "publicVerify", "basicAffiliateAttribution"],
  },
  {
    id: "starter",
    name: "Starter",
    monthlyPriceUsd: 35,
    description: "Small-team tracking validation with basic server and partner callbacks.",
    limits: {
      projects: 3,
      projectShares: 3,
      eventsPerMonth: 250_000,
      retentionDays: 30,
      serverSecrets: 1,
      postbackTokens: 1,
      webhooks: 3,
    },
    features: [
      "installPixel",
      "debugStream",
      "publicVerify",
      "basicAffiliateAttribution",
      "sessionFlowExplorer",
      "serverEvents",
      "postbacks",
      "webhooks",
      "viewSharing",
    ],
  },
  {
    id: "growth",
    name: "Growth",
    monthlyPriceUsd: 149,
    description: "Production diagnostics, exports, and configurable attribution for ecommerce teams.",
    limits: {
      projects: 10,
      projectShares: 10,
      eventsPerMonth: 2_000_000,
      retentionDays: 90,
      serverSecrets: 10,
      postbackTokens: 10,
      webhooks: 10,
    },
    features: [
      "installPixel",
      "debugStream",
      "publicVerify",
      "basicAffiliateAttribution",
      "sessionFlowExplorer",
      "serverEvents",
      "postbacks",
      "webhooks",
      "viewSharing",
      "editSharing",
      "aiReview",
      "exports",
      "alerts",
      "configurableAttributionWindow",
    ],
  },
  {
    id: "scale",
    name: "Scale",
    monthlyPriceUsd: null,
    description: "Custom volume, dedicated infrastructure, security controls, and SLA.",
    limits: {
      projects: null,
      projectShares: null,
      eventsPerMonth: null,
      retentionDays: null,
      serverSecrets: null,
      postbackTokens: null,
      webhooks: null,
    },
    features: [
      "installPixel",
      "debugStream",
      "publicVerify",
      "basicAffiliateAttribution",
      "sessionFlowExplorer",
      "serverEvents",
      "postbacks",
      "webhooks",
      "viewSharing",
      "editSharing",
      "aiReview",
      "exports",
      "alerts",
      "configurableAttributionWindow",
      "clientWorkspaces",
      "scheduledAiAudits",
      "apiExport",
      "dedicatedEndpoint",
      "sso",
      "auditLogs",
      "warehouseSync",
    ],
  },
];

export const getPlanDefinition = (planId: PlanId) =>
  planDefinitions.find((plan) => plan.id === planId) ?? planDefinitions[0];

export const getUpgradeTargetPlan = (planId: PlanId) => {
  const currentIndex = planDefinitions.findIndex((plan) => plan.id === planId);
  if (currentIndex === -1) return planDefinitions[1] ?? null;

  return planDefinitions.slice(currentIndex + 1).find((plan) => plan.id !== "free") ?? null;
};

export const canUseFeature = (planId: PlanId, feature: PlanFeature) =>
  getPlanDefinition(planId).features.includes(feature);

export const formatPlanLimit = (value: number | null, noun: string) => {
  if (value === null) return `Unlimited ${noun}`;
  return `${new Intl.NumberFormat("en-US").format(value)} ${noun}`;
};

export const buildPlanLimitSqlCase = (limit: keyof PlanLimits, planIdExpression: string) => {
  const branches = planDefinitions
    .map((plan) => {
      const value = plan.limits[limit];
      return `WHEN '${plan.id}' THEN ${value === null ? "NULL" : value}`;
    })
    .join("\n            ");

  return `CASE ${planIdExpression}
            ${branches}
            ELSE ${planDefinitions[0].limits[limit]}
          END`;
};

export const buildPlanRetentionFilterSql = (occurredAtExpression: string, planIdExpression: string) => {
  const retentionDaysSqlCase = buildPlanLimitSqlCase("retentionDays", planIdExpression);

  return `(${retentionDaysSqlCase} IS NULL
            OR ${occurredAtExpression} >= NOW() - make_interval(days => ${retentionDaysSqlCase}))`;
};

export const getLimitUsagePrompt = ({ used, limit, noun, planId }: LimitUsagePromptInput): LimitUsagePrompt | null => {
  if (limit === null || limit <= 0) return null;

  const percentUsed = Math.min(100, Math.floor((Math.max(0, used) / limit) * 100));
  if (percentUsed < 80) return null;

  const targetPlanName = getUpgradeTargetPlan(planId)?.name ?? null;
  const level: LimitUsagePromptLevel = percentUsed >= 100 ? "blocked" : percentUsed >= 95 ? "urgent" : "warning";

  if (level === "blocked") {
    return {
      level,
      percentUsed,
      targetPlanName,
      message:
        noun === "events"
          ? "Monthly event limit reached. Upgrade to resume event intake."
          : "Project limit reached. Upgrade to add more projects.",
    };
  }

  if (level === "urgent") {
    return {
      level,
      percentUsed,
      targetPlanName,
      message:
        noun === "events"
          ? "You are close to your event limit. Upgrade before tracking starts rejecting events."
          : "You are close to your project limit. Upgrade before adding the next project.",
    };
  }

  return {
    level,
    percentUsed,
    targetPlanName,
    message: `You have used ${percentUsed}% of your ${noun} limit.`,
  };
};
