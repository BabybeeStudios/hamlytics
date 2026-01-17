"use client";

import { useMemo, useState } from "react";

type Plan = "monthly" | "yearly";

export default function PricingPage() {
  const [loading, setLoading] = useState<Plan | null>(null);

  // ✅ Match Stripe prices
  const PRICES = useMemo(
    () => ({
      monthly: { price: 8.99, label: "$8.99", suffix: "/month" },
      yearly: { price: 49.99, label: "$49.99", suffix: "/year" },
    }),
    []
  );

  const yearlySavings = useMemo(() => {
    const m = PRICES.monthly.price * 12;
    const y = PRICES.yearly.price;
    return Math.round(((m - y) / m) * 100);
  }, [PRICES]);

  async function startCheckout(plan: Plan) {
    try {
      setLoading(plan);
      const r = await fetch("/api/stripe/create-checkout-session", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ plan }),
      });
      const data = await r.json();
      if (!data?.ok || !data?.url) throw new Error(data?.error || "Checkout failed.");
      window.location.href = data.url;
    } catch (e: any) {
      alert(e?.message || "Could not start checkout.");
    } finally {
      setLoading(null);
    }
  }

  return (
    <main className="min-h-screen bg-[radial-gradient(900px_480px_at_0%_0%,rgba(167,139,250,0.18),transparent_55%),radial-gradient(800px_460px_at_100%_0%,rgba(255,79,163,0.18),transparent_60%),radial-gradient(900px_520px_at_40%_100%,rgba(52,211,153,0.10),transparent_60%)] bg-[#fff7fb] text-slate-800">
      <div className="mx-auto max-w-5xl px-5 py-10">

        {/* Header */}
        <div className="flex flex-col items-center text-center">
          <div className="inline-flex items-center gap-3 rounded-2xl border border-black/10 bg-white/75 px-4 py-2 shadow-lg">
            <div className="grid h-10 w-10 place-items-center rounded-xl border border-black/10 bg-[linear-gradient(135deg,rgba(255,79,163,0.28),rgba(255,79,163,0.10))] text-lg">
              🐹
            </div>
            <div className="text-left">
              <div className="text-sm font-extrabold">Hamlytics</div>
              <div className="text-xs text-slate-600">TikTok Profile Analyzer</div>
            </div>
          </div>

          <h1 className="mt-6 text-4xl font-black">
            Upgrade to <span className="text-pink-500">Hamlytics Pro</span>
          </h1>

          <p className="mt-3 max-w-2xl text-base text-slate-700">
            Get deeper insights, higher scan limits, and side-by-side profile comparisons.
            Built for creators, brands, and anyone who wants real TikTok signal — fast.
          </p>

          <div className="mt-4 inline-flex flex-wrap gap-2 justify-center">
            <Pill>🐹 Cute & powerful</Pill>
            <Pill>📊 Deeper stats</Pill>
            <Pill>📦 CSV / JSON exports</Pill>
            <Pill>🔒 Pro-only features</Pill>
          </div>
        </div>

        {/* Pricing */}
        <div className="mt-10 grid gap-5 md:grid-cols-3">

          {/* Free */}
          <Card>
            <CardTitle>
              <span>Free</span>
              <Badge>Starter</Badge>
            </CardTitle>

            <div className="mt-2 text-4xl font-black">$0</div>
            <div className="mt-1 text-sm text-slate-600">Quick checks & previews.</div>

            <ul className="mt-5 space-y-2 text-sm">
              <Feature>View counts (fast scan)</Feature>
              <Feature>Top-20 sorting</Feature>
              <Feature>Basic summary stats</Feature>
              <Feature>Export preview (CSV / JSON)</Feature>
              <Feature className="opacity-60">Likes + comments</Feature>
              <Feature className="opacity-60">Side panel compare</Feature>
            </ul>

            <div className="mt-6">
              <button className="w-full rounded-2xl border border-black/10 bg-white/60 px-4 py-3 font-extrabold">
                Stay Free 🐹
              </button>
            </div>
          </Card>

          {/* Monthly */}
          <Card highlight>
            <CardTitle>
              <span>Pro Monthly</span>
              <BadgePink>Flexible</BadgePink>
            </CardTitle>

            <div className="mt-2 flex items-end gap-2">
              <div className="text-4xl font-black">{PRICES.monthly.label}</div>
              <div className="pb-1 text-sm text-slate-600">{PRICES.monthly.suffix}</div>
            </div>

            <div className="mt-1 text-sm text-slate-700">
              Perfect if you’re testing Pro features.
            </div>

            <ul className="mt-5 space-y-2 text-sm">
              <Feature><b>Deep Scan</b> (views, likes, comments)</Feature>
              <Feature>Higher scan limits</Feature>
              <Feature>Side panel comparison</Feature>
              <Feature>Full CSV / JSON exports</Feature>
              <Feature>Pro badge in extension</Feature>
            </ul>

            <div className="mt-6">
              <button
                disabled={loading !== null}
                onClick={() => startCheckout("monthly")}
                className="w-full rounded-2xl bg-[linear-gradient(135deg,#ff4fa3,#a78bfa)] px-4 py-3 font-extrabold text-white shadow-lg disabled:opacity-60"
              >
                {loading === "monthly" ? "Starting…" : "Go Pro Monthly 💖"}
              </button>
              <p className="mt-2 text-xs text-center text-slate-600">Cancel anytime</p>
            </div>
          </Card>

          {/* Yearly */}
          <Card>
            <CardTitle>
              <span>Pro Yearly</span>
              <Badge>Best deal</Badge>
            </CardTitle>

            <div className="mt-2 flex items-end gap-2">
              <div className="text-4xl font-black">{PRICES.yearly.label}</div>
              <div className="pb-1 text-sm text-slate-600">{PRICES.yearly.suffix}</div>
            </div>

            <div className="mt-1 text-sm text-pink-600 font-bold">
              Save {yearlySavings}% — over 5 months free 🐹✨
            </div>

            <ul className="mt-5 space-y-2 text-sm">
              <Feature>Everything in Pro Monthly</Feature>
              <Feature>Massive yearly discount</Feature>
              <Feature>Best for brands & power users</Feature>
            </ul>

            <div className="mt-6">
              <button
                disabled={loading !== null}
                onClick={() => startCheckout("yearly")}
                className="w-full rounded-2xl bg-[linear-gradient(135deg,#ff4fa3,#a78bfa)] px-4 py-3 font-extrabold text-white shadow-lg disabled:opacity-60"
              >
                {loading === "yearly" ? "Starting…" : "Go Pro Yearly 🌸"}
              </button>
              <p className="mt-2 text-xs text-center text-slate-600">
                $4.17/month billed yearly
              </p>
            </div>
          </Card>
        </div>

        <div className="mt-10 text-center text-xs text-slate-600">
          © {new Date().getFullYear()} Hamlytics • powered by hamster energy 🐹💖
        </div>
      </div>
    </main>
  );
}

/* ---------- Components ---------- */

function Card({ children, highlight = false }: any) {
  return (
    <div className={`rounded-2xl border border-black/10 bg-white/75 p-5 shadow-lg ${highlight ? "ring-2 ring-pink-300" : ""}`}>
      {children}
    </div>
  );
}

function CardTitle({ children }: any) {
  return <div className="flex items-center justify-between">{children}</div>;
}

function Badge({ children }: any) {
  return <span className="rounded-full bg-white/70 px-3 py-1 text-xs font-extrabold">{children}</span>;
}

function BadgePink({ children }: any) {
  return <span className="rounded-full bg-pink-100 px-3 py-1 text-xs font-extrabold text-pink-600">{children}</span>;
}

function Feature({ children, className = "" }: any) {
  return (
    <li className={`flex gap-2 ${className}`}>
      <span className="text-pink-400 font-black">✓</span>
      <span>{children}</span>
    </li>
  );
}

function Pill({ children }: any) {
  return <span className="rounded-full bg-white/70 px-3 py-1 text-xs font-extrabold">{children}</span>;
}
