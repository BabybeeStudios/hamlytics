import Stripe from "stripe";

export const runtime = "nodejs";

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY || "", {
  apiVersion: "2024-06-20",
});

function requireEnv(name: string) {
  const v = process.env[name];
  if (!v) throw new Error(`Missing env var: ${name}`);
  return v;
}

export async function POST(req: Request) {
  try {
    const APP_URL = requireEnv("APP_URL");
    const STRIPE_PRICE_MONTHLY = requireEnv("STRIPE_PRICE_MONTHLY");
    const STRIPE_PRICE_YEARLY = requireEnv("STRIPE_PRICE_YEARLY");
    requireEnv("STRIPE_SECRET_KEY");

    const body = await req.json().catch(() => ({}));
    const plan = body?.plan === "yearly" ? "yearly" : "monthly";

    const price =
      plan === "yearly" ? STRIPE_PRICE_YEARLY : STRIPE_PRICE_MONTHLY;

    const session = await stripe.checkout.sessions.create({
      mode: "subscription",
      line_items: [{ price, quantity: 1 }],
      allow_promotion_codes: true,
      success_url: `${APP_URL}/success?session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: `${APP_URL}/pricing`,
    });

    return Response.json({ ok: true, url: session.url });
  } catch (e: any) {
    return Response.json(
      { ok: false, error: e?.message || String(e) },
      { status: 500 }
    );
  }
}
