/* ================================
   Hamlytics - service_worker.js
   Working extractor engine + Pro gating + exports
   Hardened injector (MAIN -> ISOLATED fallback)
   + Followers (profile-level) extraction (state-first, DOM fallback)

   NOTE:
   - Side panel opening is handled ONLY in popup.js (user gesture required).
   - Service worker does NOT call chrome.sidePanel.open() to avoid MV3 crashes.
   ================================ */

const ENGINE_VERSION = "2026-Hamlytics";

// === CONFIG: your deployed site ===
const APP_BASE_URL = "https://hamlytics-9x5r.vercel.app";
const LICENSE_VALIDATE_URL = `${APP_BASE_URL}/api/license/validate`;

// Storage keys
const KEY_PRO_TOKEN = "proToken";
const KEY_PRO_CACHE = "proCache"; // { pro: boolean, checkedAt: number }

// Cache TTL: re-check Pro every 6 hours
const PRO_TTL_MS = 6 * 60 * 60 * 1000;

// Deep scan timing
const TAB_LOAD_TIMEOUT_MS = 15000;
const INJECT_RETRY_DELAY_MS = 900;

async function getFromStorage(keys) {
  return await chrome.storage.local.get(keys);
}
async function setInStorage(obj) {
  return await chrome.storage.local.set(obj);
}
function isProCachedFresh(cache) {
  if (!cache || typeof cache.checkedAt !== "number") return false;
  return (Date.now() - cache.checkedAt) < PRO_TTL_MS;
}

async function validateProWithServer(token) {
  const resp = await fetch(LICENSE_VALIDATE_URL, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ token }),
  }).catch(() => null);

  if (!resp) return { ok: false, pro: false, error: "Network error" };
  const data = await resp.json().catch(() => null);
  if (!data) return { ok: false, pro: false, error: "Bad JSON" };
  return data; // expected { ok:true, pro:true/false }
}

async function getProStatus({ forceRefresh = false } = {}) {
  const obj = await getFromStorage([KEY_PRO_TOKEN, KEY_PRO_CACHE]);
  const proToken = obj[KEY_PRO_TOKEN];
  const proCache = obj[KEY_PRO_CACHE];

  if (!proToken) {
    await setInStorage({ [KEY_PRO_CACHE]: { pro: false, checkedAt: Date.now() } });
    return { pro: false, source: "no_token" };
  }

  if (!forceRefresh && isProCachedFresh(proCache)) {
    return { pro: !!proCache.pro, source: "cache" };
  }

  const v = await validateProWithServer(proToken);
  const pro = !!v?.pro;

  await setInStorage({ [KEY_PRO_CACHE]: { pro, checkedAt: Date.now() } });
  return { pro, source: "server" };
}

/* ==========================================================
   Helpers
   ========================================================== */

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

function clamp(n, a, b) {
  const x = Number(n);
  if (!Number.isFinite(x)) return a;
  return Math.max(a, Math.min(b, x));
}

function safeStr(x) {
  return (x == null) ? "" : String(x);
}

/* ==========================================================
   MV3-safe exports
   ========================================================== */

function dataUrlForText(text, mime) {
  return `data:${mime};charset=utf-8,${encodeURIComponent(text)}`;
}

async function downloadTextFile({ filename, text, mime }) {
  await chrome.downloads.download({
    url: dataUrlForText(text, mime),
    filename,
    saveAs: true,
  });
}

