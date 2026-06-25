import { env } from "cloudflare:workers";
import Stripe from "stripe";
import type { APIRoute } from "astro";
import { createStripeClient, handleStripeWebhookEvent } from "@/lib/stripe-billing";

export const prerender = false;

export const POST: APIRoute = async ({ request }) => {
  const stripeSecretKey = env.STRIPE_SECRET_KEY?.trim();
  const webhookSecret = env.STRIPE_WEBHOOK_SECRET?.trim();
  const signature = request.headers.get("stripe-signature");

  if (!stripeSecretKey || !webhookSecret) {
    return new Response(JSON.stringify({ error: "Stripe webhook is not configured." }), { status: 500 });
  }
  if (!signature) {
    return new Response(JSON.stringify({ error: "Missing Stripe signature." }), { status: 400 });
  }

  const stripe = createStripeClient(stripeSecretKey);
  const body = await request.text();
  let event: Stripe.Event;

  try {
    event = await stripe.webhooks.constructEventAsync(
      body,
      signature,
      webhookSecret,
      undefined,
      Stripe.createSubtleCryptoProvider(),
    );
  } catch (error) {
    console.error("Invalid Stripe webhook signature", error);
    return new Response(JSON.stringify({ error: "Invalid Stripe signature." }), { status: 400 });
  }

  try {
    await handleStripeWebhookEvent(event, env, env.DATABASE_URL);
  } catch (error) {
    console.error("Unable to process Stripe webhook event", error);
    return new Response(JSON.stringify({ error: "Webhook processing failed." }), { status: 500 });
  }

  return new Response(JSON.stringify({ received: true }), {
    status: 200,
    headers: { "content-type": "application/json" },
  });
};
