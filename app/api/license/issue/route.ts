import Stripe from "stripe";
import jwt from "jsonwebtoken";

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
    const { sessionId } = await req.json().catch(() => ({}));

    if (!sessionId || typeof sessionId !== "string") {
      return Response.json({ ok: false, error: "Missing sessionId" }, { status: 400 });
    }

    const JWT_SECRET = required("JWT_SECRET");

    // Retrieve checkout session
    const session = await stripe.checkout.sessions.retrieve(sessionId);

    // Confirm it’s a completed paid checkout
    const paid =
      session.payment_status === "paid" &&
      (session.status === "complete" || session.status === "open" || session.status === "expired"); // Stripe varies; paid is key

    if (!paid) {
      return Response.json(
        { ok: false, error: "Checkout not paid or not complete yet." },
        { status: 401 }
      );
    }

    // Basic identity
    const email =
      session.customer_details?.email ||
      (typeof session.customer_email === "string" ? session.customer_email : "") ||
      "";

    const customerId = typeof session.customer === "string" ? session.customer : "";

    // Optional: include plan from metadata if you set it
    const plan = (session.metadata?.plan as string) || "pro";

    // Issue token (valid for 30 days; adjust if you want)
    const token = jwt.sign(
      {
        pro: true,
        plan,
        email,
        customerId,
        sid: session.id,
      },
      JWT_SECRET,
      { expiresIn: "30d" }
    );

    return Response.json({ ok: true, token });
  } catch (e: any) {
    return Response.json(
      { ok: false, error: e?.message || String(e) },
      { status: 500 }
    );
  }
}
