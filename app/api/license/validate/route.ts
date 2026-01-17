import jwt from "jsonwebtoken";

export const runtime = "nodejs";

function corsHeaders(origin: string | null) {
  // For extensions, origin looks like: chrome-extension://<id>
  // We allow it broadly to avoid CORS pain.
  const allowOrigin = origin || "*";
  return {
    "Access-Control-Allow-Origin": allowOrigin,
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type, Authorization",
    "Access-Control-Max-Age": "86400",
    "Vary": "Origin",
  };
}

function requireEnv(name: string) {
  const v = process.env[name];
  if (!v) throw new Error(`Missing env var: ${name}`);
  return v;
}

export async function OPTIONS(req: Request) {
  return new Response(null, { status: 204, headers: corsHeaders(req.headers.get("origin")) });
}

export async function POST(req: Request) {
  const origin = req.headers.get("origin");
  const headers = corsHeaders(origin);

  try {
    const JWT_SECRET = requireEnv("JWT_SECRET");

    const body = await req.json().catch(() => ({}));
    const token = String(body?.token || "").trim();

    if (!token) {
      return Response.json({ ok: false, pro: false, error: "Missing token" }, { status: 400, headers });
    }

    let payload: any;
    try {
      payload = jwt.verify(token, JWT_SECRET);
    } catch (err: any) {
      return Response.json(
        { ok: false, pro: false, error: err?.message || "Invalid token" },
        { status: 401, headers }
      );
    }

    // You can add extra checks here (exp, plan, etc.)
    return Response.json({ ok: true, pro: true, payload }, { status: 200, headers });
  } catch (e: any) {
    return Response.json(
      { ok: false, pro: false, error: e?.message || String(e) },
      { status: 500, headers }
    );
  }
}
