// Advanced YouTube RSS to JSON & XML Cloudflare Worker
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

    let channelId = url.searchParams.get("channel_id");
    if (!channelId) {
      return new Response(JSON.stringify({ error: "Please provide channel_id" }), { 
        status: 400, 
        headers: { ...corsHeaders, "Content-Type": "application/json" } 
      });
    }

    const ytRssUrl = `https://www.youtube.com/feeds/videos.xml?channel_id=${channelId}`;

    try {
      const response = await fetch(ytRssUrl, {
        headers: {
          "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/123.0.0.0 Safari/537.36",
          "Accept-Language": "hi-IN,hi;q=0.9,en-US;q=0.8,en;q=0.7",
          "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
          "Cache-Control": "no-cache"
        }
      });
      
      if (!response.ok) {
        return new Response(JSON.stringify({ error: `YouTube Blocked: ${response.status}` }), { 
          status: 500, 
          headers: { ...corsHeaders, "Content-Type": "application/json" } 
        });
      }

      const xmlText = await response.text();

      // सीधा XML पास करके क्लाइंट को सुरक्षित रूप से भेजना
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
