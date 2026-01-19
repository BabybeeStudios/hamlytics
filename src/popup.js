/* ================================
   Hamlytics - popup.js
   Adds: Followers pill above Results
   Fix: Side panel open must be in user gesture (no async chain)
   ================================ */

console.log("🐹 popup.js loaded");

// ✅ set this to your deployed site
const APP_BASE_URL = "https://hamlytics-9x5r.vercel.app";

let lastData = null;

function setDot(state) {
  const dot = document.getElementById("dot");
  if (dot) {
    dot.classList.remove("loading", "ok", "bad");
    if (state) dot.classList.add(state);
  }
  const hamster = document.querySelector(".logoInner");
  if (hamster) hamster.classList.toggle("wobble", state === "loading");
}

function setStatus(text, state = null) {
  const el = document.getElementById("status");
  if (el) el.textContent = text;
  setDot(state);
}

function show(elId, on = true) {
  const el = document.getElementById(elId);
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

function computeStats(videos) {
  const v = videos || [];

  const viewNums = v.map(x => x.views).filter(x => typeof x === "number");
  const avgViews = viewNums.length ? Math.round(viewNums.reduce((a, b) => a + b, 0) / viewNums.length) : null;
  const maxViews = viewNums.length ? Math.max(...viewNums) : null;

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

function render(data) {
  const toggleOn = document.getElementById("top20Toggle")?.checked;
  const list = document.getElementById("results");
  const summaryEl = document.getElementById("summary");
  const hint = document.getElementById("hint");
  const resultsNote = document.getElementById("resultsNote");
  const profilePills = document.getElementById("profilePills");

  if (!list || !summaryEl || !hint || !resultsNote) return;

  const allVideos = data.videos || [];
  const shownVideos = applyTop20ByViews(allVideos, !!toggleOn);
  const stats = computeStats(allVideos);

  const followers = (typeof data.followers === "number") ? data.followers : null;

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

  document.getElementById("exportBtn").disabled = false;
  document.getElementById("exportJsonBtn").disabled = false;
  document.getElementById("copyBtn").disabled = false;
  document.getElementById("rescanBtn").disabled = false;
}

async function scanProfile({ forceFresh }) {
  document.getElementById("exportBtn").disabled = true;
  document.getElementById("exportJsonBtn").disabled = true;
  document.getElementById("copyBtn").disabled = true;
  document.getElementById("rescanBtn").disabled = true;

  show("summary", false);
  show("hint", false);
  show("profilePills", false);

  document.getElementById("results").innerHTML = "";
  document.getElementById("resultsNote").textContent = "";

  const tab = await getActiveTab();
  if (!tab?.id || !tab.url?.includes("tiktok.com/@")) {
    setStatus("Please open a TikTok profile page (tiktok.com/@...), then try again.", "bad");
    return;
  }

  const deep = !!document.getElementById("deepScanToggle")?.checked;
  const scanLimit = Number(document.getElementById("scanLimit")?.value || 20);

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

/**
 * ✅ CRITICAL FIX:
 * sidePanel.open() must be called directly in response to the click.
 * So we use callback-style chrome.tabs.query + open immediately.
 */
function openSidePanelUserGesture() {
  // Always open the panel so Free users can preview the layout.
  // The panel itself will show the Pro lock overlay when not Pro.

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

          // Now (after opening) check Pro and show a friendly nudge if they're Free
          chrome.runtime.sendMessage({ type: "GET_PRO_STATUS", forceRefresh: false }, (st) => {
            const isPro = !!st?.pro;
            if (!isPro) {
              setStatus("Preview opened ✨ Side panel features are Pro 🔒🐹", null);
              show("upgradeNudge", true);
            } else {
              setStatus("Side panel opened ✅", "ok");
              show("upgradeNudge", false);
            }
          });
        });
      }
    );
  });
}

async function initPopup() {
  const st = await getProStatus(false);
  const badge = document.getElementById("planBadge");
  if (badge) badge.textContent = st.pro ? "PRO" : "FREE";

  show("upgradeNudge", !st.pro);

  const scanLimit = document.getElementById("scanLimit");
  const scanLimitLabel = document.getElementById("scanLimitLabel");
  if (scanLimit && scanLimitLabel) {
    scanLimitLabel.textContent = scanLimit.value;
    scanLimit.addEventListener("input", () => {
      scanLimitLabel.textContent = scanLimit.value;
    });
  }

  document.getElementById("scanBtn")?.addEventListener("click", () => scanProfile({ forceFresh: false }));
  document.getElementById("rescanBtn")?.addEventListener("click", () => scanProfile({ forceFresh: true }));

  document.getElementById("exportBtn")?.addEventListener("click", exportCSV);
  document.getElementById("exportJsonBtn")?.addEventListener("click", exportJSON);
  document.getElementById("copyBtn")?.addEventListener("click", copySummary);

  document.getElementById("top20Toggle")?.addEventListener("change", () => { if (lastData) render(lastData); });

  // ✅ IMPORTANT: open side panel directly from user click
  const openPanelBtn = document.getElementById("openPanelBtn");
  if (openPanelBtn) openPanelBtn.onclick = openSidePanelUserGesture;

  document.getElementById("goProBtn")?.addEventListener("click", () => {
    chrome.tabs.create({ url: `${APP_BASE_URL}/pricing` });
  });

  setStatus("Open a TikTok profile page, then click Scan. 🐹", null);
}

document.addEventListener("DOMContentLoaded", initPopup);
