// index.js — Ultimate YouTube Worker (v4 FINAL)
// ✅ Known-channel map (verified IDs) | ✅ RSS validation | ✅ Invidious/Piped fallback
// ✅ Synthetic Atom XML (client बिना बदले चलेगा) | ✅ Success-only cache | ✅ CORS

export default {
  async fetch(request) {
    const url = new URL(request.url);
    const cors = {
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Methods": "GET, OPTIONS",
      "Access-Control-Allow-Headers": "Content-Type",
    };
    if (request.method === "OPTIONS") return new Response(null, { headers: cors });

    const UA = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0.0.0 Safari/537.36";
    const withTimeout = (ms) => { const c = new AbortController(); const t = setTimeout(() => c.abort(), ms); return { signal: c.signal, done: () => clearTimeout(t) }; };
    const esc = (s) => String(s || "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&apos;");

    // ✅ VERIFIED channel IDs (resolution fail होने पर guaranteed fallback)
    const KNOWN_CHANNELS = {
      "@aajtak": "UCt4t-jeY85JegMlZ-E5UWtA",        // verified
      "@abpnews": "UCRWFSbif-RFENbBrSiez1DA",       // verified
      "@zeenews": "UCIvaYmXn910QMdemBG3v1pQ",       // verified
      "@news18india": "UCPP3etACgdUWvizcES1dJ8Q",   // verified
    };

    const INVIDIOUS = [
      "https://inv.tux.pizza", "https://invidious.nerdvpn.de", "https://invidious.protokolla.fi",
      "https://yt.artemislena.eu", "https://inv.thepixora.com",
    ];
    const PIPED = [
      "https://pipedapi.kavin.rocks", "https://pipedapi.12a.app", "https://api.piped.minionflo.net",
      "https://pipedapi.leptons.xyz", "https://pipedapi.adminforge.de",
    ];

    const json = (obj, status = 200, extra = {}) => new Response(JSON.stringify(obj), { status, headers: { ...cors, "Content-Type": "application/json", ...extra } });
    const xml = (body, extra = {}) => new Response(body, { headers: { ...cors, "Content-Type": "application/xml; charset=utf-8", "Cache-Control": "public, max-age=600", ...extra } });

    async function getJSON(u, ms = 7000) {
      try {
        const to = withTimeout(ms);
        const r = await fetch(u, { signal: to.signal, headers: { "User-Agent": UA, "Accept": "application/json" } });
        to.done();
        if (!r.ok) return null;
        return await r.json();
      } catch (e) { return null; }
    }

    // ✅ Invidious/Piped data को Atom XML में बदलो — client parser बिना बदले चलेगा
    function buildAtomXml(items, channelTitle) {
      const entries = items.map(v => `  <entry>
    <id>yt:video:${esc(v.id)}</id>
    <yt:videoId>${esc(v.id)}</yt:videoId>
    <title>${esc(v.title)}</title>
    <published>${esc(v.published)}</published>
    <author><name>${esc(v.channelTitle || channelTitle)}</name></author>
    <media:thumbnail url="${esc(v.thumbnail)}"/>
  </entry>`).join("\n");
      return `<?xml version="1.0" encoding="UTF-8"?>
<feed xmlns="http://www.w3.org/2005/Atom" xmlns:yt="http://www.youtube.com/xml/schemas/2015" xmlns:media="http://search.yahoo.com/mrss/">
<title>${esc(channelTitle)}</title>
${entries}
</feed>`;
    }

    async function fetchRss(channelId) {
      try {
        const to = withTimeout(9000);
        const r = await fetch(`https://www.youtube.com/feeds/videos.xml?channel_id=${channelId}`, { signal: to.signal, headers: { "User-Agent": UA, "Accept": "application/xml,text/xml,*/*" } });
        to.done();
        if (r.ok) { const t = await r.text(); if (t.includes("<entry")) return t; }
      } catch (e) { }
      return null;
    }

    // ✅ Handle → UC ID (known map पहले, फिर canonical/externalId — सबसे reliable patterns)
    async function resolveHandle(handle) {
      const key = handle.toLowerCase();
      if (KNOWN_CHANNELS[key]) return [KNOWN_CHANNELS[key]];
      const candidates = [];
      const push = (id) => { if (id && id.startsWith("UC") && !candidates.includes(id)) candidates.push(id); };
      try {
        const to = withTimeout(9000);
        const r = await fetch(`https://www.youtube.com/${handle}`, { signal: to.signal, headers: { "User-Agent": UA, "Accept-Language": "en-US,en;q=0.9" } });
        to.done();
        if (r.ok) {
          const html = await r.text();
          const canon = html.match(/rel="canonical"[^>]*href="https:\/\/www\.youtube\.com\/channel\/(UC[\w-]+)"/);
          if (canon) push(canon[1]);
          const ext = html.match(/"externalId":"(UC[\w-]+)"/); if (ext) push(ext[1]);
          let m; const re1 = /"channelId":"(UC[\w-]+)"/g;
          while ((m = re1.exec(html)) && candidates.length < 6) push(m[1]);
        }
      } catch (e) { }
      if (!candidates.length && KNOWN_CHANNELS[key]) push(KNOWN_CHANNELS[key]);
      return candidates;
    }

    // ✅ Frontend fallback: Invidious → Piped
    async function frontendChannelVideos(q) {
      for (const base of INVIDIOUS) {
        let authorId = q.startsWith("UC") ? q : null;
        if (!authorId) {
          const s = await getJSON(`${base}/api/v1/search?q=${encodeURIComponent(q)}&type=channel`, 6000);
          if (Array.isArray(s) && s.length) authorId = s[0].authorId || s[0].channelId;
        }
        if (!authorId) continue;
        let data = await getJSON(`${base}/api/v1/channels/${authorId}/videos`, 7000);
        let videos = data && (data.videos || data.latestVideos || (Array.isArray(data) ? data : null));
        if (!videos) { data = await getJSON(`${base}/api/v1/channels/${authorId}`, 7000); videos = data && (data.latestVideos || data.videos); }
        if (videos && videos.length) {
          return videos.slice(0, 15).map(v => ({
            id: v.videoId, title: v.title,
            published: v.published ? new Date(v.published * 1000).toISOString() : new Date().toISOString(),
            thumbnail: (v.videoThumbnails && (v.videoThumbnails[0] || {}).url) || `https://i.ytimg.com/vi/${v.videoId}/hqdefault.jpg`,
            channelTitle: v.author || q
          })).filter(v => v.id && v.title);
        }
      }
      for (const base of PIPED) {
        let chUrl = q.startsWith("UC") ? `/channel/${q}` : null;
        if (!chUrl) {
          const s = await getJSON(`${base}/search?q=${encodeURIComponent(q)}&filter=channels`, 6000);
          if (s && Array.isArray(s.items) && s.items.length) chUrl = s.items[0].url;
        }
        if (!chUrl) continue;
        let data = await getJSON(`${base}${chUrl}`, 7000);
        let streams = data && data.relatedStreams;
        if (!streams) { data = await getJSON(`${base}${chUrl}/videos`, 7000); streams = data && data.relatedStreams; }
        if (streams && streams.length) {
          return streams.slice(0, 15).map(v => ({
            id: (v.url || "").replace("/watch?v=", ""), title: v.title,
            published: v.uploaded ? new Date(v.uploaded).toISOString() : new Date().toISOString(),
            thumbnail: v.thumbnail || `https://i.ytimg.com/vi/${(v.url || "").replace("/watch?v=", "")}/hqdefault.jpg`,
            channelTitle: v.uploaderName || (data && data.name) || q
          })).filter(v => v.id && v.title);
        }
      }
      return [];
    }

    try {
      // ✅ Health check
      if (url.searchParams.get("ping")) return json({ ok: true, time: new Date().toISOString(), version: "v4" });

      /* ============ TRENDING MODE ============ */
      const trendingRegion = url.searchParams.get("trending");
      if (trendingRegion) {
        const cache = await caches.open("v4-tr");
        const cacheKey = new Request(`https://cache.local/trending-${trendingRegion}`);
        const cached = await cache.match(cacheKey);
        if (cached) {
          const t = await cached.text();
          try { const d = JSON.parse(t); if (Array.isArray(d) && d.length) return new Response(t, { headers: { ...cors, "Content-Type": "application/json", "X-Cache": "HIT" } }); } catch (e) { }
        }
        const insts = [
          ...INVIDIOUS.map(b => `${b}/api/v1/trending?region=${trendingRegion}`),
          ...PIPED.map(b => `${b}/trending?region=${trendingRegion}`),
        ];
        for (const inst of insts) {
          const data = await getJSON(inst, 7000);
          if (Array.isArray(data) && data.length) {
            const out = data.slice(0, 15).map(v => ({
              videoId: v.videoId || (v.url || "").replace("/watch?v=", ""),
              title: v.title,
              author: v.author || v.uploaderName || v.uploader || "",
              thumb: (v.videoThumbnails && ((v.videoThumbnails.find(t => t.quality === "high") || v.videoThumbnails[0]) || {}).url) || v.thumbnail || `https://i.ytimg.com/vi/${v.videoId || ""}/hqdefault.jpg`
            })).filter(v => v.videoId && v.title);
            if (out.length) {
              const body = JSON.stringify(out);
              await cache.put(cacheKey, new Response(body, { headers: { "Cache-Control": "max-age=600" } }));
              return new Response(body, { headers: { ...cors, "Content-Type": "application/json", "X-Source": inst } });
            }
          }
        }
        return json({ error: "All trending instances failed", region: trendingRegion }, 503);
      }

      /* ============ CHANNEL MODE ============ */
      let query = (url.searchParams.get("channel_id") || url.searchParams.get("handle") || "").trim();
      if (!query) return json({ error: "channel_id / handle भेजें, या ?trending=IN use करें", usage: "?channel_id=@aajtak या ?channel_id=UCxxxxx या ?trending=IN" }, 400);

      const handle = query.startsWith("UC") ? null : (query.startsWith("@") ? query : "@" + query);

      // ✅ Cache (sirf successful XML)
      const cache = await caches.open("v4-rss");
      const cacheKey = new Request(`https://cache.local/ch-${query.toLowerCase()}`);
      const cached = await cache.match(cacheKey);
      if (cached) {
        const t = await cached.text();
        if (t.includes("<entry")) return xml(t, { "X-Cache": "HIT" });
      }

      const errors = [];

      // 1) RSS try karo (verified/candidate IDs ke saath)
      const candidates = query.startsWith("UC") ? [query] : await resolveHandle(handle);
      if (!candidates.length) errors.push(`Handle ${handle} resolve नहीं हो पाया`);
      for (const cid of candidates) {
        const x = await fetchRss(cid);
        if (x) {
          await cache.put(cacheKey, new Response(x, { headers: { "Cache-Control": "max-age=900" } }));
          return xml(x, { "X-Source": "youtube-rss", "X-Channel-ID": cid });
        }
        errors.push(`RSS 404 for ${cid}`);
      }

      // 2) ✅ FRONTEND FALLBACK → Synthetic Atom XML (yahi headlines लाएगा)
      const items = await frontendChannelVideos(query.startsWith("UC") ? query : handle);
      if (items.length) {
        const atom = buildAtomXml(items, items[0].channelTitle);
        await cache.put(cacheKey, new Response(atom, { headers: { "Cache-Control": "max-age=600" } }));
        return xml(atom, { "X-Source": "frontend-fallback" });
      }
      errors.push("Invidious/Piped fallback भी fail हुआ");

      return json({ error: "Channel videos नहीं मिले", query, errors, hint: "सभी instances down हैं — कुछ मिनट बाद दोबारा try करें" }, 502);
    } catch (e) {
      return json({ error: "Worker internal error", message: e.message }, 500);
    }
  }
};
