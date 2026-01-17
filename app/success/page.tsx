"use client";

import { useEffect, useMemo, useState } from "react";

export default function SuccessPage() {
  const [token, setToken] = useState<string>("");
  const [status, setStatus] = useState<string>("Finishing your Pro upgrade… 🐹💖");
  const [err, setErr] = useState<string>("");

  const sessionId = useMemo(() => {
    if (typeof window === "undefined") return "";
    const params = new URLSearchParams(window.location.search);
    return params.get("session_id") || "";
  }, []);

  useEffect(() => {
    (async () => {
      try {
        setErr("");
        if (!sessionId) {
          setStatus("Missing session_id. Please return to checkout success link.");
          return;
        }

        const r = await fetch("/api/license/issue", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ sessionId }),
        });

        const data = await r.json().catch(() => null);

        if (!data?.ok) {
          setErr(data?.error || "Could not issue Pro token.");
          setStatus("We couldn’t generate your token yet.");
          return;
        }

        setToken(data.token);
        setStatus("You’re Pro! Copy your token below ✨");
      } catch (e: any) {
        setErr(e?.message || "Unexpected error.");
        setStatus("Something went wrong.");
      }
    })();
  }, [sessionId]);

  async function copy() {
    try {
      await navigator.clipboard.writeText(token);
      setStatus("Copied! Now paste it into the Hamlytics extension 🐹🎉");
    } catch {
      setStatus("Copy failed — you can manually select + copy the token.");
    }
  }

  return (
    <main className="min-h-screen bg-[#fff7fb] text-slate-800">
      <div className="mx-auto max-w-2xl px-6 py-12">
        <div className="rounded-2xl border border-black/10 bg-white/80 p-6 shadow-[0_10px_30px_rgba(31,41,55,0.12)]">
          <div className="flex items-center gap-3">
            <div className="grid h-12 w-12 place-items-center rounded-2xl border border-black/10 bg-[linear-gradient(135deg,rgba(255,79,163,0.28),rgba(255,79,163,0.10))] text-xl">
              🐹
            </div>
            <div>
              <div className="text-sm font-extrabold">Hamlytics</div>
              <div className="text-xs text-slate-600">Pro Upgrade</div>
            </div>
          </div>

          <h1 className="mt-5 text-3xl font-black tracking-tight">
            Success! <span className="text-pink-500">You’re Pro</span>
          </h1>

          <p className="mt-2 text-sm text-slate-700">{status}</p>

          {err ? (
            <div className="mt-4 rounded-2xl border border-red-200 bg-red-50 p-4 text-sm text-red-700">
              {err}
              <div className="mt-2 text-xs text-red-600">
                Tip: Try refreshing this page. If it still fails, contact support and share your Stripe email + timestamp.
              </div>
            </div>
          ) : null}

          <div className="mt-5">
            <div className="text-xs font-extrabold text-slate-700">Your Pro token</div>
            <div className="mt-2 rounded-2xl border border-black/10 bg-white p-4">
              <textarea
                value={token}
                readOnly
                placeholder={sessionId ? "Generating token…" : "No session id found."}
                className="h-28 w-full resize-none bg-transparent text-xs text-slate-800 outline-none"
              />
            </div>

            <div className="mt-4 flex flex-col gap-2 sm:flex-row">
              <button
                onClick={copy}
                disabled={!token}
                className="rounded-2xl bg-[linear-gradient(135deg,#ff4fa3,#a78bfa)] px-4 py-3 text-sm font-extrabold text-white shadow-lg disabled:opacity-60"
              >
                Copy token 💖
              </button>

              <button
                onClick={() => (window.location.href = "/pricing")}
                className="rounded-2xl border border-black/10 bg-white/70 px-4 py-3 text-sm font-extrabold shadow-lg"
              >
                Back to pricing
              </button>
            </div>

            <div className="mt-5 rounded-2xl border border-black/10 bg-white/70 p-4 text-sm text-slate-700">
              <div className="font-extrabold">Next step</div>
              <ol className="mt-2 list-decimal pl-5 space-y-1">
                <li>Open Chrome → click the Hamlytics extension 🐹</li>
                <li>Go to “Pro Unlock”</li>
                <li>Paste your token → click “Unlock”</li>
                <li>Your badge should flip to <b>PRO</b> immediately ✅</li>
              </ol>
            </div>
          </div>
        </div>

        <div className="mt-8 text-center text-xs text-slate-500">
          Made with hamster energy 🐹💖
        </div>
      </div>
    </main>
  );
}
