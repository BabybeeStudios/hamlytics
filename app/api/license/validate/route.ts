import { NextResponse } from "next/server";

export const runtime = "nodejs";

/**
 * CORS NOTE
 * Chrome extensions trigger a preflight OPTIONS for JSON POST.
 * We must:
 * 1) return Access-Control-Allow-Origin
 * 2) return Access-Control-Allow-Methods/Headers
 * 3) implement OPTIONS handler
 *
 * SECURITY:
 * - Ideally restrict to your extension ID origin(s)
 * - You can add more IDs later if you publish a store version (ID will change)
 */

// ✅ Put your CURRENT extension ID here:
const EXTENSION_ID = "dgbihamapbcaengkhajjempfiijnbhfc";

// Allowed origins (extension + local dev)
const ALLOWED_ORIGINS = new Set<string>([
  `chrome-extension://${EXTENSION_ID}`,
  "http://localhost:3000",
]);

function corsHeaders(req: Request) {
  const origin = req.headers.get("origin") || "";
  const allowOrigin = ALLOWED_ORIGINS.has(origin) ? origin : "";

  // If origin isn't allowed, we still respond, but without allow-origin.
  // The browser will block it (as intended).
  return {
    "Access-Control-Allow-Origin": allowOrigin,
    "Access-Control-Allow-Methods": "POST, GET, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type, Authorization",
    "Access-Control-Max-Age": "86400",
  };
}

// ✅ Founder tokens (temporary for testing)
const VALID_TOKENS = new Set<string>([
  "HAMLYTICS-FOUNDERS-2026",
  "HAMLYTICS-PRO-TEST-1",
]);

export async function OPTIONS(req: Request) {
  // Preflight response
  return new NextResponse(null, { status: 204, headers: corsHeaders(req) });
}

export async function GET(req: Request) {
  return NextResponse.json(
    {
      ok: true,
      message:
        "Hamlytics license endpoint is live. Send POST JSON { token: '...' } to validate.",
    },
    { status: 200, headers: corsHeaders(req) }
  );
}

export async function POST(req: Request) {
  try {
    const body = await req.json().catch(() => null);
    const token = String(body?.token || "").trim();

    const pro = token ? VALID_TOKENS.has(token) : false;

    return NextResponse.json(
      {
        ok: true,
        pro,
        reason: token ? (pro ? "token_valid" : "token_invalid") : "missing_token",
      },
      { status: 200, headers: corsHeaders(req) }
    );
  } catch (e: any) {
    return NextResponse.json(
      { ok: false, pro: false, error: String(e?.message || e) },
      { status: 500, headers: corsHeaders(req) }
    );
  }
}
