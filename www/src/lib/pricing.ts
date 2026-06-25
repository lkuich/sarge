export type PlanId = "free" | "starter" | "growth" | "scale" | "enterprise";

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

export const planDefinitions: PlanDefinition[] = [
  {
    id: "free",
    name: "Free",
    monthlyPriceUsd: 0,
    description: "Install Sarge, verify events, and debug one project.",
    limits: {
      projects: 1,
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
    monthlyPriceUsd: 49,
    description: "Small-team tracking validation with basic server and partner callbacks.",
    limits: {
      projects: 3,
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
    monthlyPriceUsd: 399,
    description: "Agency and multi-brand controls with deeper retention and automation.",
    limits: {
      projects: 25,
      eventsPerMonth: 10_000_000,
      retentionDays: 180,
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
    ],
  },
  {
    id: "enterprise",
    name: "Enterprise",
    monthlyPriceUsd: null,
    description: "Custom volume, dedicated infrastructure, security controls, and SLA.",
    limits: {
      projects: null,
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
