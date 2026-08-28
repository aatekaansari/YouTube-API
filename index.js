// index.js — Ultimate YouTube RSS + Handle Resolver + Trending (v3 FIXED)
// ✅ Better handle resolution | ✅ No error caching | ✅ Multiple fallbacks | ✅ Detailed errors

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

    const withTimeout = (ms) => {
      const c = new AbortController();
      const t = setTimeout(() => c.abort(), ms);
      return { signal: c.signal, done: () => clearTimeout(t) };
    };

    try {
      /* ================= TRENDING MODE: ?trending=IN ================= */
      const trendingRegion = url.searchParams.get("trending");
      if (trendingRegion) {
        const cache = await caches.open("v3-trending");
        const cacheKey = new Request(`https://cache.local/trending-${trendingRegion}`);
        
        // ✅ Check cache - लेकिन sirf successful responses
        const cached = await cache.match(cacheKey);
        if (cached) {
          const cachedText = await cached.text();
          try {
            const data = JSON.parse(cachedText);
            if (Array.isArray(data) && data.length > 0) {
              return new Response(cachedText, {
                headers: { ...cors, "Content-Type": "application/json", "Cache-Control": "public, max-age=600", "X-Cache": "HIT" }
              });
            }
          } catch (e) { }
        }

        // ✅ Multiple Invidious/Piped instances
        const instances = [
          `https://inv.tux.pizza/api/v1/trending?region=${trendingRegion}`,
          `https://invidious.nerdvpn.de/api/v1/trending?region=${trendingRegion}`,
          `https://invidious.protokolla.fi/api/v1/trending?region=${trendingRegion}`,
          `https://yt.artemislena.eu/api/v1/trending?region=${trendingRegion}`,
          `https://pipedapi.kavin.rocks/trending?region=${trendingRegion}`,
          `https://pipedapi.12a.app/trending?region=${trendingRegion}`,
          `https://api.piped.minionflo.net/trending?region=${trendingRegion}`,
        ];
        
        for (const inst of instances) {
          try {
            const to = withTimeout(8000);
            const r = await fetch(inst, { 
              signal: to.signal, 
              headers: { "User-Agent": UA, "Accept": "application/json" } 
            });
            to.done();
            
            if (r.ok) {
              const data = await r.json();
              if (Array.isArray(data) && data.length) {
                const out = data.slice(0, 15).map(v => ({
                  videoId: v.videoId || (v.url || "").replace("/watch?v=", ""),
                  title: v.title,
                  author: v.author || v.uploader || v.uploaderName || "",
                  thumb: (v.videoThumbnails && ((v.videoThumbnails.find(t => t.quality === "high") || v.videoThumbnails[0]) || {}).url) || 
                         v.thumbnail || 
                         `https://i.ytimg.com/vi/${v.videoId || ""}/hqdefault.jpg`
                })).filter(v => v.videoId && v.title);
                
                if (out.length) {
                  const body = JSON.stringify(out);
                  // ✅ Sirf successful response cache karo
                  await cache.put(cacheKey, new Response(body, { headers: { "Cache-Control": "max-age=600" } }));
                  return new Response(body, { 
                    headers: { ...cors, "Content-Type": "application/json", "X-Source": inst } 
                  });
                }
              }
            }
          } catch (e) { 
            console.error(`Trending ${inst} failed:`, e.message);
          }
        }
        
        return new Response(JSON.stringify({ 
          error: "All trending instances failed", 
          region: trendingRegion 
        }), { 
          status: 503, 
          headers: { ...cors, "Content-Type": "application/json" } 
        });
      }

      /* ================= RSS MODE: ?channel_id=UC... या @handle ================= */
      let query = (url.searchParams.get("channel_id") || url.searchParams.get("handle") || "").trim();
      if (!query) {
        return new Response(JSON.stringify({ 
          error: "channel_id / handle भेजें, या ?trending=IN use करें",
          usage: "?channel_id=UCxxxxx या ?channel_id=@handle या ?trending=IN"
        }), {
          status: 400, headers: { ...cors, "Content-Type": "application/json" }
        });
      }

      let channelId = query;
      const errors = [];

      // ✅ @handle → UC ID (multiple methods)
      if (!channelId.startsWith("UC")) {
        const handle = channelId.startsWith("@") ? channelId : "@" + channelId;
        
        // Method 1: YouTube page scraping (updated regex patterns)
        const targets = [
          `https://www.youtube.com/${handle}`,
          `https://www.youtube.com/${handle}/about`,
          `https://www.youtube.com/${handle}/videos`
        ];
        
        let resolved = false;
        for (const t of targets) {
          try {
            const to = withTimeout(10000);
            const r = await fetch(t, { 
              signal: to.signal, 
              headers: { 
                "User-Agent": UA, 
                "Accept-Language": "en-US,en;q=0.9",
                "Accept": "text/html,application/xhtml+xml"
              } 
            });
            to.done();
            
            if (r.ok) {
              const html = await r.text();
              
              // ✅ Multiple regex patterns for different YouTube layouts
              const patterns = [
                /"channelId":"(UC[\w-]+)"/,
                /"browseId":"(UC[\w-]+)"/,
                /channel\/(UC[\w-]+)/,
                /\/channel\/(UC[\w-]+)\//,
                /data-channel-id="(UC[\w-]+)"/,
                /"externalChannelId":"(UC[\w-]+)"/,
                /"subscriberCountText".*?"channelId":"(UC[\w-]+)"/,
              ];
              
              for (const pattern of patterns) {
                const m = html.match(pattern);
                if (m && m[1] && m[1].startsWith("UC")) {
                  channelId = m[1];
                  resolved = true;
                  break;
                }
              }
              if (resolved) break;
            }
          } catch (e) { 
            errors.push(`YouTube scrape ${t}: ${e.message}`);
          }
        }
        
        // ✅ Method 2: Try direct RSS with @handle (sometimes works)
        if (!resolved) {
          // Try both with and without @
          const directFeeds = [
            `https://www.youtube.com/feeds/videos.xml?user=${handle.replace('@', '')}`,
            `https://www.youtube.com/feeds/videos.xml?user=${handle}`
          ];
          
          for (const feedUrl of directFeeds) {
            try {
              const to = withTimeout(8000);
              const r = await fetch(feedUrl, { 
                signal: to.signal, 
                headers: { "User-Agent": UA, "Accept": "application/xml" } 
              });
              to.done();
              
              if (r.ok) {
                const xml = await r.text();
                if (xml.includes("<entry")) {
                  return new Response(xml, {
                    headers: { ...cors, "Content-Type": "application/xml; charset=utf-8", "X-Method": "direct-user" }
                  });
                }
              }
            } catch (e) { 
              errors.push(`Direct feed ${feedUrl}: ${e.message}`);
            }
          }
        }
        
        if (!resolved && !channelId.startsWith("UC")) {
          return new Response(JSON.stringify({ 
            error: "Could not resolve @handle to channel ID",
            handle: handle,
            errors: errors.slice(0, 5),
            suggestion: "Try providing UC... channel ID directly"
          }), {
            status: 404, headers: { ...cors, "Content-Type": "application/json" }
          });
        }
      }

      // ✅ RSS fetch with cache
      const rssUrl = `https://www.youtube.com/feeds/videos.xml?channel_id=${channelId}`;
      const cache = await caches.open("v3-rss");
      const cacheKey = new Request(`https://cache.local/rss-${channelId}`);
      
      // ✅ Check cache - only successful XML responses
      const cached = await cache.match(cacheKey);
      if (cached) {
        const cachedText = await cached.text();
        if (cachedText.includes("<entry")) {
          return new Response(cachedText, {
            headers: { 
              ...cors, 
              "Content-Type": "application/xml; charset=utf-8", 
              "Cache-Control": "public, max-age=900", 
              "X-Cache": "HIT",
              "X-Channel-ID": channelId
            }
          });
        }
      }

      // ✅ Fresh fetch with retry
      let lastErr = "";
      for (let attempt = 0; attempt < 3; attempt++) {
        try {
          const to = withTimeout(10000);
          const r = await fetch(rssUrl, { 
            signal: to.signal, 
            headers: { 
              "User-Agent": UA, 
              "Accept": "application/xml;q=0.9,text/xml,*/*;q=0.8",
              "Accept-Language": "en-US,en;q=0.9"
            } 
          });
          to.done();
          
          if (r.ok) {
            const xml = await r.text();
            if (xml.includes("<entry") || xml.includes("<item")) {
              // ✅ Cache only successful responses
              await cache.put(cacheKey, new Response(xml, { headers: { "Cache-Control": "max-age=900" } }));
              return new Response(xml, {
                headers: { 
                  ...cors, 
                  "Content-Type": "application/xml; charset=utf-8", 
                  "Cache-Control": "public, max-age=900",
                  "X-Channel-ID": channelId,
                  "X-Attempt": String(attempt + 1)
                }
              });
            }
            lastErr = "RSS में <entry> tags नहीं मिले";
          } else {
            lastErr = `YouTube RSS returned status ${r.status}`;
          }
        } catch (e) { 
          lastErr = `Fetch error: ${e.message}`;
          if (e.name === 'AbortError') lastErr = "Timeout: YouTube RSS ने 10 seconds में जवाब नहीं दिया";
        }
        
        // Wait before retry
        if (attempt < 2) {
          await new Promise(resolve => setTimeout(resolve, 1000 * (attempt + 1)));
        }
      }
      
      // ✅ Detailed error response
      return new Response(JSON.stringify({ 
        error: "RSS fetch failed after 3 attempts",
        channel_id: channelId,
        original_query: query,
        last_error: lastErr,
        all_errors: errors,
        rss_url: rssUrl,
        suggestions: [
          "Check if channel ID is correct (should start with UC...)",
          "YouTube might be rate limiting",
          "Try again after a few minutes"
        ]
      }), {
        status: 502, headers: { ...cors, "Content-Type": "application/json" }
      });
      
    } catch (e) {
      return new Response(JSON.stringify({ 
        error: "Worker internal error",
        message: e.message,
        stack: e.stack 
      }), { 
        status: 500, 
        headers: { ...cors, "Content-Type": "application/json" } 
      });
    }
  }
};
