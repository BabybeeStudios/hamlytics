/* ================================
   Hamlytics - popup.js
   Adds: Followers pill above Results
   Fix: Side panel open must be in user gesture (no async chain)
   Adds: Pro-locked Deep Scan toggle + tooltip
   Adds: Failsafe guards so popup can’t crash
   ================================ */

console.log("🐹 popup.js loaded");

// ✅ set this to your deployed site
const APP_BASE_URL = "https://hamlytics-9x5r.vercel.app";

let lastData = null;

/* ================================
   FAILSAFE GUARDS (anti-crash)
   ================================ */

// ✅ Always have a no-op fallback so calls never crash
// (We replace this with the real function below.)
window.setDeepScanEnabled = window.setDeepScanEnabled || function () {};

// Safe DOM getter (prevents "cannot read property of null" crashes)
function $(id) {
  return document.getElementById(id);
}

// Wrap any function so exceptions are caught and shown instead of crashing popup
function guard(fn, label = "Action") {
  return function (...args) {
    try {
      const out = fn.apply(this, args);
      if (out && typeof out.then === "function") {
        return out.catch((err) => {
          console.error(`🐹 ${label} failed:`, err);
          try { setStatus(`${label} failed: ${err?.message || err}`, "bad"); } catch {}
        });
      }
      return out;
    } catch (err) {
      console.error(`🐹 ${label} crashed:`, err);
      try { setStatus(`${label} crashed: ${err?.message || err}`, "bad"); } catch {}
    }
  };
}

/* ---------- UI helpers ---------- */
function setDot(state) {
  const dot = $("dot");
  if (dot) {
    dot.classList.remove("loading", "ok", "bad");
    if (state) dot.classList.add(state);
  }
  const hamster = document.querySelector(".logoInner");
  if (hamster) hamster.classList.toggle("wobble", state === "loading");
}

function setStatus(text, state = null) {
  const el = $("status");
  if (el) el.textContent = text;
  setDot(state);
}

function show(elId, on = true) {
  const el = $(elId);
  if (!el) return;
  el.classList.toggle("hidden", !on);
}

function formatNum(n) {
  if (n == null || Number.isNaN(n)) return "—";
  return Number(n).toLocaleString();
}

function safePct(x) {
  if (x == null || Number.isNaN(x)) return "—";
  return (x * 100).toFixed(2) + "%";
}

/* ✅ REAL implementation (replaces no-op). MUST be top-level. */
window.setDeepScanEnabled = function setDeepScanEnabled(enabled) {
  const t = $("deepScanToggle");
  const r = $("scanLimit");

  const tooltip = enabled ? "" : "Unlock with Pro! 💖";

  if (t) {
    t.disabled = !enabled;
    t.title = tooltip;
    if (!enabled) t.checked = false;
  }

  if (r) {
    r.disabled = !enabled;
    r.title = tooltip;
  }
};

/* ---------- Chrome messaging ---------- */
async function getActiveTab() {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  return tab;
}

async function getProStatus(forceRefresh = false) {
  const resp = await chrome.runtime.sendMessage({ type: "GET_PRO_STATUS", forceRefresh });
  if (resp?.ok) return { pro: !!resp.pro, source: resp.source || "unknown" };
  return { pro: false, source: "error" };
}

async function scanOnce(tabId, deep, deepLimit, forceFresh) {
  return await chrome.runtime.sendMessage({
    type: "SCAN_PROFILE",
    tabId,
    deep,
    deepLimit,
    forceFresh: !!forceFresh
  });
}

/* ---------- Stats ---------- */
function computeStats(videos) {
  const v = videos || [];

  const viewNums = v.map(x => x.views).filter(x => typeof x === "number");
  const avgViews = viewNums.length ? Math.round(viewNums.reduce((a, b) => a + b, 0) / viewNums.length) : null;
  const maxViews = viewNums.length ? Math.max(...viewNums) : null;

  // NOTE: Engagement isn't precomputed in your current engine (unless you add it later).
  const engNums = v.map(x => x.engagement).filter(x => typeof x === "number");
  const avgEng = engNums.length ? engNums.reduce((a, b) => a + b, 0) / engNums.length : null;

  return { total: v.length, avgViews, maxViews, avgEng };
}

function applyTop20ByViews(videos, enabled) {
  const v = [...(videos || [])];
  if (!enabled) return v;
  v.sort((a, b) => (b.views ?? -Infinity) - (a.views ?? -Infinity));
  return v.slice(0, 20);
}

