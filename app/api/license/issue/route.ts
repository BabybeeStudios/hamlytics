import { NextResponse } from "next/server";
import jwt from "jsonwebtoken";

export const runtime = "nodejs";

export async function POST(req: Request) {
  try {
    const body = await req.json().catch(() => null);

    const adminSecret = process.env.ADMIN_ISSUE_SECRET;
    const jwtSecret = process.env.JWT_SECRET;

    if (!adminSecret || !jwtSecret) {
      return NextResponse.json(
        { ok: false, error: "Missing ADMIN_ISSUE_SECRET or JWT_SECRET" },
        { status: 500 }
      );
    }

    const provided = String(body?.adminSecret || "");
    if (provided !== adminSecret) {
      return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
    }

    const email = String(body?.email || "").trim() || undefined;

    const token = jwt.sign(
      { pro: true, email: email || undefined, iat: Math.floor(Date.now() / 1000) },
      jwtSecret,
      { expiresIn: "30d" }
    );

    return NextResponse.json({ ok: true, token }, { status: 200 });
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: e?.message || "Failed" }, { status: 500 });
  }
}
