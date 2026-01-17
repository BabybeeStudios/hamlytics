"use client";
import { useState } from "react";

export default function PricingPage() {
  const [loading, setLoading] = useState<string | null>(null);

  async function go(plan: "monthly" | "yearly") {
    try {
      setLoading(plan);
      const r = await fetch("/api/stripe/create-checkout-session", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ plan }),
      });
      const data = await r.json();
      if (!data?.ok || !data?.url) throw new Error(data?.error || "No checkout url");
      window.location.href = data.url;
    } catch (e: any) {
      alert(e?.message || "Failed to start checkout");
    } finally {
      setLoading(null);
    }
  }

  return (
    <main style={{ padding: 24, fontFamily: "system-ui" }}>
      <h1 style={{ fontSize: 28, fontWeight: 900 }}>Hamlytics Pro 🐹💖</h1>
      <p>Unlock deep scan + comparison side panel.</p>

      <div style={{ display: "flex", gap: 12, marginTop: 16, flexWrap: "wrap" }}>
        <button onClick={() => go("monthly")} disabled={!!loading}
          style={{ padding: "10px 14px", borderRadius: 12, fontWeight: 800 }}>
          {loading === "monthly" ? "Loading…" : "Go Pro Monthly"}
        </button>

        <button onClick={() => go("yearly")} disabled={!!loading}
          style={{ padding: "10px 14px", borderRadius: 12, fontWeight: 800 }}>
          {loading === "yearly" ? "Loading…" : "Go Pro Yearly (discount)"}
        </button>
      </div>
    </main>
  );
}
