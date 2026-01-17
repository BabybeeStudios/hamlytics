import { NextResponse } from "next/server";
import Stripe from "stripe";
import jwt from "jsonwebtoken";

export const runtime = "nodejs";

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY || "", {
  apiVersion: "2024-06-20",
});

export async function POST(req: Request) {
  try {
    const body = await req.json().catch(() => null);
    const sessionId = String(body?.session_id || "").trim();

    const jwtSecret = process.env.JWT_SECRET;
    if (!jwtSecret) return NextResponse.json({ ok: false, error: "JWT_SECRET missing" }, { status: 500 });

    if (!sessionId) return NextResponse.json({ ok: false, error: "Missing session_id" }, { status: 400 });

    const session = await stripe.checkout.sessions.retrieve(sessionId, {
      expand: ["subscription", "customer"],
    });

    // Basic safety checks
    if (session.mode !== "subscription") {
      return NextResponse.json({ ok: false, error: "Not a subscription session" }, { status: 400 });
    }

    const customerId =
      typeof session.customer === "string"
        ? session.customer
        : session.customer?.id;

    const email = session.customer_details?.email || session.customer_email || undefined;

    if (!customerId) {
      return NextResponse.json({ ok: false, error: "No customer on session" }, { status: 400 });
    }

    // Issue a Pro token (30d here; you can change to longer)
    const token = jwt.sign(
      {
        pro: true,
        sub: customerId,
        email,
        iat: Math.floor(Date.now() / 1000),
      },
      jwtSecret,
      { expiresIn: "30d" }
    );

    return NextResponse.json({ ok: true, token }, { status: 200 });
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: e?.message || "Failed" }, { status: 500 });
  }
}
