import Stripe from "stripe";
import { NextResponse } from "next/server";
import jwt from "jsonwebtoken";

export const runtime = "nodejs";

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY as string, {
  apiVersion: "2024-06-20",
});

function signToken(payload: any) {
  const secret = process.env.LICENSE_JWT_SECRET;
  if (!secret) throw new Error("Missing LICENSE_JWT_SECRET");
  // 180 days token; user can refresh token any time via success link
  return jwt.sign(payload, secret, { expiresIn: "180d" });
}

export async function POST(req: Request) {
  const { session_id } = await req.json().catch(() => ({}));
  if (!session_id) return NextResponse.json({ ok: false, error: "Missing session_id." }, { status: 400 });

  const session = await stripe.checkout.sessions.retrieve(session_id);

  if (!session?.customer) {
    return NextResponse.json({ ok: false, error: "No customer on session yet. Try again in a moment." }, { status: 400 });
  }

  // Ensure it’s a subscription checkout session
  const customerId = String(session.customer);
  const subscriptionId = session.subscription ? String(session.subscription) : null;

  const token = signToken({
    v: 1,
    customerId,
    subscriptionId,
    createdAt: Date.now(),
  });

  return NextResponse.json({ ok: true, token });
}
