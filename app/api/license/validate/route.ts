import { NextResponse } from "next/server";
import jwt from "jsonwebtoken";

export const runtime = "nodejs";

function corsHeaders(origin?: string) {
  // You can lock this down later to your extension origin:
  // const allowed = "chrome-extension://YOUR_EXTENSION_ID";
  // const allowOrigin = origin === allowed ? origin : "null";
  return {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type",
    "Access-Control-Max-Age": "86400",
  };
}

export async function OPTIONS(req: Request) {
  return new NextResponse(null, { status: 204, headers: corsHeaders(req.headers.get("origin") || undefined) });
}

export async function POST(req: Request) {
  const origin = req.headers.get("origin") || undefined;

  try {
    const body = await req.json().catch(() => null);
    const token = String(body?.token || "").trim();

    if (!token) {
      return NextResponse.json(
        { ok: false, pro: false, error: "Missing token" },
        { status: 400, headers: corsHeaders(origin) }
      );
    }

    const secret = process.env.JWT_SECRET;
    if (!secret) {
      return NextResponse.json(
        { ok: false, pro: false, error: "Server misconfigured: JWT_SECRET missing" },
        { status: 500, headers: corsHeaders(origin) }
      );
    }

    // Token payload shape we use:
    // { pro: true, sub: "stripe_customer_id"?, email? }
    const payload = jwt.verify(token, secret) as any;

    const pro = !!payload?.pro;

    return NextResponse.json(
      { ok: true, pro, payload: { sub: payload?.sub || null, email: payload?.email || null } },
      { status: 200, headers: corsHeaders(origin) }
    );
  } catch (e: any) {
    return NextResponse.json(
      { ok: false, pro: false, error: e?.message || "Invalid token" },
      { status: 401, headers: corsHeaders(origin) }
    );
  }
}