/* ---------- Render ---------- */
function render(data) {
  const toggleOn = $("top20Toggle")?.checked;
  const list = $("results");
  const summaryEl = $("summary");
  const hint = $("hint");
  const resultsNote = $("resultsNote");

  if (!list || !summaryEl || !hint || !resultsNote) return;

  const allVideos = data.videos || [];
  const shownVideos = applyTop20ByViews(allVideos, !!toggleOn);
  const stats = computeStats(allVideos);

  summaryEl.innerHTML = `
    <div><b>Profile:</b> ${data.profileHandle || "—"}</div>
    <div><b>Videos found:</b> ${formatNum(stats.total)}</div>
    <div class="pillRow">
      <span class="pill pink">Avg views: ${formatNum(stats.avgViews)}</span>
      <span class="pill lav">Top views: ${formatNum(stats.maxViews)}</span>
      <span class="pill mint">Avg eng: ${stats.avgEng == null ? "Pro (Deep Scan)" : safePct(stats.avgEng)}</span>
      <span class="pill sun">Followers: ${formatNum(data.followers)}</span>
    </div>
  `;
  show("summary", true);

  resultsNote.textContent = toggleOn
    ? `Showing top 20 (of ${stats.total})`
    : `Showing ${Math.min(50, shownVideos.length)} (of ${stats.total})`;

  list.innerHTML = "";
  const cap = toggleOn ? shownVideos : shownVideos.slice(0, 50);

  cap.forEach((v, idx) => {
    const li = document.createElement("li");
    const label = `#${idx + 1}`;

    const viewText = (typeof v.views === "number") ? `${formatNum(v.views)} views` : "views —";
    const likeText = (typeof v.likes === "number") ? ` • ${formatNum(v.likes)} likes` : "";
    const comText  = (typeof v.comments === "number") ? ` • ${formatNum(v.comments)} comments` : "";

    li.innerHTML = `
      <a class="link" href="${v.url || "#"}" target="_blank" rel="noreferrer">${label} ↗</a>
      <span class="meta">${viewText}${likeText}${comText}</span>
    `;
    list.appendChild(li);
  });

  if (stats.total > 0 && stats.total < 12) {
    hint.textContent = "✨ Tip: TikTok loads more videos as you scroll. Scroll down the profile a bit, then click Rescan for a fuller list.";
    show("hint", true);
  } else if (stats.total === 0) {
    hint.textContent = "Hmm—0 videos found. If the account is public, refresh the page, wait a moment, then scan again. Some profiles load slowly.";
    show("hint", true);
  } else {
    show("hint", false);
  }

  $("exportBtn").disabled = false;
  $("exportJsonBtn").disabled = false;
  $("copyBtn").disabled = false;
  $("rescanBtn").disabled = false;
}

/* ---------- Scan ---------- */
async function scanProfile({ forceFresh }) {
  $("exportBtn").disabled = true;
  $("exportJsonBtn").disabled = true;
  $("copyBtn").disabled = true;
  $("rescanBtn").disabled = true;

  show("summary", false);
  show("hint", false);

  $("results").innerHTML = "";
  $("resultsNote").textContent = "";

  const tab = await getActiveTab();
  if (!tab?.id || !tab.url?.includes("tiktok.com/@")) {
    setStatus("Please open a TikTok profile page (tiktok.com/@...), then try again.", "bad");
    return;
  }

  const deep = !!$("deepScanToggle")?.checked;
  const scanLimit = Number($("scanLimit")?.value || 20);

  setStatus(deep ? "Deep scanning… hamster power mode 🐹📊" : "Scanning… views only 🐹", "loading");

  let resp = await scanOnce(tab.id, deep, scanLimit, forceFresh);
  const firstCount = resp?.ok ? (resp.data?.videos?.length || 0) : 0;

  if (!resp?.ok || firstCount === 0) {
    setStatus("TikTok may still be loading… retrying once 🐹", "loading");
    await new Promise(r => setTimeout(r, 1500));
    resp = await scanOnce(tab.id, deep, scanLimit, forceFresh);
  }

  if (!resp?.ok) {
    setStatus(resp?.error || "Scan failed. Try refreshing TikTok and scanning again.", "bad");
    return;
  }

  lastData = resp.data;
  render(lastData);

  const count = lastData?.videos?.length || 0;
  if (count > 0) setStatus(`All set! Found ${count} videos 💖`, "ok");
  else setStatus("Scan finished, but found 0 videos. Try refresh + scan again.", "bad");
}

/* ---------- Exports + Copy ---------- */
async function exportCSV() {
  if (!lastData) return;
  setStatus("Packing your CSV… 📦🐹", "loading");
  const resp = await chrome.runtime.sendMessage({ type: "EXPORT_CSV", data: lastData });
  if (resp?.ok) setStatus("CSV export started (check downloads). 🎉", "ok");
  else setStatus(resp?.error || "Export failed.", "bad");
}

