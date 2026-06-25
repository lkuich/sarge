import { neon } from "@neondatabase/serverless";
import Stripe from "stripe";
import { getPlanDefinition, type PlanId } from "./pricing";

export interface StripeBillingEnv {
  STRIPE_SECRET_KEY?: string;
  STRIPE_WEBHOOK_SECRET?: string;
  STRIPE_PRICE_STARTER?: string;
  STRIPE_PRICE_GROWTH?: string;
}

export type BillingStatus = "active" | "past_due" | "canceled";

export interface WorkspaceBillingProfile {
  id: string;
  name: string;
  ownerUserId: string;
  planId: PlanId;
  billingStatus: BillingStatus;
  stripeCustomerId: string | null;
  stripeSubscriptionId: string | null;
  stripePriceId: string | null;
}

export type BillingActionResult =
  | { success: true; url: string }
  | { success: false; error: string };

type SqlClient = ReturnType<typeof neon>;

const paidPlanPriceEnv: Partial<Record<PlanId, keyof StripeBillingEnv>> = {
  starter: "STRIPE_PRICE_STARTER",
  growth: "STRIPE_PRICE_GROWTH",
};

export const createStripeClient = (secretKey: string) =>
  new Stripe(secretKey, {
    apiVersion: "2026-06-24.dahlia",
    typescript: true,
    maxNetworkRetries: 2,
  });

export const getStripePriceIdForPlan = (
  env: StripeBillingEnv,
  planId: PlanId,
): { success: true; priceId: string } | { success: false; error: string } => {
  if (planId === "free") {
    return { success: false, error: "Free does not require checkout." };
  }
  if (planId === "scale") {
    return { success: false, error: "Scale billing is handled by sales." };
  }

  const envName = paidPlanPriceEnv[planId];
  const priceId = envName ? env[envName]?.trim() : "";
  if (!priceId) {
    return { success: false, error: `${getPlanDefinition(planId).name} checkout is not configured.` };
  }

  return { success: true, priceId };
};

export const resolvePlanIdForStripePrice = (env: StripeBillingEnv, priceId: string | null | undefined): PlanId | null => {
  if (!priceId) return null;

  for (const [planId, envName] of Object.entries(paidPlanPriceEnv) as [PlanId, keyof StripeBillingEnv][]) {
    if (env[envName] === priceId) return planId;
  }

  return null;
};

export const buildCheckoutSessionParams = (input: {
  appUrl: string;
  customerEmail: string | null;
  customerId: string | null;
  priceId: string;
  userId: string;
  workspaceId: string;
  planId: PlanId;
}): Stripe.Checkout.SessionCreateParams => {
  const appUrl = normalizeAppUrl(input.appUrl);
  const metadata = {
    workspaceId: input.workspaceId,
    userId: input.userId,
    planId: input.planId,
  };
  const params: Stripe.Checkout.SessionCreateParams = {
    mode: "subscription",
    allow_promotion_codes: true,
    client_reference_id: input.workspaceId,
    line_items: [{ price: input.priceId, quantity: 1 }],
    metadata,
    subscription_data: { metadata },
    success_url: `${appUrl}/app/billing?checkout=success`,
    cancel_url: `${appUrl}/app/billing?checkout=canceled`,
  };

  if (input.customerId) {
    params.customer = input.customerId;
  } else if (input.customerEmail) {
    params.customer_email = input.customerEmail;
  }

  return params;
};

export const mapStripeSubscriptionStatus = (status: string): BillingStatus => {
  if (status === "active" || status === "trialing") return "active";
  if (status === "canceled" || status === "incomplete_expired") return "canceled";
  return "past_due";
};

