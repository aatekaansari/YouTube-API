// index.js — Ultimate YouTube RSS + Handle Resolver + Trending (v4 FINAL)
// ✅ सही handle resolution (canonical/og:url/externalId) | ✅ Known-ID safety map
// ✅ Piped/Invidious fallback → Atom XML | ✅ सिर्फ successful cache | ✅ Detailed errors

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
    const esc = (s) => String(s ?? "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

    // ✅ Verified channel IDs (safety net)
    const KNOWN_IDS = {
      "@aajtak": "UCt4t-jeY85JegMlZ-E5UWtA",
      "@abpnews": "UCRWFSbif-RFENbBrSiez1DA",
      "@news18india": "UCPP3etACgdUWvizcES1dJ8Q",
    };

    const PIPED = ["https://pipedapi.kavin.rocks", "https://pipedapi.12a.app", "https://api.piped.minionflo.net", "https://pipedapi.nezumi.party", "https://pipedapi.leptons.xyz"];
    const INVIDIOUS = ["https://inv.tux.pizza", "https://invidious.nerdvpn.de", "https://invidious.protokolla.fi", "https://yt.artemislena.eu"];

    // ✅ JSON videos → Atom XML (ताकि client का parseFeedEntries बिना बदले चले)
    const jsonToAtomXml = (items, channelTitle) => {
      const entries = items.map(v => `  <entry>
    <id>yt:video:${esc(v.id)}</id>
    <yt:videoId>${esc(v.id)}</yt:videoId>
    <title>${esc(v.title)}</title>
    <published>${esc(v.published || new Date().toISOString())}</published>
    <author><name>${esc(v.author || channelTitle)}</name></author>
    <media:thumbnail url="${esc(v.thumbnail)}"/>
  </entry>`).join("\n");
      return `<?xml version="1.0" encoding="UTF-8"?>
<feed xmlns="http://www.w3.org/2005/Atom" xmlns:yt="http://www.youtube.com/xml/schemas/2015" xmlns:media="http://search.yahoo.com/mrss/">
<title>${esc(channelTitle)}</title>
<author><name>${esc(channelTitle)}</name></author>
${entries}
</feed>`;
    };

    try {
      /* ================= TRENDING MODE ================= */
      const trendingRegion = url.searchParams.get("trending");
      if (trendingRegion) {
        const cache = await caches.open("v4-tr");
        const cacheKey = new Request(`https://cache.local/trending-${trendingRegion}`);
        const cached = await cache.match(cacheKey);
        if (cached) {
          const txt = await cached.text();
          try { const d = JSON.parse(txt); if (Array.isArray(d) && d.length) return new Response(txt, { headers: { ...cors, "Content-Type": "application/json", "X-Cache": "HIT" } }); } catch (e) { }
        }
        const insts = [
          ...INVIDIOUS.map(b => `${b}/api/v1/trending?region=${trendingRegion}`),
          ...PIPED.map(b => `${b}/trending?region=${trendingRegion}`),
        ];
        for (const u of insts) {
          try {
            const to = withTimeout(7000);
            const r = await fetch(u, { signal: to.signal, headers: { "User-Agent": UA } });
            to.done();
            if (!r.ok) continue;
            const data = await r.json();
            if (!Array.isArray(data) || !data.length) continue;
            const out = data.slice(0, 15).map(v => ({
              videoId: v.videoId || (v.url || "").replace("/watch?v=", ""),
              title: v.title,
              author: v.author || v.uploaderName || v.uploader || "",
              thumb: (v.videoThumbnails && ((v.videoThumbnails.find(t => t.quality === "high") || v.videoThumbnails[0]) || {}).url) || v.thumbnail || `https://i.ytimg.com/vi/${v.videoId || ""}/hqdefault.jpg`
            })).filter(v => v.videoId && v.title);
            if (out.length) {
              const body = JSON.stringify(out);
              await cache.put(cacheKey, new Response(body, { headers: { "Cache-Control": "max-age=600" } }));
              return new Response(body, { headers: { ...cors, "Content-Type": "application/json", "X-Source": u } });
            }
          } catch (e) { }
        }
        return new Response(JSON.stringify({ error: "All trending instances failed", region: trendingRegion }), { status: 503, headers: { ...cors, "Content-Type": "application/json" } });
      }

      /* ================= CHANNEL MODE ================= */
      const query = (url.searchParams.get("channel_id") || url.searchParams.get("handle") || "").trim();
      if (!query) {
        return new Response(JSON.stringify({ error: "channel_id / handle भेजें, या ?trending=IN use करें", usage: "?channel_id=UCxxxxx या ?channel_id=@handle या ?trending=IN" }), { status: 400, headers: { ...cors, "Content-Type": "application/json" } });
      }

      const handle = query.startsWith("UC") ? null : (query.startsWith("@") ? query.toLowerCase() : "@" + query.toLowerCase());
      const errors = [];
      const cache = await caches.open("v4-rss");
      const resKey = handle ? new Request(`https://cache.local/resolve-${handle}`) : null;

      // Step 0: Known-ID map → cached resolution
      let channelId = query.startsWith("UC") ? query : (KNOWN_IDS[handle] || "");
      if (handle && !channelId && resKey) {
        const rc = await cache.match(resKey);
        if (rc) channelId = (await rc.text()).trim();
      }

      // Step 1: YouTube HTML से सही resolution (canonical सबसे पहले!)
      if (handle && !channelId) {
        try {
          const to = withTimeout(8000);
          const r = await fetch(`https://www.youtube.com/${handle}`, { signal: to.signal, headers: { "User-Agent": UA, "Accept-Language": "en-US,en;q=0.9" } });
          to.done();
          if (r.ok) {
            const html = await r.text();
            const m =
              html.match(/rel="canonical"[^>]*href="https:\/\/www\.youtube\.com\/channel\/(UC[\w-]+)/) ||
              html.match(/property="og:url"[^>]*content="https:\/\/www\.youtube\.com\/channel\/(UC[\w-]+)/) ||
              html.match(/"externalId":"(UC[\w-]+)"/) ||
              html.match(/"channelId":"(UC[\w-]+)"/);
            if (m && m[1]) {
              channelId = m[1];
              await cache.put(resKey, new Response(channelId, { headers: { "Cache-Control": "max-age=86400" } }));
            } else errors.push("YouTube HTML में channel ID नहीं मिली");
          } else errors.push(`YouTube page status ${r.status}`);
        } catch (e) { errors.push(`YouTube page: ${e.message}`); }
      }

      // Step 2: Piped search से resolution
      if (handle && !channelId) {
        for (const base of PIPED) {
          try {
            const to = withTimeout(5000);
            const r = await fetch(`${base}/search?q=${encodeURIComponent(handle)}&filter=channels`, { signal: to.signal });
            to.done();
            if (!r.ok) continue;
            const data = await r.json();
            const hit = (data.items || []).find(i => (i.uploaderUrl || "").includes("/channel/UC"));
            if (hit) {
              channelId = hit.uploaderUrl.split("/channel/")[1];
              await cache.put(resKey, new Response(channelId, { headers: { "Cache-Control": "max-age=86400" } }));
              break;
            }
          } catch (e) { }
        }
      }

      if (!channelId) {
        return new Response(JSON.stringify({ error: "Handle resolve नहीं हो सका", handle, errors }), { status: 404, headers: { ...cors, "Content-Type": "application/json" } });
      }

      // Step 3: RSS cache (सिर्फ successful XML)
      const cacheKey = new Request(`https://cache.local/rss-${channelId}`);
      const cached = await cache.match(cacheKey);
      if (cached) {
        const txt = await cached.text();
        if (txt.includes("<entry")) return new Response(txt, { headers: { ...cors, "Content-Type": "application/xml; charset=utf-8", "X-Cache": "HIT", "X-Channel-ID": channelId } });
      }

      // Step 4: YouTube RSS (404 = गलत ID → retry बेकार, fallback पर जाओ)
      let lastErr = "";
      for (let attempt = 0; attempt < 2; attempt++) {
        try {
          const to = withTimeout(8000);
          const r = await fetch(`https://www.youtube.com/feeds/videos.xml?channel_id=${channelId}`, { signal: to.signal, headers: { "User-Agent": UA } });
          to.done();
          if (r.ok) {
            const xml = await r.text();
            if (xml.includes("<entry")) {
              await cache.put(cacheKey, new Response(xml, { headers: { "Cache-Control": "max-age=900" } }));
              return new Response(xml, { headers: { ...cors, "Content-Type": "application/xml; charset=utf-8", "X-Channel-ID": channelId } });
            }
            lastErr = "RSS में <entry> नहीं";
          } else {
            lastErr = `RSS status ${r.status}`;
            if (r.status === 404) { if (resKey) await cache.delete(resKey).catch(() => { }); break; }
          }
        } catch (e) { lastErr = e.message; }
      }
      errors.push(`YouTube RSS (${channelId}): ${lastErr}`);

      // Step 5: ✅ PARALLEL fallback — Piped + Invidious → Atom XML
      const [pipedRes, invRes] = await Promise.all([
        (async () => {
          for (const base of PIPED) {
            try {
              const to = withTimeout(6000);
              const r = await fetch(`${base}/channel/${channelId}/videos`, { signal: to.signal });
              to.done();
              if (!r.ok) continue;
              const d = await r.json();
              if (d && Array.isArray(d.relatedStreams) && d.relatedStreams.length) {
                const items = d.relatedStreams.slice(0, 15).map(v => ({
                  id: (v.url || "").replace("/watch?v=", ""), title: v.title,
                  published: v.uploaded ? new Date(v.uploaded).toISOString() : null,
                  author: d.name || handle, thumbnail: v.thumbnail
                })).filter(v => v.id && v.title);
                if (items.length) return { items, name: d.name || handle, src: `piped:${base}` };
              }
            } catch (e) { }
          }
          return null;
        })(),
        (async () => {
          for (const base of INVIDIOUS) {
            try {
              const to = withTimeout(6000);
              const r = await fetch(`${base}/api/v1/channels/${channelId}/videos`, { signal: to.signal });
              to.done();
              if (!r.ok) continue;
              const d = await r.json();
              if (d && Array.isArray(d.videos) && d.videos.length) {
                const items = d.videos.slice(0, 15).map(v => ({
                  id: v.videoId, title: v.title,
                  published: v.published ? new Date(v.published * 1000).toISOString() : null,
                  author: d.author || handle,
                  thumbnail: (v.videoThumbnails && (v.videoThumbnails.find(t => t.quality === "medium") || v.videoThumbnails[0]) || {}).url
                })).filter(v => v.id && v.title);
                if (items.length) return { items, name: d.author || handle, src: `invidious:${base}` };
              }
            } catch (e) { }
          }
          return null;
        })(),
      ]);

      const fb = pipedRes || invRes;
      if (fb) {
        const xml = jsonToAtomXml(fb.items, fb.name);
        await cache.put(cacheKey, new Response(xml, { headers: { "Cache-Control": "max-age=300" } }));
        return new Response(xml, { headers: { ...cors, "Content-Type": "application/xml; charset=utf-8", "X-Source": fb.src, "X-Channel-ID": channelId } });
      }

      return new Response(JSON.stringify({ error: "सभी sources fail हो गए", channel_id: channelId, original_query: query, errors }), { status: 502, headers: { ...cors, "Content-Type": "application/json" } });
    } catch (e) {
      return new Response(JSON.stringify({ error: "Worker internal error", message: e.message }), { status: 500, headers: { ...cors, "Content-Type": "application/json" } });
    }
  }
};
