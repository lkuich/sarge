import { pathToFileURL } from "node:url";

export const LAUNCHDAY_CODE = "LAUNCHDAY";
export const LAUNCHDAY_COUPON_ID = "sarge_starter_launchday_2_months_free";

export const buildLaunchdayCouponParams = (starterProductId) => {
  if (typeof starterProductId !== "string" || starterProductId.trim().length === 0) {
    throw new Error("Starter product id is required.");
  }

  return {
    id: LAUNCHDAY_COUPON_ID,
    name: "Sarge Starter LAUNCHDAY - 2 months free",
    percent_off: 100,
    duration: "repeating",
    duration_in_months: 2,
    applies_to: { products: [starterProductId] },
    metadata: {
      campaign: "launchday",
      code: LAUNCHDAY_CODE,
      plan: "starter",
      months_free: "2",
    },
  };
};

export const buildLaunchdayPromotionCodeParams = () => ({
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

export const getProductIdFromPrice = (price) => {
  const product = price?.product;
  if (typeof product === "string" && product.trim().length > 0) return product;
  if (product && typeof product.id === "string" && product.id.trim().length > 0) return product.id;

  throw new Error("Stripe price does not include a product id.");
};

export const createLaunchdayDiscount = async ({ stripe, starterPriceId }) => {
  if (!stripe) throw new Error("Stripe client is required.");
  if (typeof starterPriceId !== "string" || starterPriceId.trim().length === 0) {
    throw new Error("STRIPE_PRICE_STARTER is required.");
  }

  const starterPrice = await stripe.prices.retrieve(starterPriceId, { expand: ["product"] });
  const starterProductId = getProductIdFromPrice(starterPrice);
  const couponResult = await retrieveOrCreateLaunchdayCoupon(stripe, starterProductId);
  const promotionCodeResult = await retrieveOrCreateLaunchdayPromotionCode(stripe);

  return {
    starterPriceId,
    starterProductId,
    coupon: couponResult.coupon,
    couponCreated: couponResult.created,
    promotionCode: promotionCodeResult.promotionCode,
    promotionCodeCreated: promotionCodeResult.created,
  };
};

const retrieveOrCreateLaunchdayCoupon = async (stripe, starterProductId) => {
  try {
    const coupon = await stripe.coupons.retrieve(LAUNCHDAY_COUPON_ID);
    const mismatch = getLaunchdayCouponMismatch(coupon, starterProductId);
    if (!mismatch) return { coupon, created: false };

    if (coupon.times_redeemed === 0) {
      await stripe.coupons.del(LAUNCHDAY_COUPON_ID);
      const recreatedCoupon = await stripe.coupons.create(buildLaunchdayCouponParams(starterProductId));
      return { coupon: recreatedCoupon, created: true };
    }

    throw new Error(
      `${mismatch} The existing coupon has already been redeemed ${coupon.times_redeemed} time(s), so the script will not delete it automatically.`,
    );
  } catch (error) {
    if (!isStripeMissingResourceError(error)) throw error;
  }

  const coupon = await stripe.coupons.create(buildLaunchdayCouponParams(starterProductId));
  return { coupon, created: true };
};

const retrieveOrCreateLaunchdayPromotionCode = async (stripe) => {
  const existingCodes = await stripe.promotionCodes.list({
    code: LAUNCHDAY_CODE,
    active: true,
    limit: 100,
  });
  const matchingCode = existingCodes.data.find((promotionCode) => {
    const coupon = promotionCode.promotion?.coupon;
    return typeof coupon === "string" ? coupon === LAUNCHDAY_COUPON_ID : coupon?.id === LAUNCHDAY_COUPON_ID;
  });

  if (matchingCode) return { promotionCode: matchingCode, created: false };

  if (existingCodes.data.length > 0) {
    throw new Error(`An active ${LAUNCHDAY_CODE} promotion code already exists for a different coupon.`);
  }

  const promotionCode = await stripe.promotionCodes.create(buildLaunchdayPromotionCodeParams());
  return { promotionCode, created: true };
};

export const assertLaunchdayCouponMatches = (coupon, starterProductId) => {
  const mismatch = getLaunchdayCouponMismatch(coupon, starterProductId);
  if (mismatch) throw new Error(mismatch);
};

const getLaunchdayCouponMismatch = (coupon, starterProductId) => {
  if (coupon.deleted) return `${LAUNCHDAY_COUPON_ID} exists in Stripe but is deleted.`;
  if (coupon.percent_off !== 100) return `${LAUNCHDAY_COUPON_ID} must be 100% off.`;
  if (coupon.duration !== "repeating") return `${LAUNCHDAY_COUPON_ID} must repeat for a fixed period.`;
  if (coupon.duration_in_months !== 2) return `${LAUNCHDAY_COUPON_ID} must last 2 months.`;
  if (!coupon.valid) return `${LAUNCHDAY_COUPON_ID} exists in Stripe but is not valid.`;

  const products = coupon.applies_to?.products ?? [];
  if (!products.includes(starterProductId)) {
    const currentProducts = products.length > 0 ? products.join(", ") : "no products";
    return `${LAUNCHDAY_COUPON_ID} is restricted to ${currentProducts}, not Starter product ${starterProductId}.`;
  }

  return null;
};

const isStripeMissingResourceError = (error) => error?.code === "resource_missing" || error?.statusCode === 404;

const main = async () => {
  const secretKey = process.env.STRIPE_SECRET_KEY?.trim();
  const starterPriceId = process.env.STRIPE_PRICE_STARTER?.trim();

  if (!secretKey) throw new Error("STRIPE_SECRET_KEY is required.");
  if (!starterPriceId) throw new Error("STRIPE_PRICE_STARTER is required.");

  const { default: Stripe } = await import("stripe");
  const stripe = new Stripe(secretKey, {
    apiVersion: "2026-06-24.dahlia",
    maxNetworkRetries: 2,
  });
  const result = await createLaunchdayDiscount({ stripe, starterPriceId });

  console.log([
    `${LAUNCHDAY_CODE} is ready for Starter checkout.`,
    `Starter price: ${result.starterPriceId}`,
    `Starter product: ${result.starterProductId}`,
    `Coupon: ${result.coupon.id} (${result.couponCreated ? "created" : "reused"})`,
    `Promotion code: ${result.promotionCode.id} (${result.promotionCodeCreated ? "created" : "reused"})`,
  ].join("\n"));
};

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((error) => {
    console.error(error instanceof Error ? error.message : error);
    process.exitCode = 1;
  });
}