function toCSV(data) {
  const rows = [];
  rows.push(["profile", "followers", "url", "views", "likes", "comments"].join(","));

  const handle = safeStr(data?.profileHandle).replace(/"/g, '""');
  const followers = (typeof data?.followers === "number") ? data.followers : "";
  const vids = Array.isArray(data?.videos) ? data.videos : [];

  for (const v of vids) {
    const url = safeStr(v?.url).replace(/"/g, '""');
    const views = (v?.views ?? "");
    const likes = (v?.likes ?? "");
    const comments = (v?.comments ?? "");
    rows.push([`"${handle}"`, followers, `"${url}"`, views, likes, comments].join(","));
  }

  return rows.join("\n");
}

/* ==========================================================
   Injection wrappers (HARDENED)
   - Try MAIN first, then ISOLATED
   - Retry once after a short delay
   ========================================================== */

async function execOnTabOnce(tabId, func, args = [], world) {
  const res = await chrome.scripting.executeScript({
    target: { tabId },
    func,
    args,
    world: world || "MAIN"
  }).catch((e) => {
    console.warn("SW: executeScript failed", world, e);
    return null;
  });

  if (!res || !Array.isArray(res) || res.length === 0) return null;
  return res[0]?.result ?? null;
}

async function execOnTab(tabId, func, args = []) {
  let out = await execOnTabOnce(tabId, func, args, "MAIN");
  if (out) return out;

  out = await execOnTabOnce(tabId, func, args, "ISOLATED");
  if (out) return out;

  await sleep(INJECT_RETRY_DELAY_MS);

  out = await execOnTabOnce(tabId, func, args, "MAIN");
  if (out) return out;

  out = await execOnTabOnce(tabId, func, args, "ISOLATED");
  if (out) return out;

  return null;
}

async function waitForTabComplete(tabId, timeoutMs) {
  const start = Date.now();
  return await new Promise((resolve) => {
    let done = false;

    function cleanup(ok) {
      if (done) return;
      done = true;
      chrome.tabs.onUpdated.removeListener(onUpdated);
      resolve(ok);
    }

    function onUpdated(id, info) {
      if (id !== tabId) return;
      if (info.status === "complete") cleanup(true);
    }

    chrome.tabs.onUpdated.addListener(onUpdated);

    (async () => {
      while (!done && (Date.now() - start) < timeoutMs) {
        await sleep(150);
      }
      cleanup(false);
    })();
  });
}

/* ==========================================================
   Extractor engine (runs INSIDE the page)
   ========================================================== */

// Runs on profile page: views-only best effort + followers
function page_extractProfileViewsOnly() {
  function parseCount(str) {
    if (!str) return null;
    const s = String(str).trim().toUpperCase().replace(/,/g, "");
    const m = s.match(/^(\d+(\.\d+)?)([KMB])?$/);
    if (m) {
      const num = Number(m[1]);
      if (!Number.isFinite(num)) return null;
      const suf = m[3];
      if (suf === "K") return Math.round(num * 1000);
      if (suf === "M") return Math.round(num * 1000000);
      if (suf === "B") return Math.round(num * 1000000000);
      return Math.round(num);
    }
    const digits = s.replace(/[^\d]/g, "");
    if (!digits) return null;
    const n = Number(digits);
    return Number.isFinite(n) ? n : null;
  }

  function getHandleFromPath() {
    const parts = location.pathname.split("/").filter(Boolean);
    const first = parts[0] || "";
    if (first.startsWith("@")) return first;
    return "";
  }

  function tryParseJSONScriptById(id) {
    const el = document.getElementById(id);
    if (!el) return null;
    const txt = el.textContent || el.innerText || "";
    if (!txt) return null;
    try { return JSON.parse(txt); } catch { return null; }
  }

  function extractFollowersFromUserModule(userModule) {
    try {
      if (!userModule || typeof userModule !== "object") return null;

      const users = userModule.users && typeof userModule.users === "object" ? userModule.users : null;
      const stats = userModule.stats && typeof userModule.stats === "object" ? userModule.stats : null;

      const userKey = users ? (Object.keys(users)[0] || null) : null;
      const userObj = userKey ? users[userKey] : null;

      const userId =
        userObj?.id ||
        userObj?.uid ||
        userObj?.uniqueId ||
        (userKey && /^\d+$/.test(userKey) ? userKey : null) ||
        null;

      const statObj =
        (userId && stats && stats[userId]) ? stats[userId] :
        (stats ? stats[Object.keys(stats)[0]] : null);

      const raw =
        statObj?.followerCount ??
        userObj?.stats?.followerCount ??
        userObj?.stats?.followers ??
        null;

      if (typeof raw === "number") return raw;
      if (typeof raw === "string") return parseCount(raw);

      return null;
    } catch {
      return null;
    }
  }

  function extractFollowersFromUNI(u) {
    try {
      const scope = u?.__DEFAULT_SCOPE__ || u?.__DEFAULT_SCOPE__?.webapp || u?.__DEFAULT_SCOPE__;
      const userModule =
        scope?.UserModule ||
        scope?.webapp?.UserModule ||
        u?.UserModule ||
        null;
      return extractFollowersFromUserModule(userModule);
    } catch {
      return null;
    }
  }

  function extractFollowersFromSIGI(s) {
    try {
      const userModule = s?.UserModule || s?.userModule || null;
      return extractFollowersFromUserModule(userModule);
    } catch {
      return null;
    }
  }

  function extractFollowersFromDom() {
    try {
      const text = document.body?.innerText || "";
      const m = text.match(/([\d.,]+|\d+(\.\d+)?[KMB])\s+Followers/i);
      if (m) return parseCount(m[1]);

      const m2 = text.match(/Followers\s+([\d.,]+|\d+(\.\d+)?[KMB])/i);
      if (m2) return parseCount(m2[1]);
    } catch {}
    return null;
  }

  const debug = {
    engineVersion: "ENGINE_VERSION_PLACEHOLDER",
    url: location.href,
    dom: { title: document.title, path: location.pathname },
    hasUNI: false,
    hasSIGI: false,
    foundStatsLike: false,
    foundVideoNode: false,
    hasItemModule: false
  };

  const uni = tryParseJSONScriptById("__UNIVERSAL_DATA_FOR_REHYDRATION__");
  const sigi = tryParseJSONScriptById("SIGI_STATE");
  debug.hasUNI = !!uni;
  debug.hasSIGI = !!sigi;

  let followers = null;
  if (uni) followers = extractFollowersFromUNI(uni);
  if (followers == null && sigi) followers = extractFollowersFromSIGI(sigi);
  if (followers == null) followers = extractFollowersFromDom();

  function extractFromSIGI(s) {
    const out = [];
    const seen = new Set();
    const itemModule = s?.ItemModule || s?.itemModule;
    if (itemModule && typeof itemModule === "object") debug.hasItemModule = true;

    const handle = getHandleFromPath();
    if (itemModule && typeof itemModule === "object") {
      for (const [id, it] of Object.entries(itemModule)) {
        const play = it?.stats?.playCount ?? it?.stats?.viewCount ?? null;
        const url = handle ? `https://www.tiktok.com/${handle}/video/${id}` : null;
        const views = (typeof play === "number") ? play : parseCount(play);
        if (url && !seen.has(url)) {
          seen.add(url);
          out.push({ url, views });
        }
      }
    }
    return out;
  }

  function extractFromUNI(u) {
    const out = [];
    const seen = new Set();
    const scope = u?.__DEFAULT_SCOPE__ || u?.__DEFAULT_SCOPE__?.webapp || u?.__DEFAULT_SCOPE__;

    const mod = scope?.ItemModule || scope?.itemModule || u?.ItemModule || u?.itemModule;
    if (mod && typeof mod === "object") debug.hasItemModule = true;

    const handle = getHandleFromPath();
    if (mod && typeof mod === "object") {
      for (const [id, it] of Object.entries(mod)) {
        const play = it?.stats?.playCount ?? it?.stats?.viewCount ?? null;
        const url = handle ? `https://www.tiktok.com/${handle}/video/${id}` : null;
        const views = (typeof play === "number") ? play : parseCount(play);
        if (url && !seen.has(url)) {
          seen.add(url);
          out.push({ url, views });
        }
      }
    }
    return out;
  }

  let vids = [];
  if (uni) vids = extractFromUNI(uni);
  if ((!vids || vids.length === 0) && sigi) vids = extractFromSIGI(sigi);

  if (!vids || vids.length === 0) {
    const anchors = Array.from(document.querySelectorAll('a[href*="/video/"]'));
    const seen = new Set();
    const domVideos = [];

    for (const a of anchors) {
      const href = a.getAttribute("href") || "";
      if (!href.includes("/video/")) continue;
      const url = href.startsWith("http") ? href : `https://www.tiktok.com${href}`;
      if (seen.has(url)) continue;
      seen.add(url);

      let views = null;
      const tile = a.closest("div") || a.parentElement;
      if (tile) {
        const txt = (tile.innerText || "").trim();
        const m = txt.match(/(\d[\d.,]*\s*[KMB]?)/i);
        if (m) views = parseCount(m[1]);
      }

      domVideos.push({ url, views });
    }

    if (domVideos.length > 0) {
      vids = domVideos;
      debug.foundVideoNode = true;
    }
  }

  const profileHandle = getHandleFromPath();

  const withViews = vids.filter(v => typeof v.views === "number");
  const withoutViews = vids.filter(v => typeof v.views !== "number");
  withViews.sort((a, b) => (b.views ?? -Infinity) - (a.views ?? -Infinity));
  vids = [...withViews, ...withoutViews].slice(0, 80);

  return {
    ok: true,
    engineVersion: debug.engineVersion,
    profileHandle,
    followers,
    videos: vids,
    debug
  };
}

// Runs on video page: likes/comments best effort
function page_extractVideoStats() {
  function parseCount(str) {
    if (!str) return null;
    const s = String(str).trim().toUpperCase().replace(/,/g, "");
    const m = s.match(/^(\d+(\.\d+)?)([KM])?$/);
    if (m) {
      const num = Number(m[1]);
      if (!Number.isFinite(num)) return null;
      const suf = m[3];
      if (suf === "K") return Math.round(num * 1000);
      if (suf === "M") return Math.round(num * 1000000);
      return Math.round(num);
    }
    const digits = s.replace(/[^\d]/g, "");
    if (!digits) return null;
    const n = Number(digits);
    return Number.isFinite(n) ? n : null;
  }

  function tryParseJSONScriptById(id) {
    const el = document.getElementById(id);
    if (!el) return null;
    const txt = el.textContent || el.innerText || "";
    if (!txt) return null;
    try { return JSON.parse(txt); } catch { return null; }
  }

  const debug = {
    url: location.href,
    hasUNI: false,
    hasSIGI: false,
    foundStatsLike: false,
    foundVideoNode: false,
    err: null
  };

  if (location.pathname.includes("/login")) {
    debug.err = "redirected_to_login";
    return { ok: false, error: "TikTok redirected to login. Try a public profile you can view.", debug };
  }

  const uni = tryParseJSONScriptById("__UNIVERSAL_DATA_FOR_REHYDRATION__");
  const sigi = tryParseJSONScriptById("SIGI_STATE");
  debug.hasUNI = !!uni;
  debug.hasSIGI = !!sigi;

  function extractFromUNI(u) {
    const scope = u?.__DEFAULT_SCOPE__ || u?.__DEFAULT_SCOPE__?.webapp || u?.__DEFAULT_SCOPE__;
    const itemStruct =
      scope?.["webapp.video-detail"]?.itemInfo?.itemStruct ||
      null;

    const stats = itemStruct?.stats || null;
    if (stats) {
      debug.foundStatsLike = true;
      const views = (typeof stats.playCount === "number") ? stats.playCount : parseCount(stats.playCount);
      const likes = (typeof stats.diggCount === "number") ? stats.diggCount : parseCount(stats.diggCount);
      const comments = (typeof stats.commentCount === "number") ? stats.commentCount : parseCount(stats.commentCount);
      return { views, likes, comments };
    }
    return null;
  }

  function extractFromSIGI(s) {
    const itemModule = s?.ItemModule || s?.itemModule;
    if (!itemModule || typeof itemModule !== "object") return null;

    const m = location.pathname.match(/\/video\/(\d+)/);
    const vid = m ? m[1] : null;
    const it = vid && itemModule[vid] ? itemModule[vid] : null;
    const candidate = it || Object.values(itemModule)[0] || null;

    const stats = candidate?.stats || null;
    if (stats) {
      debug.foundStatsLike = true;
      const views = (typeof stats.playCount === "number") ? stats.playCount : parseCount(stats.playCount);
      const likes = (typeof stats.diggCount === "number") ? stats.diggCount : parseCount(stats.diggCount);
      const comments = (typeof stats.commentCount === "number") ? stats.commentCount : parseCount(stats.commentCount);
      return { views, likes, comments };
    }
    return null;
  }

  let out = null;
  if (uni) out = extractFromUNI(uni);
  if (!out && sigi) out = extractFromSIGI(sigi);

  if (!out) {
    debug.foundVideoNode = !!document.body;
    return { ok: true, views: null, likes: null, comments: null, debug };
  }

  return { ok: true, ...out, debug };
}

/* ==========================================================
   Scan coordinator
   ========================================================== */

async function runProfileScan(tabId) {
  const tab = await chrome.tabs.get(tabId).catch(() => null);
  const url = tab?.url || "";
  if (!url.includes("tiktok.com/")) {
    return { ok: false, error: "Not on a TikTok page." };
  }

  const result = await execOnTab(tabId, page_extractProfileViewsOnly, []);
  if (!result || result.ok !== true) {
    return { ok: false, error: "Injector returned null/empty result for profile scan." };
  }

  if (result?.debug) result.debug.engineVersion = ENGINE_VERSION;

  return {
    ok: true,
    data: {
      engineVersion: ENGINE_VERSION,
      profileHandle: result.profileHandle || "",
      followers: (typeof result.followers === "number") ? result.followers : null,
      videos: Array.isArray(result.videos) ? result.videos : [],
      debug: result.debug || null,
    },
  };
}

async function deepScanOneVideoUrl(url) {
  const tab = await chrome.tabs.create({ url, active: false });
  const tabId = tab.id;
  if (!tabId) return { ok: false, error: "Failed to create tab." };

  try {
    await waitForTabComplete(tabId, TAB_LOAD_TIMEOUT_MS);
    let res = await execOnTab(tabId, page_extractVideoStats, []);
    if (!res || res.ok !== true) {
      await sleep(INJECT_RETRY_DELAY_MS);
      res = await execOnTab(tabId, page_extractVideoStats, []);
    }
    if (!res) return { ok: false, error: "Deep scan injector returned null/empty.", debug: null };
    if (res.ok !== true) return { ok: false, error: res.error || "Deep scan failed.", debug: res.debug || null };
    return { ok: true, views: res.views ?? null, likes: res.likes ?? null, comments: res.comments ?? null, debug: res.debug || null };
  } finally {
    try { await chrome.tabs.remove(tabId); } catch {}
  }
}

async function runDeepScan(videos, deepLimit) {
  const limit = clamp(deepLimit, 1, 20);
  const out = [];
  const cache = new Map();

  const targets = (Array.isArray(videos) ? videos : [])
    .filter(v => v && v.url)
    .slice(0, limit);

  for (const v of targets) {
    const url = v.url;
    if (cache.has(url)) {
      out.push({ ...v, ...cache.get(url) });
      continue;
    }

    const res = await deepScanOneVideoUrl(url);
    if (res?.ok) {
      const merged = {
        views: (typeof v.views === "number") ? v.views : (typeof res.views === "number" ? res.views : v.views),
        likes: res.likes ?? null,
        comments: res.comments ?? null
      };
      cache.set(url, merged);
      out.push({ ...v, ...merged });
    } else {
      console.warn("⚠️ SW: deep scan got no usable result", url, res?.error || res?.debug);
      out.push({ ...v });
    }
  }

  const rest = (Array.isArray(videos) ? videos : []).slice(targets.length);
  return [...out, ...rest];
}

async function scanProfileOnTab(tabId, { deep, deepLimit, forceFresh }) {
  const base = await runProfileScan(tabId);
  if (!base.ok) return base;

  if (!deep) return base;

  const vids = base.data.videos || [];
  const enriched = await runDeepScan(vids, deepLimit || 12);

  return { ok: true, data: { ...base.data, videos: enriched } };
}

/* ==========================================================
   Messaging
   ========================================================== */

chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  (async () => {
    try {
      if (msg?.type === "GET_PRO_STATUS") {
        const st = await getProStatus({ forceRefresh: !!msg.forceRefresh });
        return sendResponse({ ok: true, ...st });
      }

      if (msg?.type === "SET_PRO_TOKEN") {
        const token = String(msg.token || "").trim();
        await setInStorage({ [KEY_PRO_TOKEN]: token });
        const st = await getProStatus({ forceRefresh: true });
        return sendResponse({ ok: true, ...st });
      }

      if (msg?.type === "SCAN_PROFILE") {
        const tabId = msg.tabId ?? sender?.tab?.id;
        if (!tabId) return sendResponse({ ok: false, error: "Missing tabId" });

        const deepRequested = !!msg.deep;
        const deepLimit = Number(msg.deepLimit || 12);
        const forceFresh = !!msg.forceFresh;

        const pro = await getProStatus();
        const deepAllowed = pro.pro === true;
        const deep = deepRequested && deepAllowed;

        const resp = await scanProfileOnTab(tabId, { deep, deepLimit, forceFresh });

        // Enforce tier behavior: regular scan strips likes/comments (followers stays)
        if (resp?.ok && resp?.data && !deep && Array.isArray(resp.data.videos)) {
          resp.data.videos = resp.data.videos.map((v) => {
            const { likes, comments, ...rest } = v || {};
            return rest;
          });
        }

        if (resp?.ok && resp?.data && deepRequested && !deepAllowed) {
          resp.data._proNote = "Deep Scan is Pro (likes/comments). Upgrade to unlock full stats 🐹💸";
        }

        return sendResponse(resp);
      }

      if (msg?.type === "EXPORT_CSV" || msg?.type === "EXPORT_JSON") {
        const pro = await getProStatus();
        if (!pro.pro) return sendResponse({ ok: false, error: "Export is Pro-only 💸🐹" });

        const data = msg.data;
        if (!data) return sendResponse({ ok: false, error: "No data to export." });

        const safeHandle = safeStr(data.profileHandle || "tiktok").replace(/[^a-z0-9_\-@]/gi, "_");
        const ts = new Date().toISOString().replace(/[:.]/g, "-");

        if (msg.type === "EXPORT_CSV") {
          await downloadTextFile({
            filename: `hamlytics_${safeHandle}_${ts}.csv`,
            text: toCSV(data),
            mime: "text/csv"
          });
          return sendResponse({ ok: true });
        } else {
          await downloadTextFile({
            filename: `hamlytics_${safeHandle}_${ts}.json`,
            text: JSON.stringify(data, null, 2),
            mime: "application/json"
          });
          return sendResponse({ ok: true });
        }
      }

      return sendResponse({ ok: false, error: "Unknown message type" });
    } catch (e) {
      console.error("SW error:", e);
      return sendResponse({ ok: false, error: String(e?.message || e) });
    }
  })();

  return true;
});
