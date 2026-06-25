import { describe, expect, it } from "vitest";
import {
  LAUNCHDAY_CODE,
  LAUNCHDAY_COUPON_ID,
  assertLaunchdayCouponMatches,
  buildLaunchdayCouponParams,
  buildLaunchdayPromotionCodeParams,
  getProductIdFromPrice,
} from "./create-launchday-discount.mjs";

describe("Launchday Stripe discount setup", () => {
  it("builds a two-month free Starter coupon restricted to the Starter product", () => {
    expect(buildLaunchdayCouponParams("prod_starter")).toEqual({
      id: LAUNCHDAY_COUPON_ID,
      name: "Sarge Starter LAUNCHDAY - 2 months free",
      percent_off: 100,
      duration: "repeating",
      duration_in_months: 2,
      applies_to: { products: ["prod_starter"] },
      metadata: {
        campaign: "launchday",
        code: LAUNCHDAY_CODE,
        plan: "starter",
        months_free: "2",
      },
    });
  });

  it("builds the customer-facing LAUNCHDAY promotion code", () => {
    expect(buildLaunchdayPromotionCodeParams()).toEqual({
      promotion: {
        type: "coupon",
        coupon: LAUNCHDAY_COUPON_ID,
      },
      code: LAUNCHDAY_CODE,
      active: true,
      metadata: {
        campaign: "launchday",
        plan: "starter",
      },
    });
  });

  it("resolves product ids from retrieved Stripe prices", () => {
    expect(getProductIdFromPrice({ product: "prod_starter" })).toBe("prod_starter");
    expect(getProductIdFromPrice({ product: { id: "prod_starter" } })).toBe("prod_starter");
  });

  it("explains which products a mismatched coupon currently targets", () => {
    expect(() =>
      assertLaunchdayCouponMatches(
        {
          id: LAUNCHDAY_COUPON_ID,
          percent_off: 100,
          duration: "repeating",
          duration_in_months: 2,
          valid: true,
          applies_to: { products: ["prod_other"] },
        },
        "prod_starter",
      ),
    ).toThrow(
      "sarge_starter_launchday_2_months_free is restricted to prod_other, not Starter product prod_starter.",
    );
  });
});
