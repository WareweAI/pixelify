// Debug endpoint to check cache state
import type { LoaderFunctionArgs } from "react-router";
import { getShopifyInstance } from "../shopify.server";
import { cache } from "~/lib/cache.server";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type",
  "X-Content-Type-Options": "nosniff",
};

export async function loader({ request }: LoaderFunctionArgs) {
  try {
    const shopify = getShopifyInstance();
    const { session } = await shopify.authenticate.admin(request);
    const shop = session.shop;

    // Get cache stats
    const stats = cache.getStats();
    
    // Get all cache keys for this shop
    const shopCacheKeys = stats.keys.filter(key => key.includes(shop));
    
    // Get cache keys by category
    const dashboardKeys = shopCacheKeys.filter(key => key.startsWith('dashboard:'));
    const appSettingsKeys = shopCacheKeys.filter(key => key.startsWith('app-settings:'));
    const facebookKeys = shopCacheKeys.filter(key => key.includes('facebook'));
    const otherKeys = shopCacheKeys.filter(key => 
      !key.startsWith('dashboard:') && 
      !key.startsWith('app-settings:') && 
      !key.includes('facebook')
    );

    return Response.json({
      shop,
      totalCacheEntries: stats.size,
      shopCacheEntries: shopCacheKeys.length,
      breakdown: {
        dashboard: dashboardKeys.length,
        appSettings: appSettingsKeys.length,
        facebook: facebookKeys.length,
        other: otherKeys.length,
      },
      keys: {
        dashboard: dashboardKeys,
        appSettings: appSettingsKeys,
        facebook: facebookKeys,
        other: otherKeys,
      },
      allKeys: stats.keys,
      timestamp: new Date().toISOString(),
    }, { 
      headers: {
        ...corsHeaders,
        "Cache-Control": "no-cache, no-store, must-revalidate",
        "Pragma": "no-cache", 
        "Expires": "0",
      }
    });

  } catch (error) {
    console.error("[Debug Cache] Error:", error);
    return Response.json({
      error: "Failed to get cache debug info",
      details: String(error),
    }, { 
      status: 500, 
      headers: corsHeaders 
    });
  }
}

export default function DebugCacheRoute() {
  return null;
}
