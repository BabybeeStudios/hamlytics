// app/api/license/validate/route.ts
import { NextResponse } from "next/server";

/**
 * TEMP / MVP LICENSE VALIDATION
 * - Lets you test Pro unlocking immediately with a Founder token.
 * - Later, we'll replace this with real Stripe subscription checks.
 */

export const runtime = "nodejs"; // keep this on Node for easier future Stripe integration

// ✅ Set your founder token(s) here:
const VALID_TOKENS = new Set<string>([
  "HAMLYTICS-FOUNDERS-2026",
  "HAMLYTICS-PRO-TEST-1",
]);

export async function POST(req: Request) {
  try {
    const body = await req.json().catch(() => null);
    const token = String(body?.token || "").trim();

    if (!token) {
      return NextResponse.json(
        { ok: true, pro: false, reason: "missing_token" },
        { status: 200 }
      );
    }

    const pro = VALID_TOKENS.has(token);

    return NextResponse.json(
      {
        ok: true,
        pro,
        reason: pro ? "token_valid" : "token_invalid",
        // You can return extra info later (tier, expiry, customerId, etc.)
      },
      { status: 200 }
    );
  } catch (e: any) {
    return NextResponse.json(
      { ok: false, pro: false, error: String(e?.message || e) },
      { status: 500 }
    );
  }
}