async function exportJSON() {
  if (!lastData) return;
  setStatus("Wrapping JSON… 🐹🧾", "loading");
  const resp = await chrome.runtime.sendMessage({ type: "EXPORT_JSON", data: lastData });
  if (resp?.ok) setStatus("JSON export started (check downloads). 🎉", "ok");
  else setStatus(resp?.error || "Export failed.", "bad");
}

async function copySummary() {
  if (!lastData) return;
  const vids = lastData.videos || [];
  const stats = computeStats(vids);
  const followers = (typeof lastData.followers === "number") ? lastData.followers : null;

  const text =
`Hamlytics
Profile: ${lastData.profileHandle || "—"}
Followers: ${formatNum(followers)}
Videos scanned: ${formatNum(stats.total)}
Avg views: ${formatNum(stats.avgViews)}
Top views: ${formatNum(stats.maxViews)}
Avg engagement: ${safePct(stats.avgEng)}
`;

  try {
    await navigator.clipboard.writeText(text);
    setStatus("Copied summary 💖", "ok");
  } catch {
    setStatus("Copy failed (browser blocked clipboard).", "bad");
  }
}

/* ---------- Side panel open (preview for Free too) ---------- */
function openSidePanelUserGesture() {
  chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
    const tab = tabs && tabs[0];
    if (!tab?.id) {
      setStatus("Couldn’t find active tab.", "bad");
      return;
    }

    if (!chrome.sidePanel?.setOptions || !chrome.sidePanel?.open) {
      setStatus("Side panel API not available (or unsupported in this Chrome).", "bad");
      return;
    }

    chrome.sidePanel.setOptions(
      { tabId: tab.id, path: "src/panel.html", enabled: true },
      () => {
        if (chrome.runtime.lastError) {
          setStatus(chrome.runtime.lastError.message || "Side panel setOptions failed.", "bad");
          return;
        }

        chrome.sidePanel.open({ tabId: tab.id }, () => {
          if (chrome.runtime.lastError) {
            setStatus(chrome.runtime.lastError.message || "Side panel open failed.", "bad");
            return;
          }
          setStatus("Side panel opened ✅", "ok");
        });
      }
    );
  });
}

/* ---------- Init ---------- */
async function initPopup() {
  const st = await getProStatus(false);

  const badge = $("planBadge");
  if (badge) badge.textContent = st.pro ? "PRO" : "FREE";

  show("upgradeNudge", !st.pro);

  // ✅ Always call via window. so it never throws
  window.setDeepScanEnabled(!!st.pro);

  const scanLimit = $("scanLimit");
  const scanLimitLabel = $("scanLimitLabel");
  if (scanLimit && scanLimitLabel) {
    scanLimitLabel.textContent = scanLimit.value;
    scanLimit.addEventListener("input", () => {
      scanLimitLabel.textContent = scanLimit.value;
    });
  }

  $("scanBtn")?.addEventListener("click", guard(() => scanProfile({ forceFresh: false }), "Scan"));
  $("rescanBtn")?.addEventListener("click", guard(() => scanProfile({ forceFresh: true }), "Rescan"));

  $("exportBtn")?.addEventListener("click", guard(exportCSV, "Export CSV"));
  $("exportJsonBtn")?.addEventListener("click", guard(exportJSON, "Export JSON"));
  $("copyBtn")?.addEventListener("click", guard(copySummary, "Copy"));

  $("top20Toggle")?.addEventListener("change", guard(() => { if (lastData) render(lastData); }, "Toggle"));

  const openPanelBtn = $("openPanelBtn");
  if (openPanelBtn) openPanelBtn.onclick = guard(openSidePanelUserGesture, "Open side panel");

  $("goProBtn")?.addEventListener("click", guard(() => {
    chrome.tabs.create({ url: `${APP_BASE_URL}/pricing` });
  }, "Go Pro"));

  setStatus("Open a TikTok profile page, then click Scan. 🐹", null);
}

chrome.storage?.onChanged?.addListener((changes, area) => {
  if (area !== "local") return;
  if (changes.proToken || changes.proCache) {
    getProStatus(true).then((st) => {
      window.setDeepScanEnabled(!!st.pro);
      const badge = $("planBadge");
      if (badge) badge.textContent = st.pro ? "PRO" : "FREE";
      show("upgradeNudge", !st.pro);
    });
  }
});

document.addEventListener("DOMContentLoaded", guard(initPopup, "Init"));