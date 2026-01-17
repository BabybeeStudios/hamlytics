"use client";

import { useEffect, useMemo, useState } from "react";

export default function SuccessPage() {
  const [status, setStatus] = useState<string>("Finalizing your Pro unlock…");
  const [token, setToken] = useState<string>("");

  const sessionId = useMemo(() => {
    if (typeof window === "undefined") return "";
    const params = new URLSearchParams(window.location.search);
    return params.get("session_id") || "";
  }, []);

  useEffect(() => {
    async function run() {
      if (!sessionId) {
        setStatus("Missing session_id. If you just paid, return to Stripe success page.");
        return;
      }
      try {
        const r = await fetch("/api/license/issue", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ session_id: sessionId }),
        });
        const j = await r.json();
        if (!j?.ok) {
          setStatus(j?.error || "Could not issue Pro token.");
          return;
        }
        setToken(j.token);
        setStatus("✅ Pro token issued! Copy this into the extension to unlock Pro.");
      } catch (e: any) {
        setStatus("Network error issuing token.");
      }
    }
    run();
  }, [sessionId]);

  async function copy() {
    if (!token) return;
    await navigator.clipboard.writeText(token);
    setStatus("Copied! Now paste it into the Hamlytics extension → Pro Token.");
  }

  return (
    <main style={{ padding: 40, fontFamily: "system-ui", maxWidth: 900, margin: "0 auto" }}>
      <h1>Hamlytics Pro — Success 🎉</h1>
      <p style={{ opacity: 0.85 }}>{status}</p>

      <div style={{ marginTop: 18, border: "1px solid rgba(0,0,0,0.12)", borderRadius: 14, padding: 16 }}>
        <div style={{ fontWeight: 800, marginBottom: 8 }}>Your Pro Token</div>
        <textarea
          value={token}
          readOnly
          style={{ width: "100%", height: 110, borderRadius: 10, padding: 10, fontFamily: "ui-monospace, SFMono-Regular, Menlo, monospace" }}
        />
        <button onClick={copy} disabled={!token} style={btnPrimary}>
          Copy Token
        </button>
        <p style={{ fontSize: 12, opacity: 0.7, marginTop: 10 }}>
          Keep this token private. You can re-generate it anytime by visiting this page again from Stripe success.
        </p>
      </div>

      <p style={{ marginTop: 20, fontSize: 12, opacity: 0.7 }}>
        Not affiliated with TikTok.
      </p>
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
