import { describe, expect, it } from "vitest";
import {
  buildCheckoutSessionParams,
  getStripePriceIdForPlan,
  mapStripeSubscriptionStatus,
  resolvePlanIdForStripePrice,
  type StripeBillingEnv,
} from "./stripe-billing";

const env = {
  STRIPE_PRICE_STARTER: "price_starter",
  STRIPE_PRICE_GROWTH: "price_growth",
  STRIPE_PRICE_SCALE: "price_scale",
} satisfies StripeBillingEnv;

describe("Stripe billing helpers", () => {
  it("maps paid Sarge plans to Stripe price env vars", () => {
    expect(getStripePriceIdForPlan(env, "starter")).toEqual({ success: true, priceId: "price_starter" });
    expect(getStripePriceIdForPlan(env, "growth")).toEqual({ success: true, priceId: "price_growth" });
    expect(getStripePriceIdForPlan(env, "scale")).toEqual({ success: true, priceId: "price_scale" });
  });

  it("does not create checkout for free or enterprise plans", () => {
    expect(getStripePriceIdForPlan(env, "free")).toEqual({
      success: false,
      error: "Free does not require checkout.",
    });
    expect(getStripePriceIdForPlan(env, "enterprise")).toEqual({
      success: false,
      error: "Enterprise billing is handled by sales.",
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
      priceId: "price_scale",
      userId: "user_123",
      workspaceId: "wrk_123",
      planId: "scale",
    });

    expect(params.customer).toBe("cus_123");
    expect(params).not.toHaveProperty("customer_email");
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
