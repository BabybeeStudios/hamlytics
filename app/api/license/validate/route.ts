import Stripe from "stripe";
import { NextResponse } from "next/server";
import jwt from "jsonwebtoken";

export const runtime = "nodejs";

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY as string, {
  apiVersion: "2024-06-20",
});

function verifyToken(token: string): { customerId: string } | null {
  const secret = process.env.LICENSE_JWT_SECRET;
  if (!secret) throw new Error("Missing LICENSE_JWT_SECRET");
  try {
    const decoded: any = jwt.verify(token, secret);
    if (!decoded?.customerId) return null;
    return { customerId: String(decoded.customerId) };
  } catch {
    return null;
  }
}

export async function POST(req: Request) {
  const { token } = await req.json().catch(() => ({}));
  if (!token) return NextResponse.json({ ok: false, pro: false, error: "Missing token." }, { status: 400 });

  const v = verifyToken(token);
  if (!v) return NextResponse.json({ ok: true, pro: false });

  const subs = await stripe.subscriptions.list({
    customer: v.customerId,
    status: "all",
    limit: 10,
  });

  const active = subs.data.some((s) =>
    ["active", "trialing"].includes(s.status)
  );

  return NextResponse.json({ ok: true, pro: active });
}
