// =====================================================
// index.js — YouTube Worker v9 (PRO - Anti Block Edition)
// ✅ FIX: Smart Handle Resolver, Robust Metadata (Tags/Desc/Title), Latest API Clients
// =====================================================

export default {
  async fetch(request) {
    const url = new URL(request.url);
    const cors = { "Access-Control-Allow-Origin": "*", "Access-Control-Allow-Methods": "GET, OPTIONS", "Access-Control-Allow-Headers": "Content-Type" };
    if (request.method === "OPTIONS") return new Response(null, { headers: cors });

    const UA = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0.0.0 Safari/537.36";
    const YT_COOKIES = "CONSENT=YES+cb.20240101-00-p0.en+FX+100; SOCS=CAI";
    const FALLBACK_KEY = "AIzaSyAO_FJ2SlqU8Q4STEHLGCilw_Y9_11qcW8";

    const withTimeout = (ms) => { const c = new AbortController(); const t = setTimeout(() => c.abort(), ms); return { signal: c.signal, done: () => clearTimeout(t) }; };
    const esc = (s) => String(s || "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&apos;");

    const KNOWN_CHANNELS = { "@aajtak": "UCt4t-jeY85JegMlZ-E5UWtA", "@abpnews": "UCRWFSbif-RFENbBrSiez1DA", "@zeenews": "UCIvaYmXn910QMdemBG3v1pQ", "@news18india": "UCPP3etACgdUWvizcES1dJ8Q", "@dlsnews": "UCw0ry7cLRUnq3Oaszlhgqfg", "@indiatvnews": "UCC9BmFerE1xxhZu5VmYhMkA" };
    const INVIDIOUS = ["https://inv.tux.pizza", "https://invidious.jing.rocks", "https://invidious.nerdvpn.de", "https://invidious.protokolla.fi"];
    const PIPED = ["https://pipedapi.kavin.rocks", "https://pipedapi.12a.app", "https://api.piped.minionflo.net"];

    const json = (obj, status = 200, extra = {}) => new Response(JSON.stringify(obj), { status, headers: { ...cors, "Content-Type": "application/json", ...extra } });
    const xml = (body, extra = {}) => new Response(body, { headers: { ...cors, "Content-Type": "application/xml; charset=utf-8", "Cache-Control": "public, max-age=600", ...extra } });

    async function getJSON(u, ms = 7000) { try { const to = withTimeout(ms); const r = await fetch(u, { signal: to.signal, headers: { "User-Agent": UA, "Accept": "application/json" } }); to.done(); if (!r.ok) return null; return await r.json(); } catch (e) { return null; } }

    function relToIso(text) { const m = String(text || "").match(/(\d+)\s*(second|minute|hour|day|week|month|year)/i); if (!m) return new Date().toISOString(); const n = parseInt(m[1], 10); const map = { second: 1e3, minute: 6e4, hour: 36e5, day: 864e5, week: 6048e5, month: 26298e5, year: 315576e5 }; return new Date(Date.now() - n * map[m[2].toLowerCase()]).toISOString(); }

    function buildAtomXml(items, channelTitle) {
      const entries = items.map(v => `  <entry>\n    <id>yt:video:${esc(v.id)}</id>\n    <yt:videoId>${esc(v.id)}</yt:videoId>\n    <title>${esc(v.title)}</title>\n    <published>${esc(v.published)}</published>\n    <author><name>${esc(v.channelTitle || channelTitle)}</name></author>\n    <media:thumbnail url="${esc(v.thumbnail)}"/>\n  </entry>`).join("\n");
      return `<?xml version="1.0" encoding="UTF-8"?>\n<feed xmlns="http://www.w3.org/2005/Atom" xmlns:yt="http://www.youtube.com/xml/schemas/2015" xmlns:media="http://search.yahoo.com/mrss/">\n<title>${esc(channelTitle)}</title>\n${entries}\n</feed>`;
    }

    async function fetchRss(channelId) { try { const to = withTimeout(8000); const r = await fetch(`https://www.youtube.com/feeds/videos.xml?channel_id=${channelId}`, { signal: to.signal, headers: { "User-Agent": UA } }); to.done(); if (r.ok) { const t = await r.text(); if (t.includes("<entry")) return t; } } catch (e) { } return null; }

    // ✅ FIX: InnerTube API Helper with Latest Client Version
    async function innertubePost(endpoint, apiKey, extra) { 
        try { 
            const to = withTimeout(9000); 
            const r = await fetch(`https://www.youtube.com/youtubei/v1/${endpoint}?key=${apiKey}&prettyPrint=false`, { 
                method: "POST", signal: to.signal, 
                headers: { "Content-Type": "application/json", "User-Agent": UA }, 
                body: JSON.stringify({ context: { client: { clientName: "WEB", clientVersion: "2.20240904.00.00", hl: "hi", gl: "IN" } }, ...extra }) 
            }); 
            to.done(); 
            if (!r.ok) return null; 
            return await r.json(); 
        } catch (e) { return null; } 
    }

    // ✅ FIX: Smart Handle Resolver (अगर HTML फेल हो तो API से सर्च करेगा)
    async function resolveHandle(handle) {
      const key = handle.toLowerCase();
      if (KNOWN_CHANNELS[key]) return [KNOWN_CHANNELS[key]];
      const candidates = [];
      const push = (id) => { if (id && id.startsWith("UC") && !candidates.includes(id)) candidates.push(id); };
      
      try {
        const to = withTimeout(6000);
        const r = await fetch(`https://www.youtube.com/${handle}`, { signal: to.signal, headers: { "User-Agent": UA, "Accept-Language": "en-US,en;q=0.9", "Cookie": YT_COOKIES } });
        to.done();
        if (r.ok) {
          const html = await r.text();
          const canon = html.match(/https:\/\/www\.youtube\.com\/(?:channel\/|c\/)?(UC[\w-]+)/); if (canon) push(canon[1]);
          const ext = html.match(/"externalId":"(UC[\w-]+)"/); if (ext) push(ext[1]);
          const itemprop = html.match(/itemprop="channelId"\s+content="(UC[\w-]+)"/); if (itemprop) push(itemprop[1]);
          let m; const re1 = /"channelId":"(UC[\w-]+)"/g;
          while ((m = re1.exec(html)) && candidates.length < 6) push(m[1]);
        }
      } catch (e) { }

      // 🔴 BRAHMASTRA: अगर Cloudflare ब्लॉक हो गया और ID नहीं मिली, तो InnerTube Search का इस्तेमाल करें
      if (candidates.length === 0) {
          const cleanQuery = handle.replace(/^@/, "").toLowerCase();
          const searchData = await innertubePost("search", FALLBACK_KEY, { query: cleanQuery, params: "EgIQAg==" }); // EgIQAg== means Channel Filter
          if (searchData) {
              const list = []; collectChannels(searchData, list, 0);
              const exactMatch = list.find(c => (c.url || "").toLowerCase().includes("@" + cleanQuery)) || list[0];
              if (exactMatch && exactMatch.id) push(exactMatch.id);
          }
      }
      return candidates;
    }

    function collectChannels(node, out, depth) {
      if (!node || typeof node !== "object" || depth > 40) return;
      if (Array.isArray(node)) { for (const x of node) collectChannels(x, out, depth + 1); return; }
      if (node.channelRenderer && node.channelRenderer.channelId) out.push({ id: node.channelRenderer.channelId, name: (node.channelRenderer.title && node.channelRenderer.title.simpleText) || "", url: node.channelRenderer.navigationEndpoint?.commandMetadata?.webCommandMetadata?.url || "" });
      for (const k in node) collectChannels(node[k], out, depth + 1);
    }

    async function scrapeChannelVideos(q) {
      const h = q.startsWith("@") ? q : "@" + q;
      const paths = q.startsWith("UC") ? [`/channel/${q}/videos`, `/channel/${q}`] : [`${h}/videos`, `${h}`];
      for (const p of paths) {
        try {
          const to = withTimeout(11000);
          const r = await fetch(`https://www.youtube.com${p}`, { signal: to.signal, headers: { "User-Agent": UA, "Accept-Language": "en-US,en;q=0.9", "Cookie": YT_COOKIES } });
          to.done();
          if (!r.ok) continue;
          const html = await r.text();
          const m = html.match(/ytInitialData\s*=\s*(\{[\s\S]+?\});\s*<\/script>/);
          if (!m) continue;
          let data; try { data = JSON.parse(m[1]); } catch (e) { continue; }
          const items = [];
          const walk = (node) => {
            if (!node || typeof node !== "object") return;
            if (Array.isArray(node)) { for (const x of node) walk(x); return; }
            const vr = node.videoRenderer;
            if (vr && vr.videoId) {
              const thumbs = ((vr.thumbnail || {}).thumbnails) || [];
              items.push({ id: vr.videoId, title: (((vr.title || {}).runs) || [{}])[0].text || "", published: relToIso((vr.publishedTimeText || {}).simpleText), thumbnail: (thumbs.length ? thumbs[thumbs.length - 1].url : "") || `https://i.ytimg.com/vi/${vr.videoId}/hqdefault.jpg`, channelTitle: (((vr.ownerText || {}).runs) || [{}])[0].text || "" });
            } else { for (const k in node) walk(node[k]); }
          };
          walk(data);
          const channelTitle = (data.metadata && data.metadata.channelMetadataRenderer && data.metadata.channelMetadataRenderer.title) || (data.header && data.header.c4TabbedHeaderRenderer && data.header.c4TabbedHeaderRenderer.title) || q;
          const clean = items.filter(v => v.id && v.title).slice(0, 15);
          if (clean.length) { clean.forEach(v => { if (!v.channelTitle) v.channelTitle = channelTitle; }); return { items: clean, channelTitle }; }
        } catch (e) { }
      }
      return { items: [], channelTitle: q };
    }

    async function innertubePlayer(apiKey, videoId, android) {
      const client = android ? { clientName: "ANDROID", clientVersion: "19.30.36", androidSdkVersion: 30, hl: "hi" } : { clientName: "WEB", clientVersion: "2.20240904.00.00", hl: "hi", gl: "IN" };
      try { const to = withTimeout(9000); const r = await fetch(`https://www.youtube.com/youtubei/v1/player?key=${apiKey}&prettyPrint=false`, { method: "POST", signal: to.signal, headers: { "Content-Type": "application/json", "User-Agent": UA }, body: JSON.stringify({ context: { client }, videoId }) }); to.done(); if (!r.ok) return null; return await r.json(); } catch (e) { return null; } 
    }

    function collectVideos(node, out, seen, depth) {
      if (!node || typeof node !== "object" || out.length >= 15 || depth > 40) return;
      if (Array.isArray(node)) { for (const x of node) collectVideos(x, out, seen, depth + 1); return; }
      const vr = node.videoRenderer;
      if (vr && vr.videoId && !seen[vr.videoId]) {
        seen[vr.videoId] = 1;
        const thumbs = ((vr.thumbnail || {}).thumbnails) || [];
        out.push({ id: vr.videoId, title: (((vr.title || {}).runs) || [{}])[0].text || "", published: relToIso((vr.publishedTimeText || {}).simpleText), thumbnail: (thumbs.length ? thumbs[thumbs.length - 1].url : "") || `https://i.ytimg.com/vi/${vr.videoId}/hqdefault.jpg`, channelTitle: (((vr.ownerText || {}).runs) || [{}])[0].text || "" });
      } else { for (const k in node) collectVideos(node[k], out, seen, depth + 1); }
    }

    async function innertubeChannelVideos(q, candidates) {
      const apiKey = FALLBACK_KEY;
      let ids = (candidates || []).slice(0, 2);
      for (const id of ids) {
        const b = await innertubePost("browse", apiKey, { browseId: id, params: "EgZ2aWRlb3M%3D" });
        if (b) { const items = []; collectVideos(b, items, {}, 0); const ci = items.filter(v => v.id && v.title); if (ci.length) return ci; }
      }
      return [];
    }

    // ===== TRANSCRIPT LAYERS =====
    async function transcriptFromTracks(tracks) {
      const pick = tracks.find(t => t.languageCode === "hi") || tracks.find(t => t.languageCode === "en") || tracks.find(t => t.kind !== "asr") || tracks[0];
      if (!pick || !pick.baseUrl) return { text: "", lang: "" };
      try {
        const to = withTimeout(9000); const r = await fetch(pick.baseUrl, { signal: to.signal, headers: { "User-Agent": UA } }); to.done();
        if (!r.ok) return { text: "", lang: "" };
        const x = await r.text();
        const text = x.replace(/<[^>]+>/g, " ").replace(/&amp;/g, "&").replace(/&#39;/g, "'").replace(/&quot;/g, '"').replace(/\s+/g, " ").trim();
        return { text, lang: pick.languageCode || "" };
      } catch (e) { return { text: "", lang: "" }; }
    }

    // ===== ✅ FIX: PRO METADATA EXTRACTION (Title, Tags, Description) =====
    async function handleVideoId(videoId) {
      const cache = await caches.open("v9-vid");
      const cacheKey = new Request(`https://cache.local/vid-${videoId}`);
      const cached = await cache.match(cacheKey);
      if (cached) {
        const t = await cached.text();
        try { const d = JSON.parse(t); if (d && (d.desc || d.tags?.length || d.title)) return new Response(t, { headers: { ...cors, "Content-Type": "application/json", "X-Cache": "HIT" } }); } catch (e) { }
      }

      let tags = [], desc = "", title = "", tracks = [];
      let apiKey = FALLBACK_KEY;
      
      try {
        const to = withTimeout(9000);
        const r = await fetch(`https://www.youtube.com/watch?v=${videoId}`, { signal: to.signal, headers: { "User-Agent": UA, "Accept-Language": "hi-IN,hi;q=0.9", "Cookie": YT_COOKIES } });
        to.done();
        if (r.ok) {
          const html = await r.text();
          const km = html.match(/"INNERTUBE_API_KEY":"([^"]+)"/); if (km) apiKey = km[1];
          
          // Better Regex for ytInitialPlayerResponse
          const pm = html.match(/ytInitialPlayerResponse\s*=\s*(\{.+?\})\s*;/);
          if (pm) { 
              try { 
                  const d = JSON.parse(pm[1]); 
                  title = (d.videoDetails && d.videoDetails.title) || "";
                  tags = (d.videoDetails && d.videoDetails.keywords) || []; 
                  desc = (d.videoDetails && d.videoDetails.shortDescription) || ""; 
                  tracks = (((d.captions || {}).playerCaptionsTracklistRenderer || {}).captionTracks) || []; 
              } catch (e) { } 
          }
          // Ultimate Regex Fallbacks
          if (!title) { const tm = html.match(/"title":"((?:[^"\\]|\\.)*)"/); if (tm) title = tm[1]; }
          if (!tags.length) { const k = html.match(/"keywords":\[(.*?)\]/s); if (k) tags = [...k[1].matchAll(/"((?:[^"\\]|\\.)*)"/g)].map(m => m[1]); }
          if (!desc) { const d = html.match(/"shortDescription":"((?:[^"\\]|\\.)*)"/s); if (d) desc = d[1].replace(/\\n/g, "\n").replace(/\\"/g, '"'); }
        }
      } catch (e) { }

      // Player API Fallback
      if (!desc || !tracks.length || !title) { 
          const p = await innertubePlayer(apiKey, videoId, false); 
          if (p && p.videoDetails) { 
              title = p.videoDetails.title || title;
              tags = p.videoDetails.keywords || tags; 
              desc = p.videoDetails.shortDescription || desc; 
              tracks = (((p.captions || {}).playerCaptionsTracklistRenderer || {}).captionTracks) || tracks; 
          } 
      }

      let tr = { text: "", lang: "" };
      if (tracks.length) tr = await transcriptFromTracks(tracks);

      // Return perfectly formatted JSON to your website
      const body = JSON.stringify({ status: "ok", videoId, title, tags, desc, transcript: tr.text, transcriptLang: tr.lang, hasCaptions: tracks.length > 0 });
      await cache.put(cacheKey, new Response(body, { headers: { "Cache-Control": "max-age=600" } }));
      return new Response(body, { headers: { ...cors, "Content-Type": "application/json" } });
    }

    try {
      if (url.searchParams.get("ping")) return json({ ok: true, version: "v9-PRO", time: new Date().toISOString() });

      const videoId = (url.searchParams.get("videoId") || url.searchParams.get("v") || "").trim();
      if (videoId) return handleVideoId(videoId);

      let query = (url.searchParams.get("channel_id") || url.searchParams.get("handle") || "").trim();
      if (!query) return json({ error: "Invalid Request" }, 400);

      const cache = await caches.open("v9-rss");
      const cacheKey = new Request(`https://cache.local/ch-${query.toLowerCase()}`);
      const cached = await cache.match(cacheKey);
      if (cached) { const t = await cached.text(); if (t.includes("<entry")) return xml(t, { "X-Cache": "HIT" }); }

      const errors = [];
      const candidates = query.startsWith("UC") ? [query] : await resolveHandle(query.startsWith("@") ? query : "@" + query);
      
      for (const cid of candidates) {
        const x = await fetchRss(cid);
        if (x) { await cache.put(cacheKey, new Response(x, { headers: { "Cache-Control": "max-age=900" } })); return xml(x, { "X-Source": "youtube-rss", "X-Channel-ID": cid }); }
      }

      const scraped = await scrapeChannelVideos(query);
      if (scraped.items.length) { const atom = buildAtomXml(scraped.items, scraped.channelTitle); await cache.put(cacheKey, new Response(atom, { headers: { "Cache-Control": "max-age=600" } })); return xml(atom, { "X-Source": "yt-scrape" }); }
      
      const itItems = await innertubeChannelVideos(query, candidates);
      if (itItems.length) { const atom = buildAtomXml(itItems, itItems[0].channelTitle || query); await cache.put(cacheKey, new Response(atom, { headers: { "Cache-Control": "max-age=600" } })); return xml(atom, { "X-Source": "innertube-browse" }); }
      
      return json({ error: "Channel videos नहीं मिले।", query, candidates, hint: "API Limits Reach हो गई है।" }, 502);
    } catch (e) {
      return json({ error: "Worker internal error", message: e.message }, 500);
    }
  }
};