export const createCheckoutSession = async (input: {
  env: StripeBillingEnv;
  databaseUrl?: string;
  userId: string;
  customerEmail: string | null;
  appUrl: string;
  planId: PlanId;
}): Promise<BillingActionResult> => {
  const stripeSecretKey = input.env.STRIPE_SECRET_KEY?.trim();
  if (!stripeSecretKey) return { success: false, error: "Stripe billing is not configured." };
  if (!input.databaseUrl) return { success: false, error: "DATABASE_URL is not configured." };

  const price = getStripePriceIdForPlan(input.env, input.planId);
  if (!price.success) return price;

  const workspace = await getWorkspaceBillingProfile(input.userId, input.databaseUrl);
  if (!workspace) return { success: false, error: "Create your workspace before choosing a plan." };

  const stripe = createStripeClient(stripeSecretKey);
  const session = await stripe.checkout.sessions.create(
    buildCheckoutSessionParams({
      appUrl: input.appUrl,
      customerEmail: input.customerEmail,
      customerId: workspace.stripeCustomerId,
      priceId: price.priceId,
      userId: input.userId,
      workspaceId: workspace.id,
      planId: input.planId,
    }),
  );

  if (!session.url) return { success: false, error: "Stripe did not return a Checkout URL." };
  return { success: true, url: session.url };
};

export const createBillingPortalSession = async (input: {
  env: StripeBillingEnv;
  databaseUrl?: string;
  userId: string;
  appUrl: string;
}): Promise<BillingActionResult> => {
  const stripeSecretKey = input.env.STRIPE_SECRET_KEY?.trim();
  if (!stripeSecretKey) return { success: false, error: "Stripe billing is not configured." };
  if (!input.databaseUrl) return { success: false, error: "DATABASE_URL is not configured." };

  const workspace = await getWorkspaceBillingProfile(input.userId, input.databaseUrl);
  if (!workspace) return { success: false, error: "Create your workspace before managing billing." };
  if (!workspace.stripeCustomerId) {
    return { success: false, error: "Start a paid plan before opening the billing portal." };
  }

  const stripe = createStripeClient(stripeSecretKey);
  const session = await stripe.billingPortal.sessions.create({
    customer: workspace.stripeCustomerId,
    return_url: `${normalizeAppUrl(input.appUrl)}/app/billing`,
  });

  return { success: true, url: session.url };
};

export const getWorkspaceBillingProfile = async (
  userId: string,
  databaseUrl?: string,
): Promise<WorkspaceBillingProfile | null> => {
  if (!databaseUrl) return null;

  const sql = neon(databaseUrl);
  const rows = (await sql`
    SELECT
      id,
      name,
      "ownerUserId",
      "planId",
      "billingStatus",
      "stripeCustomerId",
      "stripeSubscriptionId",
      "stripePriceId"
    FROM "Workspace"
    WHERE "ownerUserId" = ${userId}
    LIMIT 1
  `) as WorkspaceBillingProfile[];

  return rows.at(0) ?? null;
};

export const handleStripeWebhookEvent = async (
  event: Stripe.Event,
  env: StripeBillingEnv,
  databaseUrl?: string,
) => {
  if (!databaseUrl) throw new Error("DATABASE_URL is not configured.");

  const sql = neon(databaseUrl);
  switch (event.type) {
    case "checkout.session.completed":
      await syncCheckoutSession(sql, event.data.object as Stripe.Checkout.Session, env);
      break;
    case "customer.subscription.created":
    case "customer.subscription.updated":
      await syncSubscription(sql, event.data.object as Stripe.Subscription, env, false);
      break;
    case "customer.subscription.deleted":
      await syncSubscription(sql, event.data.object as Stripe.Subscription, env, true);
      break;
    case "invoice.payment_failed":
    case "invoice.payment_action_required":
      await markSubscriptionPastDue(sql, event.data.object as Stripe.Invoice);
      break;
  }
};

