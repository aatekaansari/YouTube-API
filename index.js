// Ultimate Universal YouTube RSS & Handle Resolver Cloudflare Worker
export default {
  async fetch(request) {
    const url = new URL(request.url);
    
    const corsHeaders = {
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Methods": "GET, HEAD, POST, OPTIONS",
      "Access-Control-Allow-Headers": "Content-Type",
    };

    if (request.method === "OPTIONS") {
      return new Response(null, { headers: corsHeaders });
    }

    let query = url.searchParams.get("channel_id") || url.searchParams.get("handle");
    if (!query) {
      return new Response(JSON.stringify({ error: "Please provide channel_id or handle" }), { 
        status: 400, 
        headers: { ...corsHeaders, "Content-Type": "application/json" } 
      });
    }

    let channelId = query.trim();

    try {
      // यदि यूजर ने '@' वाला हैंडल दिया है (जैसे @dlsnews या @abhisar_sharma), तो उसका असली UC... वाला ID ढूंढें
      if (channelId.startsWith('@') || !channelId.startsWith('UC')) {
        let handleClean = channelId.startsWith('@') ? channelId : '@' + channelId;
        const ytPageRes = await fetch(`https://www.youtube.com/${handleClean}`, {
          headers: {
            "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/123.0.0.0 Safari/537.36"
          }
        });
        const htmlText = await ytPageRes.text();
        const match = htmlText.match(/"channelId":"(UC[\w-]+)"/) || htmlText.match(/"browseId":"(UC[\w-]+)"/);
        if (match && match[1]) {
          channelId = match[1];
        }
      }

      // असली YouTube RSS URL
      const ytRssUrl = `https://www.youtube.com/feeds/videos.xml?channel_id=${channelId}`;

      const response = await fetch(ytRssUrl, {
        headers: {
          "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/123.0.0.0 Safari/537.36",
          "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8"
        }
      });
      
      if (!response.ok) {
        return new Response(JSON.stringify({ error: `YouTube RSS Failed: ${response.status} for ID: ${channelId}` }), { 
          status: 500, 
          headers: { ...corsHeaders, "Content-Type": "application/json" } 
        });
      }

      const xmlText = await response.text();

      return new Response(xmlText, {
        status: 200,
        headers: {
          ...corsHeaders,
          "Content-Type": "application/xml; charset=utf-8"
        }
      });
    } catch (error) {
      return new Response(JSON.stringify({ error: error.message }), { 
        status: 500, 
        headers: { ...corsHeaders, "Content-Type": "application/json" } 
      });
    }
  }
};
