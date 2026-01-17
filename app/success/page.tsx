"use client";

import { useEffect, useState } from "react";

export default function SuccessPage() {
  const [token, setToken] = useState<string>("");
  const [err, setErr] = useState<string>("");

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const session_id = params.get("session_id");
    if (!session_id) {
      setErr("Missing session_id.");
      return;
    }

    (async () => {
      try {
        const r = await fetch("/api/license/from-session", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ session_id }),
        });
        const data = await r.json();
        if (!data?.ok || !data?.token) throw new Error(data?.error || "No token returned");
        setToken(data.token);
      } catch (e: any) {
        setErr(e?.message || "Failed to generate token");
      }
    })();
  }, []);

  return (
    <main style={{ padding: 24, fontFamily: "system-ui" }}>
      <h1 style={{ fontSize: 26, fontWeight: 900 }}>You’re Pro! 🎉🐹</h1>

      {err ? (
        <p style={{ color: "crimson" }}>{err}</p>
      ) : token ? (
        <>
          <p>Copy this token and paste it into the extension’s Pro unlock box:</p>
          <textarea
            value={token}
            readOnly
            style={{ width: "100%", height: 140, padding: 12, borderRadius: 12 }}
          />
        </>
      ) : (
        <p>Generating your token…</p>
      )}
    </main>
  );
}
