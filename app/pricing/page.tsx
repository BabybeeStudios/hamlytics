import Link from "next/link";

export default function PricingPage() {
  return (
    <main style={{ padding: 40, fontFamily: "system-ui", maxWidth: 900, margin: "0 auto" }}>
      <h1 style={{ marginBottom: 8 }}>Hamlytics Pro</h1>
      <p style={{ opacity: 0.8, marginTop: 0 }}>
        Upgrade to unlock deep scan (likes + comments), comparison features, higher scan limits, and more.
      </p>

      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16, marginTop: 24 }}>
        <div style={{ border: "1px solid rgba(0,0,0,0.12)", borderRadius: 14, padding: 16 }}>
          <h2 style={{ marginTop: 0 }}>Monthly</h2>
          <div style={{ fontSize: 28, fontWeight: 800 }}>$9<span style={{ fontSize: 14, fontWeight: 600 }}>/mo</span></div>
          <ul>
            <li>Deep scan full stats</li>
            <li>Compare profiles</li>
            <li>Higher scan limits</li>
            <li>Exports (CSV/JSON)</li>
          </ul>
          <form action="/api/stripe/create-checkout-session" method="POST">
            <input type="hidden" name="plan" value="monthly" />
            <button style={btnPrimary}>Subscribe Monthly</button>
          </form>
        </div>

        <div style={{ border: "1px solid rgba(0,0,0,0.12)", borderRadius: 14, padding: 16 }}>
          <h2 style={{ marginTop: 0 }}>Yearly</h2>
          <div style={{ fontSize: 28, fontWeight: 800 }}>$59<span style={{ fontSize: 14, fontWeight: 600 }}>/yr</span></div>
          <div style={{ fontSize: 12, opacity: 0.75, marginBottom: 10 }}>Save ~45% vs monthly</div>
          <ul>
            <li>Everything in Pro</li>
            <li>Best value</li>
          </ul>
          <form action="/api/stripe/create-checkout-session" method="POST">
            <input type="hidden" name="plan" value="yearly" />
            <button style={btnPrimary}>Subscribe Yearly</button>
          </form>
        </div>
      </div>

      <p style={{ marginTop: 24, fontSize: 12, opacity: 0.7 }}>
        Not affiliated with TikTok. Terms apply.
      </p>

      <div style={{ marginTop: 18 }}>
        <Link href="/">← Back</Link>
      </div>
    </main>
  );
}

const btnPrimary: React.CSSProperties = {
  marginTop: 10,
  padding: "10px 14px",
  borderRadius: 12,
  border: "none",
  cursor: "pointer",
  fontWeight: 800,
  color: "white",
  background: "linear-gradient(135deg, #ff4fa3, #a78bfa)",
};
