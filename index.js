// YouTube Official RSS Fetcher (Cloudflare Worker)
// यह वर्कर 100% ओरिजिनल यूट्यूब सर्वर से डेटा लाता है और CORS एरर को बाईपास करता है।

export default {
  async fetch(request) {
    const url = new URL(request.url);
    
    // CORS Headers: ताकि आपकी न्यूज़ स्टूडियो वेबसाइट इस API को आसानी से कॉल कर सके
    const corsHeaders = {
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Methods": "GET, HEAD, POST, OPTIONS",
      "Access-Control-Allow-Headers": "Content-Type",
    };

    // Preflight (OPTIONS) रिक्वेस्ट को हैंडल करना
    if (request.method === "OPTIONS") {
      return new Response(null, { headers: corsHeaders });
    }

    // URL से YouTube Channel ID निकालना (जैसे: ?channel_id=UCxxxx)
    const channelId = url.searchParams.get("channel_id");
    
    if (!channelId) {
      return new Response("Error: Please provide a channel_id (e.g., ?channel_id=UC...)", { 
        status: 400, 
        headers: corsHeaders 
      });
    }

    // 100% Original YouTube Official RSS URL
    const ytRssUrl = `https://www.youtube.com/feeds/videos.xml?channel_id=${channelId}`;

    try {
      // सीधा YouTube सर्वर से हेडलाइंस और डेटा फेच करना
      const response = await fetch(ytRssUrl, {
        headers: {
          // YouTube को लगेगा कि यह एक नॉर्मल ब्राउज़र है, कोई बॉट नहीं
          "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36"
        }
      });
      
      const xmlData = await response.text();

      // वापस आपकी वेबसाइट को XML डेटा भेजना
      return new Response(xmlData, {
        status: 200,
        headers: {
          ...corsHeaders,
          "Content-Type": "application/xml; charset=utf-8"
        }
      });
    } catch (error) {
      return new Response("YouTube Fetch Error: " + error.message, { 
        status: 500, 
        headers: corsHeaders 
      });
    }
  }
};
