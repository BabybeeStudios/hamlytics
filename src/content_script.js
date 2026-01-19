// src/content_script.js
// Hamlytics — Regular Scan (FAST): profile handle + video URLs + videoIds + VIEWS
// Fixes:
// 1) TikTok profile pages often hide/move views in UNI/SIGI => add DOM fallback (tile labels)
// 2) TikTok lazy-loads videos => optional auto-scroll to load more before scanning

console.log("🐹 CS: content_script loaded");

function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

function getProfileHandleFromPath() {
  const parts = (location.pathname || "").split("/").filter(Boolean);
  const maybe = parts[0] || "";
  return maybe.startsWith("@") ? maybe.replace("@", "") : null;
}

function tryParseJsonScriptById(id) {
  const el = document.getElementById(id);
  if (!el) return null;
  const txt = el.textContent || "";
  if (!txt) return null;
  try { return JSON.parse(txt); } catch { return null; }
}

function getTikTokStateFromDoc() {
  const uni = tryParseJsonScriptById("__UNIVERSAL_DATA_FOR_REHYDRATION__");
  if (uni) return { kind: "UNI", data: uni };
  const sigi = tryParseJsonScriptById("SIGI_STATE");
  if (sigi) return { kind: "SIGI_STATE", data: sigi };
  return null;
}

function safeNum(x) {
  const n = Number(x);
  return Number.isFinite(n) ? n : null;
}

function parseAbbrevNumber(s) {
  // handles "12", "12.3K", "4.5M", "1.2B"
  if (!s) return null;
  const t = String(s).trim().toUpperCase().replace(/,/g, "");
  const m = t.match(/^(\d+(?:\.\d+)?)\s*([KMB])?$/);
  if (!m) return null;
  const base = Number(m[1]);
  if (!Number.isFinite(base)) return null;
  const mult = m[2] === "K" ? 1e3 : m[2] === "M" ? 1e6 : m[2] === "B" ? 1e9 : 1;
  return Math.round(base * mult);
}

function absUrl(href) {
  if (!href) return "";
  return href.startsWith("http") ? href : new URL(href, location.origin).toString();
}

function extractVideoIdFromUrl(url) {
  const m = String(url || "").match(/\/video\/(\d+)/);
  return m ? m[1] : null;
}

function collectVideoAnchors(profileHandle) {
  const anchors = Array.from(document.querySelectorAll('a[href*="/video/"]'));
  // Filter to this profile’s videos to prevent leakage
  return anchors.filter(a => {
    const href = absUrl(a.getAttribute("href"));
    if (!href.includes("/video/")) return false;
    if (profileHandle && !href.includes(`/@${profileHandle}/video/`)) return false;
    return true;
  });
}

function collectVideos(profileHandle) {
  const seen = new Set();
  const videos = [];

  for (const a of collectVideoAnchors(profileHandle)) {
    const href = absUrl(a.getAttribute("href"));
    const videoId = extractVideoIdFromUrl(href);
    if (!videoId) continue;
    const key = `${profileHandle || ""}:${videoId}`;
    if (seen.has(key)) continue;
    seen.add(key);
    videos.push({ url: href, videoId });
  }

  return videos;
}

function extractViewsFromDOMAnchor(a) {
  // TikTok often shows views on the thumbnail tile (e.g., "12.3K")
  // We try a few common patterns without relying on brittle classnames.

  try {
    // 1) aria-label often contains numbers, but varies.
    const aria = a.getAttribute("aria-label") || "";
    // Sometimes aria has "... 12.3K views" or similar
    let m = aria.toUpperCase().match(/(\d+(?:\.\d+)?\s*[KMB]?)\s*VIEWS?/);
    if (m) return parseAbbrevNumber(m[1]);

    // 2) Look for nearby text nodes that match abbreviated counts
    // Search within the anchor for small labels
    const text = (a.innerText || "").trim();
    // Many tiles include just the number (e.g., "12.3K")
    // We'll pick the first token that looks like an abbrev number.
    const tokens = text.split(/\s+/).slice(0, 12);
    for (const tok of tokens) {
      const v = parseAbbrevNumber(tok);
      if (v != null) return v;
    }

    // 3) Some layouts use SVG + sibling span
    const spans = a.querySelectorAll("span, strong, p, div");
    for (const el of spans) {
      const t = (el.textContent || "").trim();
      const v = parseAbbrevNumber(t);
      if (v != null) return v;
      const mm = t.toUpperCase().match(/(\d+(?:\.\d+)?\s*[KMB]?)/);
      if (mm) {
        const vv = parseAbbrevNumber(mm[1]);
        if (vv != null) return vv;
      }
    }
  } catch (_) {}

  return null;
}

function extractViewsFromAnyNode(node) {
  if (!node || typeof node !== "object") return null;

  const stats =
    node?.stats ||
    node?.statsV2 ||
    node?.statistics ||
    node?.itemStruct?.stats ||
    node?.itemStruct?.statsV2 ||
    node?.itemInfo?.itemStruct?.stats ||
    node?.itemInfo?.itemStruct?.statsV2 ||
    node?.itemInfo?.stats ||
    node?.video?.stats ||
    node?.video?.statistics ||
    null;

  const s = (stats && typeof stats === "object") ? stats : node;

  const views =
    s?.playCount != null ? safeNum(s.playCount) :
    s?.viewCount != null ? safeNum(s.viewCount) :
    s?.play_count != null ? safeNum(s.play_count) :
    node?.playCount != null ? safeNum(node.playCount) :
    node?.viewCount != null ? safeNum(node.viewCount) :
    null;

  return views;
}

