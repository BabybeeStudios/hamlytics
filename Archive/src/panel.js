/* ================================
   Hamlytics - panel.js
   Side panel compare (Pro gated UI)
   Adds:
   - Followers display
   - Eng coverage pill (tooltip + color)
   - Low coverage nudge
   ================================ */

console.log("🐹 panel.js loaded");

let lastData = null;

const KEY_COMPARE_A = "compare:A";

function setDot(state) {
  const dot = document.getElementById("dot");
  if (!dot) return;
  dot.classList.remove("loading", "ok", "bad");
  if (state) dot.classList.add(state);
}

function setStatus(text, state = null) {
  const el = document.getElementById("status");
  if (el) el.textContent = text;
  setDot(state);
}

function show(id, on = true) {
  const el = document.getElementById(id);
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

function clamp(n, a, b) {
  const x = Number(n);
  if (!Number.isFinite(x)) return a;
  return Math.max(a, Math.min(b, x));
}

async function getActiveTab() {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  return tab;
}

async function getProStatus(forceRefresh = false) {
  const resp = await chrome.runtime.sendMessage({ type: "GET_PRO_STATUS", forceRefresh });
  if (resp?.ok) return { ok: true, pro: !!resp.pro, source: resp.source || "unknown" };
  return { ok: false, pro: false, source: "error" };
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

/**
 * engagement = (likes + comments) / views
 */
function engagementForVideo(v) {
  const views = v?.views;
  const likes = v?.likes;
  const comments = v?.comments;

  if (typeof views !== "number" || views <= 0) return null;
  const likeOk = typeof likes === "number";
  const comOk = typeof comments === "number";
  if (!likeOk && !comOk) return null;

  const total = (likeOk ? likes : 0) + (comOk ? comments : 0);
  return total / views;
}

function computeStats(videos) {
  const v = Array.isArray(videos) ? videos : [];

  const viewNums = v.map(x => x.views).filter(x => typeof x === "number");
  const avgViews = viewNums.length ? Math.round(viewNums.reduce((a, b) => a + b, 0) / viewNums.length) : null;
  const maxViews = viewNums.length ? Math.max(...viewNums) : null;

  const engVals = v.map(engagementForVideo).filter(x => typeof x === "number" && Number.isFinite(x));
  const avgEng = engVals.length ? engVals.reduce((a, b) => a + b, 0) / engVals.length : null;

  const engKnown = engVals.length;
  const total = v.length;
  const engCoveragePct = total ? (engKnown / total) * 100 : null;

  return { total, avgViews, maxViews, avgEng, engKnown, engCoveragePct };
}

function coverageClass(pct) {
  if (pct == null || !Number.isFinite(pct)) return "covBad";
  if (pct >= 30) return "covGood";
  if (pct >= 10) return "covWarn";
  return "covBad";
}

async function saveCompareA(data) {
  await chrome.storage.local.set({ [KEY_COMPARE_A]: { savedAt: Date.now(), data } });
}

async function loadCompareA() {
  const obj = await chrome.storage.local.get(KEY_COMPARE_A);
  return obj[KEY_COMPARE_A]?.data || null;
}

async function clearCompareA() {
  await chrome.storage.local.remove(KEY_COMPARE_A);
}

function renderSummary(data) {
  const el = document.getElementById("summary");
  if (!el) return;

  const vids = data?.videos || [];
  const stats = computeStats(vids);

  const followers = (typeof data?.followers === "number") ? data.followers : null;
  const covPct = stats.engCoveragePct;
  const covCls = coverageClass(covPct);
  const covText = stats.total ? `${stats.engKnown}/${stats.total}` : "—";

  const covTip =
    "Eng coverage = videos with likes/comments + views ÷ total scanned. " +
    "Higher coverage = more reliable Avg engagement. Tip: scroll profile / open a few videos, then Deep Scan again.";

  el.innerHTML = `
    <div><b>Profile:</b> ${data?.profileHandle || "—"}</div>
    <div class="pillRow">
      <span class="pill pink">Avg views: ${formatNum(stats.avgViews)}</span>
      <span class="pill lav">Top views: ${formatNum(stats.maxViews)}</span>
      <span class="pill sun">Followers: ${formatNum(followers)}</span>
      <span class="pill mint">Avg eng: ${safePct(stats.avgEng)}</span>
      <span class="pill ${covCls} pillTip" title="${covTip}">Eng coverage: ${covText}</span>
    </div>
  `;
  show("summary", true);
}

function renderResultsList(data) {
  const list = document.getElementById("results");
  const note = document.getElementById("resultsNote");
  if (!list || !note) return;

  const vids = Array.isArray(data?.videos) ? data.videos : [];
  note.textContent = `${Math.min(50, vids.length)} shown (of ${vids.length})`;

  list.innerHTML = "";
  vids.slice(0, 50).forEach((v, idx) => {
    const li = document.createElement("li");
    const viewText = (typeof v.views === "number") ? `${formatNum(v.views)} views` : "views —";
    const likeText = (typeof v.likes === "number") ? ` • ${formatNum(v.likes)} likes` : "";
    const comText  = (typeof v.comments === "number") ? ` • ${formatNum(v.comments)} comments` : "";

    li.innerHTML = `
      <a class="link" href="${v.url || "#"}" target="_blank" rel="noreferrer">#${idx + 1} ↗</a>
      <span class="meta">${viewText}${likeText}${comText}</span>
    `;
    list.appendChild(li);
  });
}

function winner(a, b) {
  if (a == null || b == null) return null;
  if (a === b) return null;
  return a > b ? "A" : "B";
}

function nice(n) {
  if (n == null || Number.isNaN(n)) return "—";
  return Number(n).toLocaleString();
}

function nicePct(p) {
  if (p == null || Number.isNaN(p)) return "—";
  return `${p.toFixed(2)}%`;
}

function summarizeForCompare(data) {
  const vids = data?.videos || [];
  const stats = computeStats(vids);
  const followers = (typeof data?.followers === "number") ? data.followers : null;

  return {
    handle: data?.profileHandle || "—",
    followers,
    total: stats.total,
    avgViews: stats.avgViews,
    maxViews: stats.maxViews,
    avgEngPct: stats.avgEng != null ? stats.avgEng * 100 : null,
    engCoveragePct: stats.engCoveragePct
  };
}

function renderCompare(aData, bData) {
  const compareCard = document.getElementById("compareCard");
  const compareHint = document.getElementById("compareHint");
  if (!compareCard || !compareHint) return;

  const A = summarizeForCompare(aData);
  const B = summarizeForCompare(bData);

  const hints = [];
  const covA = A.engCoveragePct ?? 0;
  const covB = B.engCoveragePct ?? 0;

  if (Math.min(A.total, B.total) < 8) {
    hints.push("✨ Tip: Scroll each profile, then Deep Scan again for a fair compare.");
  }
  if (covA < 30 || covB < 30) {
    hints.push("🐹 Low eng coverage detected. Avg engagement may be less reliable until more videos load.");
  }

  compareHint.textContent = hints.join(" ");
  show("compareHint", hints.length > 0);

  const wAvgViews = winner(A.avgViews, B.avgViews);
  const wEng = winner(A.avgEngPct, B.avgEngPct);
  const wTop = winner(A.maxViews, B.maxViews);

  compareCard.innerHTML = `
    <div class="compareGrid">
      <div class="compareCol">
        <div class="compareTitle">A: ${A.handle}</div>
        <div class="kv"><span class="k">Followers</span><span class="v">${nice(A.followers)}</span></div>
        <div class="kv"><span class="k">Videos</span><span class="v">${nice(A.total)}</span></div>
        <div class="kv"><span class="k">Avg views</span><span class="v">${nice(A.avgViews)} ${wAvgViews==="A" ? '<span class="win">WIN</span>' : ''}</span></div>
        <div class="kv"><span class="k">Top views</span><span class="v">${nice(A.maxViews)} ${wTop==="A" ? '<span class="win">WIN</span>' : ''}</span></div>
        <div class="kv"><span class="k">Avg engagement</span><span class="v">${nicePct(A.avgEngPct)} ${wEng==="A" ? '<span class="win">WIN</span>' : ''}</span></div>
        <div class="kv"><span class="k">Eng coverage</span><span class="v">${nicePct(A.engCoveragePct)}</span></div>
      </div>

      <div class="compareCol">
        <div class="compareTitle">Current: ${B.handle}</div>
        <div class="kv"><span class="k">Followers</span><span class="v">${nice(B.followers)}</span></div>
        <div class="kv"><span class="k">Videos</span><span class="v">${nice(B.total)}</span></div>
        <div class="kv"><span class="k">Avg views</span><span class="v">${nice(B.avgViews)} ${wAvgViews==="B" ? '<span class="win">WIN</span>' : ''}</span></div>
        <div class="kv"><span class="k">Top views</span><span class="v">${nice(B.maxViews)} ${wTop==="B" ? '<span class="win">WIN</span>' : ''}</span></div>
        <div class="kv"><span class="k">Avg engagement</span><span class="v">${nicePct(B.avgEngPct)} ${wEng==="B" ? '<span class="win">WIN</span>' : ''}</span></div>
        <div class="kv"><span class="k">Eng coverage</span><span class="v">${nicePct(B.engCoveragePct)}</span></div>
      </div>
    </div>
  `;

  show("compareCard", true);
}

async function refreshProUI({ forceRefresh = false } = {}) {
  const st = await getProStatus(forceRefresh);

  const badge = document.getElementById("badge");
  if (badge) {
    badge.textContent = st.pro ? "PRO" : "FREE";
    badge.classList.toggle("pro", !!st.pro);
  }

  // Lock overlay
  show("lock", !st.pro);

  // Disable/enable buttons when locked
  const lockBtns = ["scanBtn", "saveABtn", "compareBtn", "clearABtn"];
  lockBtns.forEach(id => {
    const b = document.getElementById(id);
    if (b) b.disabled = !st.pro;
  });

  return st;
}

async function scanCurrent({ forceFresh = false } = {}) {
  const st = await getProStatus(false);
  if (!st.pro) {
    setStatus("Side panel is Pro-only 🔒 (enter token in popup + Refresh Pro)", null);
    return;
  }

  const tab = await getActiveTab();
  if (!tab?.id || !tab.url?.includes("tiktok.com/")) {
    setStatus("Open a TikTok profile page first.", "bad");
    return;
  }

  const deep = !!document.getElementById("deepScanToggle")?.checked;
  const deepLimit = clamp(Number(document.getElementById("deepLimit")?.value || 12), 1, 20);

  setStatus(deep ? "Deep scanning… 🐹📊" : "Scanning… 🐹", "loading");

  let resp = await scanOnce(tab.id, deep, deepLimit, forceFresh);
  const count = resp?.ok ? (resp.data?.videos?.length || 0) : 0;

  if (!resp?.ok || count === 0) {
    setStatus("TikTok still loading… retrying once 🐹", "loading");
    await new Promise(r => setTimeout(r, 1200));
    resp = await scanOnce(tab.id, deep, deepLimit, forceFresh);
  }

  if (!resp?.ok) {
    setStatus(resp?.error || "Scan failed.", "bad");
    return;
  }

  lastData = resp.data;
  renderSummary(lastData);
  renderResultsList(lastData);

  const stats = computeStats(lastData?.videos || []);
  if (deep && stats.total > 0 && (stats.engCoveragePct ?? 0) < 30) {
    setStatus(`Scanned ${stats.total}. Low eng coverage (${stats.engKnown}/${stats.total}) — scroll + Deep Scan again for better Avg eng.`, null);
  } else {
    setStatus(`Scanned ✅ (${count} videos)`, "ok");
  }
}

async function init() {
  // Bind UI
  document.getElementById("scanBtn")?.addEventListener("click", () => scanCurrent({ forceFresh: false }));
  document.getElementById("saveABtn")?.addEventListener("click", async () => {
    if (!lastData) return;
    await saveCompareA(lastData);
    setStatus("Saved as A ✨🐹", "ok");
  });

  document.getElementById("compareBtn")?.addEventListener("click", async () => {
    const a = await loadCompareA();
    if (!a || !lastData) {
      setStatus("Scan Current → Save as A → open another profile → Scan Current → Compare", null);
      return;
    }
    renderCompare(a, lastData);
    setStatus("Compare ready 💖", "ok");
  });

  document.getElementById("clearABtn")?.addEventListener("click", async () => {
    await clearCompareA();
    show("compareCard", false);
    show("compareHint", false);
    setStatus("Cleared A.", "ok");
  });

  const deepLimit = document.getElementById("deepLimit");
  const deepLimitLabel = document.getElementById("deepLimitLabel");
  if (deepLimit && deepLimitLabel) {
    deepLimitLabel.textContent = deepLimit.value;
    deepLimit.addEventListener("input", () => {
      deepLimitLabel.textContent = deepLimit.value;
    });
  }

  document.getElementById("refreshProBtn")?.addEventListener("click", async () => {
    const st = await refreshProUI({ forceRefresh: true });
    setStatus(st.pro ? "Pro unlocked ✅🐹" : "Still Free — paste token in popup then refresh", st.pro ? "ok" : null);
  });

  document.getElementById("goProBtn")?.addEventListener("click", () => {
    // Open pricing page
    chrome.tabs.create({ url: "https://hamlytics-9x5r.vercel.app/pricing" });
  });

  // initial
  await refreshProUI({ forceRefresh: false });
  setStatus("Open a TikTok profile and click Scan Current. 🐹", null);

  // keep engine label if exists
  const engine = document.getElementById("engine");
  if (engine) engine.textContent = "2026-01-17-freeze-2";
}

document.addEventListener("DOMContentLoaded", init);
