import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  buildCheckoutSessionParams,
  createCheckoutSession,
  getStripePriceIdForPlan,
  mapStripeSubscriptionStatus,
  resolvePlanIdForStripePrice,
  type StripeBillingEnv,
} from "./stripe-billing";

const stripeCheckoutSessionsCreate = vi.hoisted(() => vi.fn());
const neonQuery = vi.hoisted(() => vi.fn());

vi.mock("@neondatabase/serverless", () => ({
  neon: vi.fn(() => neonQuery),
}));

vi.mock("stripe", () => ({
  default: vi.fn(function StripeMock() {
    return {
      checkout: {
        sessions: {
          create: stripeCheckoutSessionsCreate,
        },
      },
    };
  }),
}));

const env = {
  STRIPE_SECRET_KEY: "sk_test_123",
  STRIPE_PRICE_STARTER: "price_starter",
  STRIPE_PRICE_GROWTH: "price_growth",
} satisfies StripeBillingEnv;

describe("Stripe billing helpers", () => {
  beforeEach(() => {
    stripeCheckoutSessionsCreate.mockReset();
    neonQuery.mockReset();
  });

  it("maps paid Sarge plans to Stripe price env vars", () => {
    expect(getStripePriceIdForPlan(env, "starter")).toEqual({ success: true, priceId: "price_starter" });
    expect(getStripePriceIdForPlan(env, "growth")).toEqual({ success: true, priceId: "price_growth" });
  });

  it("does not create checkout for free or scale plans", () => {
    expect(getStripePriceIdForPlan(env, "free")).toEqual({
      success: false,
      error: "Free does not require checkout.",
    });
    expect(getStripePriceIdForPlan(env, "scale")).toEqual({
      success: false,
      error: "Scale billing is handled by sales.",
    });
  });

  it("resolves webhook subscription prices back to Sarge plans", () => {
    expect(resolvePlanIdForStripePrice(env, "price_growth")).toBe("growth");
    expect(resolvePlanIdForStripePrice(env, "price_unknown")).toBeNull();
  });

  it("builds subscription Checkout Sessions with workspace metadata", () => {
    expect(
      buildCheckoutSessionParams({
        appUrl: "https://sargetrack.app/",
        customerEmail: "owner@example.com",
        customerId: null,
        priceId: "price_growth",
        userId: "user_123",
        workspaceId: "wrk_123",
        planId: "growth",
      }),
    ).toMatchObject({
      mode: "subscription",
      allow_promotion_codes: true,
      customer_email: "owner@example.com",
      line_items: [{ price: "price_growth", quantity: 1 }],
      success_url: "https://sargetrack.app/app/billing?checkout=success",
      cancel_url: "https://sargetrack.app/app/billing?checkout=canceled",
      client_reference_id: "wrk_123",
      metadata: {
        workspaceId: "wrk_123",
        userId: "user_123",
        planId: "growth",
      },
      subscription_data: {
        metadata: {
          workspaceId: "wrk_123",
          userId: "user_123",
          planId: "growth",
        },
      },
    });
  });

  it("uses existing Stripe customers instead of customer email when available", () => {
    const params = buildCheckoutSessionParams({
      appUrl: "https://sargetrack.app",
      customerEmail: "owner@example.com",
      customerId: "cus_123",
      priceId: "price_growth",
      userId: "user_123",
      workspaceId: "wrk_123",
      planId: "growth",
    });

    expect(params.customer).toBe("cus_123");
    expect(params).not.toHaveProperty("customer_email");
  });

  it("returns a billing error when Stripe cannot create checkout", async () => {
    neonQuery.mockResolvedValue([
      {
        id: "wrk_123",
        name: "Acme",
        ownerUserId: "user_123",
        planId: "free",
        billingStatus: "active",
        stripeCustomerId: null,
        stripeSubscriptionId: null,
        stripePriceId: null,
      },
    ]);
    stripeCheckoutSessionsCreate.mockRejectedValue(new Error("No such price: price_starter"));

    await expect(
      createCheckoutSession({
        env,
        databaseUrl: "postgres://example",
        userId: "user_123",
        customerEmail: "owner@example.com",
        appUrl: "https://sargetrack.app/app/billing",
        planId: "starter",
      }),
    ).resolves.toEqual({
      success: false,
      error: "Stripe could not start checkout. Check the configured Starter price in Stripe.",
    });
  });

  it("retries checkout without a saved customer when Stripe reports the customer belongs to another mode", async () => {
    neonQuery.mockResolvedValue([
      {
        id: "wrk_123",
        name: "Acme",
        ownerUserId: "user_123",
        planId: "free",
        billingStatus: "active",
        stripeCustomerId: "cus_test_mode",
        stripeSubscriptionId: null,
        stripePriceId: null,
      },
    ]);
    stripeCheckoutSessionsCreate
      .mockRejectedValueOnce(
        new Error(
          "No such customer: 'cus_test_mode'; a similar object exists in test mode, but a live mode key was used to make this request.",
        ),
      )
      .mockResolvedValueOnce({ url: "https://checkout.stripe.com/live-session" });

    await expect(
      createCheckoutSession({
        env,
        databaseUrl: "postgres://example",
        userId: "user_123",
        customerEmail: "owner@example.com",
        appUrl: "https://sargetrack.app/app/billing",
        planId: "starter",
      }),
    ).resolves.toEqual({
      success: true,
      url: "https://checkout.stripe.com/live-session",
    });

    expect(stripeCheckoutSessionsCreate).toHaveBeenCalledTimes(2);
    expect(stripeCheckoutSessionsCreate.mock.calls[0]?.[0]).toMatchObject({
      customer: "cus_test_mode",
    });
    expect(stripeCheckoutSessionsCreate.mock.calls[1]?.[0]).toMatchObject({
      customer_email: "owner@example.com",
    });
    expect(stripeCheckoutSessionsCreate.mock.calls[1]?.[0]).not.toHaveProperty("customer");
  });

  it("normalizes Stripe subscription statuses to Sarge billing statuses", () => {
    expect(mapStripeSubscriptionStatus("active")).toBe("active");
    expect(mapStripeSubscriptionStatus("trialing")).toBe("active");
    expect(mapStripeSubscriptionStatus("past_due")).toBe("past_due");
    expect(mapStripeSubscriptionStatus("unpaid")).toBe("past_due");
    expect(mapStripeSubscriptionStatus("canceled")).toBe("canceled");
    expect(mapStripeSubscriptionStatus("incomplete_expired")).toBe("canceled");
  });
});
