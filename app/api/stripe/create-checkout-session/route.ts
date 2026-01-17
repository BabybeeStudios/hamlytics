import { NextResponse } from "next/server";
import Stripe from "stripe";

export const runtime = "nodejs";

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY || "", {
  apiVersion: "2024-06-20",
});

export async function POST(req: Request) {
  try {
    const body = await req.json().catch(() => ({}));
    const plan = String(body?.plan || "monthly");

    const appBase = process.env.APP_BASE_URL;
    if (!appBase) return NextResponse.json({ ok: false, error: "APP_BASE_URL missing" }, { status: 500 });

    const priceId =
      plan === "yearly" ? process.env.STRIPE_PRICE_YEARLY : process.env.STRIPE_PRICE_MONTHLY;

    if (!priceId) {
      return NextResponse.json({ ok: false, error: "Missing Stripe price ID env var" }, { status: 500 });
    }

    const session = await stripe.checkout.sessions.create({
      mode: "subscription",
      line_items: [{ price: priceId, quantity: 1 }],
      allow_promotion_codes: true,
      success_url: `${appBase}/success?session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: `${appBase}/cancel`,
    });

    return NextResponse.json({ ok: true, url: session.url }, { status: 200 });
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: e?.message || "Failed" }, { status: 500 });
  }
}
