// src/stats_engine_injected.js
// 🔒 Hamlytics Stats Engine — FROZEN
// Do NOT edit except to fix stats extraction when TikTok changes.
// Must be self-contained. Must always return an object.

(() => {
  const ENGINE_VERSION = "2026-01-01-frozen-1";

  // Expose ping + extractor in the isolated world global
  globalThis.__hamlytics_ping = () => ({ ok: true, engineVersion: ENGINE_VERSION });

  globalThis.__hamlytics_extract = () => {
    const debug = {
      engineVersion: ENGINE_VERSION,
      hasSIGI: false,
      hasUNI: false,
      hasItemModule: false,
      foundVideoNode: false,
      foundStatsLike: false,
      matchCounts: { keyMatch: 0, idMatch: 0, scannedNodes: 0 },
      dom: { viewsText: null },
      hints: [],
      err: null
    };

    try {
      const tryParseJsonScriptById = (id) => {
        const el = document.getElementById(id);
        if (!el) return null;
        const txt = el.textContent || "";
        if (!txt) return null;
        try { return JSON.parse(txt); } catch { return null; }
      };

      const getVideoId = () => {
        const m = location.href.match(/\/video\/(\d+)/);
        return m ? m[1] : null;
      };

      const num = (x) => {
        const n = Number(x);
        return Number.isFinite(n) ? n : null;
      };

      const engagementFrom = (views, likes, comments) => {
        if (typeof views === "number" && views > 0) {
          const L = typeof likes === "number" ? likes : 0;
          const C = typeof comments === "number" ? comments : 0;
          return (L + C) / views;
        }
        return null;
      };

      const looksLikeStatsContainer = (obj) => {
        if (!obj || typeof obj !== "object") return false;
        if (obj.stats && typeof obj.stats === "object") return true;
        if (obj.statistics && typeof obj.statistics === "object") return true;
        if (obj.statsV2 && typeof obj.statsV2 === "object") return true;

        const keys = Object.keys(obj);
        return keys.some((k) =>
          ["playCount", "diggCount", "commentCount", "viewCount", "likeCount"].includes(k)
        );
      };

      const extractStatsFromAnyNode = (node) => {
        if (!node || typeof node !== "object") return { views: null, likes: null, comments: null };

        const maybeStats =
          node.stats ||
          node.statsV2 ||
          node.statistics ||
          node?.itemStruct?.stats ||
          node?.itemStruct?.statsV2 ||
          node?.itemInfo?.itemStruct?.stats ||
          node?.itemInfo?.itemStruct?.statsV2 ||
          node?.itemInfo?.stats ||
          node?.video?.stats ||
          node?.video?.statistics ||
          null;

        const s = (maybeStats && typeof maybeStats === "object") ? maybeStats : node;

        const views =
          s.playCount != null ? num(s.playCount) :
          s.viewCount != null ? num(s.viewCount) :
          s.play_count != null ? num(s.play_count) :
          s.stats?.playCount != null ? num(s.stats.playCount) :
          null;

        const likes =
          s.diggCount != null ? num(s.diggCount) :
          s.likeCount != null ? num(s.likeCount) :
          s.digg_count != null ? num(s.digg_count) :
          s.stats?.diggCount != null ? num(s.stats.diggCount) :
          null;

        const comments =
          s.commentCount != null ? num(s.commentCount) :
          s.comment_count != null ? num(s.comment_count) :
          s.stats?.commentCount != null ? num(s.stats.commentCount) :
          null;

        return { views, likes, comments };
      };

      const findBestVideoNodeDeep = (root, videoId, maxNodes = 90000) => {
        const q = [root];
        const vidStr = String(videoId);
        let seen = 0;

        let best = null;
        let bestScore = -1;

        const scoreNode = (node) => {
          if (!node || typeof node !== "object") return -1;
          let score = 0;

          if (looksLikeStatsContainer(node)) score += 3;
          if (node.stats || node.statistics || node.statsV2) score += 2;

          const keys = Object.keys(node);
          if (keys.some((k) => ["desc", "createTime", "author", "authorInfo", "music", "video"].includes(k))) score += 1;
          return score;
        };

        while (q.length && seen < maxNodes) {
          const node = q.shift();
          seen++;
          debug.matchCounts.scannedNodes = seen;

          if (!node || typeof node !== "object") continue;

          // A) object keyed by videoId
          if (!Array.isArray(node) && Object.prototype.hasOwnProperty.call(node, vidStr)) {
            debug.matchCounts.keyMatch += 1;
            const cand = node[vidStr];
            if (cand && typeof cand === "object") {
              const sc = scoreNode(cand);
              if (sc > bestScore) {
                bestScore = sc;
                best = cand;
                if (bestScore >= 4) break;
              }
            }
          }

          // B) id-like fields
          if (!Array.isArray(node)) {
            const id =
              node.id ??
              node.awemeId ?? node.aweme_id ??
              node.itemId ?? node.item_id ??
              node.videoId ?? node.video_id ??
              node.mediaId ?? node.media_id;

            if (id != null && String(id) === vidStr) {
              debug.matchCounts.idMatch += 1;
              const sc = scoreNode(node);
              if (sc > bestScore) {
                bestScore = sc;
                best = node;
                if (bestScore >= 4) break;
              }
            }
          }

          // BFS
          if (Array.isArray(node)) {
            for (const v of node) q.push(v);
          } else {
            for (const v of Object.values(node)) q.push(v);
          }
        }

        return best;
      };

      // Login wall
      if ((location.pathname || "").includes("/login")) {
        return { ok: false, error: "Redirected to login.", debug };
      }

      const vid = getVideoId();
      if (!vid) return { ok: false, error: "No video id in URL.", debug };

      // UNI first
      const uni  = tryParseJsonScriptById("__UNIVERSAL_DATA_FOR_REHYDRATION__");
      const sigi = tryParseJsonScriptById("SIGI_STATE");

      debug.hasUNI = !!uni;
      debug.hasSIGI = !!sigi;

      const state = uni || sigi;
      debug.hasItemModule = !!(state && state.ItemModule);

      if (!state) {
        debug.hints.push("No UNI or SIGI JSON scripts found.");
        return { ok: false, error: "No JSON state found.", debug };
      }

      const node = findBestVideoNodeDeep(state, vid);
      debug.foundVideoNode = !!node;

      if (node) {
        let { views, likes, comments } = extractStatsFromAnyNode(node);

        if (views == null && likes == null && comments == null) {
          const nested = [
            node.itemStruct,
            node.itemInfo,
            node.itemInfo?.itemStruct,
            node.video,
            node.video?.stats,
            node.video?.statistics,
            node.stats,
            node.statistics,
            node.statsV2
          ].filter(Boolean);

          for (const cand of nested) {
            const r = extractStatsFromAnyNode(cand);
            if (r.views != null || r.likes != null || r.comments != null) {
              views = r.views;
              likes = r.likes;
              comments = r.comments;
              break;
            }
          }
        }

        debug.foundStatsLike = (views != null || likes != null || comments != null);
        const engagement = engagementFrom(views, likes, comments);

        if (views != null || likes != null || comments != null) {
          return { ok: true, data: { url: location.href, views, likes, comments, engagement }, debug };
        }
      }

      // DOM clue (debug only)
      const viewNode = Array.from(document.querySelectorAll("span, strong, div"))
        .find((el) => /views/i.test(el.textContent || ""));
      if (viewNode) debug.dom.viewsText = (viewNode.textContent || "").trim();

      debug.hints.push("UNI/SIGI found but stats not extracted.");
      return { ok: false, error: "No stats found (UNI parse).", debug };
    } catch (e) {
      debug.err = e?.message || String(e);
      debug.hints.push("Extractor threw an exception. See debug.err");
      return { ok: false, error: "Extractor exception.", debug };
    }
  };

  // optional: mark loaded
  globalThis.__hamlytics_engine_loaded = true;
})();