function getNodeId(node) {
  if (!node || typeof node !== "object") return null;
  const id =
    node.id ??
    node.awemeId ?? node.aweme_id ??
    node.itemId ?? node.item_id ??
    node.videoId ?? node.video_id ??
    node.mediaId ?? node.media_id ??
    node?.itemStruct?.id ??
    node?.itemStruct?.awemeId ??
    node?.itemStruct?.aweme_id ??
    node?.itemInfo?.itemStruct?.id ??
    node?.itemInfo?.itemStruct?.awemeId ??
    node?.itemInfo?.itemStruct?.aweme_id ??
    null;
  return id != null ? String(id) : null;
}

function buildViewsMapByIds(stateObj, idSet, maxNodes = 80000) {
  const map = new Map();
  if (!stateObj || typeof stateObj !== "object" || !idSet || idSet.size === 0) return map;

  const q = [stateObj];
  let seen = 0;

  while (q.length && seen < maxNodes) {
    const node = q.shift();
    seen++;

    if (!node || typeof node !== "object") continue;

    // A) object keyed by videoId -> node
    if (!Array.isArray(node)) {
      const keys = Object.keys(node);
      if (keys.length && /^\d{10,25}$/.test(keys[0] || "")) {
        for (const k of keys.slice(0, 120)) {
          if (!idSet.has(k)) continue;
          const cand = node[k];
          const v = extractViewsFromAnyNode(cand);
          if (typeof v === "number") map.set(k, v);
        }
      }
    }

    // B) node has an id field matching a videoId
    const nid = getNodeId(node);
    if (nid && idSet.has(nid)) {
      const v = extractViewsFromAnyNode(node);
      if (typeof v === "number") map.set(nid, v);
    }

    if (map.size >= idSet.size) break;

    // BFS traverse
    if (Array.isArray(node)) {
      for (const v of node) q.push(v);
    } else {
      for (const v of Object.values(node)) q.push(v);
    }
  }

  return map;
}

async function autoScrollToLoadMore(profileHandle, targetCount, passes = 6) {
  // TikTok loads more videos when you scroll.
  // We do gentle scroll steps and stop early if we reach targetCount.
  const maxPasses = Math.max(0, Math.min(20, Number(passes) || 0));
  const want = Math.max(0, Number(targetCount) || 0);

  let best = 0;
  for (let i = 0; i < maxPasses; i++) {
    // Scroll down a chunk
    window.scrollBy(0, Math.max(600, Math.floor(window.innerHeight * 0.9)));
    await sleep(800);

    // Count loaded videos
    const vids = collectVideos(profileHandle).length;
    best = Math.max(best, vids);

    if (want && best >= want) break;
  }

  // Small settle time
  await sleep(500);
  return best;
}

async function scanInPage(opts = {}) {
  const profileHandle = getProfileHandleFromPath();
  if (!profileHandle) {
    return { ok: false, error: "Analyzer not ready. Open a TikTok profile URL like https://www.tiktok.com/@handle" };
  }

  const targetCount = Math.max(0, Number(opts.targetCount) || 0);
  const autoScroll = !!opts.autoScroll;
  const scrollPasses = Math.max(0, Number(opts.scrollPasses) || 0);

  if (autoScroll) {
    await autoScrollToLoadMore(profileHandle, targetCount, scrollPasses || 6);
  }

  // Collect videos AFTER scrolling
  const videos = collectVideos(profileHandle);

  // Build id set
  const idSet = new Set(videos.map(v => String(v.videoId)).filter(Boolean));

  // Get state (UNI/SIGI)
  const stateWrap = getTikTokStateFromDoc();
  const state = stateWrap?.data || null;

  // 1) Try views from state (if present)
  const viewsFromState = buildViewsMapByIds(state, idSet);

  // 2) Also build views from DOM tiles as fallback (most reliable on profile)
  const anchors = collectVideoAnchors(profileHandle);
  const viewsFromDom = new Map();
  for (const a of anchors) {
    const href = absUrl(a.getAttribute("href"));
    const vid = extractVideoIdFromUrl(href);
    if (!vid) continue;
    if (!idSet.has(String(vid))) continue;
    const v = extractViewsFromDOMAnchor(a);
    if (typeof v === "number") viewsFromDom.set(String(vid), v);
  }

  // Attach views: prefer DOM (what user sees), fallback to state
  let attached = 0;
  let fromDomCount = 0;
  let fromStateCount = 0;

  for (const v of videos) {
    const vid = String(v.videoId);
    const domV = viewsFromDom.get(vid);
    const stV = viewsFromState.get(vid);

    if (typeof domV === "number") {
      v.views = domV;
      attached++;
      fromDomCount++;
    } else if (typeof stV === "number") {
      v.views = stV;
      attached++;
      fromStateCount++;
    }
  }

  const debug = {
    kind: stateWrap?.kind || null,
    hasUNI: stateWrap?.kind === "UNI",
    hasSIGI: stateWrap?.kind === "SIGI_STATE",
    targetCount,
    autoScroll,
    scrollPasses: scrollPasses || (autoScroll ? 6 : 0),
    videosFound: videos.length,
    viewsAttached: attached,
    viewsFromDom: fromDomCount,
    viewsFromState: fromStateCount
  };

  return { ok: true, data: { profileHandle, videos, debug } };
}

chrome.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
  (async () => {
    try {
      if (msg?.type === "PING_CS") {
        sendResponse({ ok: true });
        return;
      }
      if (msg?.type === "SCAN_IN_PAGE") {
        const res = await scanInPage(msg || {});
        sendResponse(res);
        return;
      }
      sendResponse({ ok: false, error: "Unknown CS message type" });
    } catch (e) {
      sendResponse({ ok: false, error: e?.message || "Content script error" });
    }
  })();
  return true;
});