const syncCheckoutSession = async (sql: SqlClient, session: Stripe.Checkout.Session, env: StripeBillingEnv) => {
  if (session.mode !== "subscription") return;

  const workspaceId = getMetadataValue(session.metadata, "workspaceId") ?? session.client_reference_id;
  const planId = normalizePlanId(getMetadataValue(session.metadata, "planId"));
  if (!workspaceId || !planId || planId === "free" || planId === "scale") return;

  const customerId = getStripeId(session.customer);
  const subscriptionId = getStripeId(session.subscription);
  const price = getStripePriceIdForPlan(env, planId);
  const priceId = price.success ? price.priceId : null;

  await sql`
    UPDATE "Workspace"
    SET
      "planId" = ${planId},
      "billingStatus" = 'active',
      "stripeCustomerId" = COALESCE(${customerId}, "stripeCustomerId"),
      "stripeSubscriptionId" = COALESCE(${subscriptionId}, "stripeSubscriptionId"),
      "stripePriceId" = COALESCE(${priceId}, "stripePriceId")
    WHERE id = ${workspaceId}
  `;
};

const syncSubscription = async (
  sql: SqlClient,
  subscription: Stripe.Subscription,
  env: StripeBillingEnv,
  isDeleted: boolean,
) => {
  const subscriptionId = subscription.id;
  const customerId = getStripeId(subscription.customer);
  const priceId = subscription.items.data.at(0)?.price.id ?? null;
  const planId = isDeleted
    ? "free"
    : normalizePlanId(getMetadataValue(subscription.metadata, "planId")) ?? resolvePlanIdForStripePrice(env, priceId);
  const workspaceId = getMetadataValue(subscription.metadata, "workspaceId");
  const billingStatus = isDeleted ? "canceled" : mapStripeSubscriptionStatus(subscription.status);

  if (!planId) return;
  if (workspaceId) {
    await sql`
      UPDATE "Workspace"
      SET
        "planId" = ${planId},
        "billingStatus" = ${billingStatus},
        "stripeCustomerId" = COALESCE(${customerId}, "stripeCustomerId"),
        "stripeSubscriptionId" = ${subscriptionId},
        "stripePriceId" = COALESCE(${priceId}, "stripePriceId")
      WHERE id = ${workspaceId}
    `;
    return;
  }

  await sql`
    UPDATE "Workspace"
    SET
      "planId" = ${planId},
      "billingStatus" = ${billingStatus},
      "stripeCustomerId" = COALESCE(${customerId}, "stripeCustomerId"),
      "stripePriceId" = COALESCE(${priceId}, "stripePriceId")
    WHERE "stripeSubscriptionId" = ${subscriptionId}
  `;
};

const markSubscriptionPastDue = async (sql: SqlClient, invoice: Stripe.Invoice) => {
  const customerId = getStripeId(invoice.customer);
  const subscriptionId = getInvoiceSubscriptionId(invoice);

  if (subscriptionId) {
    await sql`
      UPDATE "Workspace"
      SET "billingStatus" = 'past_due'
      WHERE "stripeSubscriptionId" = ${subscriptionId}
    `;
    return;
  }

  if (customerId) {
    await sql`
      UPDATE "Workspace"
      SET "billingStatus" = 'past_due'
      WHERE "stripeCustomerId" = ${customerId}
    `;
  }
};

const normalizeAppUrl = (appUrl: string) => {
  const parsedUrl = new URL(appUrl);
  return parsedUrl.origin;
};

const normalizePlanId = (value: string | null | undefined): PlanId | null => {
  if (value === "free" || value === "starter" || value === "growth" || value === "scale") {
    return value;
  }

  return null;
};

const getMetadataValue = (metadata: Stripe.Metadata | null | undefined, key: string) => {
  const value = metadata?.[key];
  return typeof value === "string" && value.trim() ? value : null;
};

const getStripeId = (value: string | { id?: string } | null | undefined) => {
  if (typeof value === "string") return value;
  return typeof value?.id === "string" ? value.id : null;
};

const getInvoiceSubscriptionId = (invoice: Stripe.Invoice) => {
  const parentSubscriptionDetails = invoice.parent?.subscription_details;
  if (parentSubscriptionDetails?.subscription) return getStripeId(parentSubscriptionDetails.subscription);

  const legacySubscription = (invoice as Stripe.Invoice & { subscription?: string | { id?: string } | null }).subscription;
  return getStripeId(legacySubscription);
};
