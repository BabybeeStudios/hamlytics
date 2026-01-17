import Stripe from "stripe";

export const runtime = "nodejs";

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY as string, {
  apiVersion: "2024-06-20",
});

function required(name: string) {
  const v = process.env[name];
  if (!v) throw new Error(`Missing env var: ${name}`);
  return v;
}

export async function POST(req: Request) {
  try {
    const { plan } = await req.json().catch(() => ({}));
    const APP_URL = required("APP_URL");

    // ✅ Put your Stripe Price IDs here:
    const PRICE_MONTHLY = required("STRIPE_PRICE_MONTHLY");
    const PRICE_YEARLY = required("STRIPE_PRICE_YEARLY");

    const price =
      plan === "yearly" ? PRICE_YEARLY :
      plan === "monthly" ? PRICE_MONTHLY :
      null;

    if (!price) {
      return Response.json({ ok: false, error: "Invalid plan" }, { status: 400 });
    }

    const session = await stripe.checkout.sessions.create({
      mode: "subscription",
      line_items: [{ price, quantity: 1 }],
      success_url: `${APP_URL}/success?session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: `${APP_URL}/pricing?canceled=1`,
      metadata: { plan: String(plan || "") },
      allow_promotion_codes: true,
    });

    return Response.json({ ok: true, url: session.url });
  } catch (e: any) {
    return Response.json(
      { ok: false, error: e?.message || String(e) },
      { status: 500 }
    );
  }
}
