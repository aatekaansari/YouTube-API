// index.js — Ultimate YouTube RSS + Handle Resolver + Trending (v2)
// ✅ Timeout + Retry | ✅ 15-min RSS cache | ✅ @handle fallbacks | ✅ ?trending=IN endpoint | ✅ CORS

export default {
  async fetch(request) {
    const url = new URL(request.url);
    const cors = {
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Methods": "GET, OPTIONS",
      "Access-Control-Allow-Headers": "Content-Type",
    };
    if (request.method === "OPTIONS") return new Response(null, { headers: cors });

    const UA = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36";

    const withTimeout = (ms) => {
      const c = new AbortController();
      const t = setTimeout(() => c.abort(), ms);
      return { signal: c.signal, done: () => clearTimeout(t) };
    };

    try {
      /* ================= TRENDING MODE: ?trending=IN ================= */
      const trendingRegion = url.searchParams.get("trending");
      if (trendingRegion) {
        const cache = await caches.open("v1");
        const cacheKey = new Request(`https://cache.local/trending-${trendingRegion}`);
        const cached = await cache.match(cacheKey);
        if (cached) {
          return new Response(await cached.text(), {
            headers: { ...cors, "Content-Type": "application/json", "Cache-Control": "public, max-age=600", "X-Cache": "HIT" }
          });
        }

        const instances = [
          `https://inv.tux.pizza/api/v1/trending?region=${trendingRegion}`,
          `https://invidious.jing.rocks/api/v1/trending?region=${trendingRegion}`,
          `https://invidious.nerdvpn.de/api/v1/trending?region=${trendingRegion}`,
          `https://pipedapi.kavin.rocks/trending?region=${trendingRegion}`,
        ];
        for (const inst of instances) {
          try {
            const to = withTimeout(6000);
            const r = await fetch(inst, { signal: to.signal, headers: { "User-Agent": UA } });
            to.done();
            if (r.ok) {
              const data = await r.json();
              if (Array.isArray(data) && data.length) {
                const out = data.slice(0, 15).map(v => ({
                  videoId: v.videoId || (v.url || "").replace("/watch?v=", ""),
                  title: v.title,
                  author: v.author || v.uploader || "",
                  thumb: (v.videoThumbnails && ((v.videoThumbnails.find(t => t.quality === "high") || v.videoThumbnails[0]) || {}).url) || v.thumbnail || `https://i.ytimg.com/vi/${v.videoId || ""}/hqdefault.jpg`
                })).filter(v => v.videoId && v.title);
                if (out.length) {
                  const body = JSON.stringify(out);
                  await cache.put(cacheKey, new Response(body, { headers: { "Cache-Control": "max-age=600" } }));
                  return new Response(body, { headers: { ...cors, "Content-Type": "application/json" } });
                }
              }
            }
          } catch (e) { }
        }
        return new Response(JSON.stringify([]), { headers: { ...cors, "Content-Type": "application/json" } });
      }

      /* ================= RSS MODE: ?channel_id=UC... या @handle ================= */
      let query = (url.searchParams.get("channel_id") || url.searchParams.get("handle") || "").trim();
      if (!query) {
        return new Response(JSON.stringify({ error: "channel_id / handle भेजें, या ?trending=IN use करें" }), {
          status: 400, headers: { ...cors, "Content-Type": "application/json" }
        });
      }

      let channelId = query;

      // @handle → UC ID (fallbacks के साथ)
      if (!channelId.startsWith("UC")) {
        const handle = channelId.startsWith("@") ? channelId : "@" + channelId;
        const targets = [`https://www.youtube.com/${handle}`, `https://www.youtube.com/${handle}/videos`];
        for (const t of targets) {
          try {
            const to = withTimeout(7000);
            const r = await fetch(t, { signal: to.signal, headers: { "User-Agent": UA, "Accept-Language": "en-US,en;q=0.9" } });
            to.done();
            if (r.ok) {
              const html = await r.text();
              const m = html.match(/"channelId":"(UC[\w-]+)"/) || html.match(/"browseId":"(UC[\w-]+)"/) || html.match(/channel\/(UC[\w-]+)/);
              if (m && m[1]) { channelId = m[1]; break; }
            }
          } catch (e) { }
        }
      }

      const rssUrl = `https://www.youtube.com/feeds/videos.xml?channel_id=${channelId}`;

      // ✅ 15 मिनट की RSS cache — बार-बार स्कैन पर भी YouTube कॉल नहीं बढ़ेगी
      const cache = await caches.open("v1");
      const cacheKey = new Request(`https://cache.local/rss-${channelId}`);
      const cached = await cache.match(cacheKey);
      if (cached) {
        return new Response(await cached.text(), {
          headers: { ...cors, "Content-Type": "application/xml; charset=utf-8", "Cache-Control": "public, max-age=900", "X-Cache": "HIT" }
        });
      }

      let lastErr = "";
      for (let attempt = 0; attempt < 2; attempt++) {   // ✅ 1 retry
        try {
          const to = withTimeout(8000);
          const r = await fetch(rssUrl, { signal: to.signal, headers: { "User-Agent": UA, "Accept": "application/xml;q=0.9,*/*;q=0.8" } });
          to.done();
          if (r.ok) {
            const xml = await r.text();
            if (xml.includes("<entry")) {
              await cache.put(cacheKey, new Response(xml, { headers: { "Cache-Control": "max-age=900" } }));
              return new Response(xml, {
                headers: { ...cors, "Content-Type": "application/xml; charset=utf-8", "Cache-Control": "public, max-age=900" }
              });
            }
            lastErr = "RSS में entry नहीं मिली";
          } else lastErr = "YouTube RSS status " + r.status;
        } catch (e) { lastErr = e.message; }
      }
      return new Response(JSON.stringify({ error: lastErr || "RSS fail", id: query }), {
        status: 502, headers: { ...cors, "Content-Type": "application/json" }
      });
    } catch (e) {
      return new Response(JSON.stringify({ error: e.message }), { status: 500, headers: { ...cors, "Content-Type": "application/json" } });
    }
  }
};
