import Stripe from "stripe";
import { NextResponse } from "next/server";

export const runtime = "nodejs";

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY as string, {
  apiVersion: "2024-06-20",
});

export async function POST(req: Request) {
  const sig = req.headers.get("stripe-signature");
  const whsec = process.env.STRIPE_WEBHOOK_SECRET;

  if (!sig || !whsec) {
    return NextResponse.json({ ok: false, error: "Missing webhook signature/secret." }, { status: 400 });
  }

  const rawBody = await req.text();

  let event: Stripe.Event;
  try {
    event = stripe.webhooks.constructEvent(rawBody, sig, whsec);
  } catch (err: any) {
    return NextResponse.json({ ok: false, error: `Webhook signature verification failed: ${err.message}` }, { status: 400 });
  }

  // For now, we simply acknowledge. (Your validate endpoint checks Stripe directly.)
  // You can add logging/analytics later.
  // Events we expect: checkout.session.completed, customer.subscription.* , invoice.*
  return NextResponse.json({ ok: true, received: event.type });
}
