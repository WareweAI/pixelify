// API endpoint to disconnect Facebook and clear all tokens
import type { LoaderFunctionArgs, ActionFunctionArgs } from "react-router";
import { getShopifyInstance } from "../shopify.server";
import prisma from "../db.server";
import { cache } from "~/lib/cache.server";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type",
  "X-Content-Type-Options": "nosniff",
};

// Handle OPTIONS preflight requests for CORS
export async function action({ request }: ActionFunctionArgs) {
  if (request.method === "OPTIONS") {
    return new Response(null, { status: 204, headers: corsHeaders });
  }

  if (request.method !== "POST") {
    return new Response("Method not allowed", { status: 405, headers: corsHeaders });
  }

  try {
    const shopify = getShopifyInstance();
    const { session } = await shopify.authenticate.admin(request);
    const shop = session.shop;

    console.log(`[Facebook Disconnect] Starting disconnect process for shop: ${shop}`);

    // Find the user
    const user = await prisma.user.findUnique({
      where: { storeUrl: shop },
    });

    if (!user) {
      console.error(`[Facebook Disconnect] User not found for shop: ${shop}`);
      return Response.json(
        { error: "User not found" },
        { status: 404, headers: corsHeaders }
      );
    }

    // Get all apps for this user
    const apps = await prisma.app.findMany({
      where: { userId: user.id },
      include: { settings: true },
    });

    console.log(`[Facebook Disconnect] Found ${apps.length} apps to clear Facebook tokens from`);

    // Clear Facebook tokens from all app settings
    for (const app of apps) {
      if (app.settings) {
        await prisma.appSettings.update({
          where: { id: app.settings.id },
          data: {
            metaAccessToken: null,
            metaTokenExpiresAt: null,
            metaPixelId: null,
            metaPixelEnabled: false,
            metaVerified: false,
            metaTestEventCode: null,
            facebookCatalogId: null,
            facebookCatalogEnabled: false,
            facebookCatalogSyncStatus: null,
            facebookCatalogLastSync: null,
          },
        });
        console.log(`[Facebook Disconnect] Cleared Facebook tokens from app: ${app.name} (${app.appId})`);
      }
    }

    // Clear Facebook user ID from user record
    await prisma.user.update({
      where: { id: user.id },
      data: {
        facebookUserId: null,
      },
    });
    console.log(`[Facebook Disconnect] Cleared Facebook user ID from user: ${user.id}`);

    // Clear all cache entries for this shop (Facebook and general app data)
    const cachePatterns = [
      `dashboard:${shop}:`,
      `app-settings:${shop}:`,
      `catalog-data:${shop}:`,
      `settings-data:${shop}:`,
      `analytics:${shop}:`,
      `analytics-data:${shop}:`,
      `events-data:${shop}:`,
      `custom-events:${shop}:`,
      `pixels:${shop}:`,
      `visitors:${shop}:`,
      `pricing-data:${shop}:`,
    ];

    let totalCleared = 0;
    for (const pattern of cachePatterns) {
      const cleared = cache.invalidatePattern(pattern);
      totalCleared += cleared;
      console.log(`[Facebook Disconnect] Cleared ${cleared} cache entries matching pattern: ${pattern}`);
    }

    // Also clear any Facebook-specific cache keys that might exist
    const facebookPatterns = [
      `facebook:${shop}:`,
      `facebook-pixels:${shop}:`,
      `facebook-user:${shop}:`,
      `facebook-catalog:${shop}:`,
    ];

    for (const pattern of facebookPatterns) {
      const cleared = cache.invalidatePattern(pattern);
      totalCleared += cleared;
      console.log(`[Facebook Disconnect] Cleared ${cleared} Facebook-specific cache entries matching pattern: ${pattern}`);
    }

    // As a final step, clear any remaining cache entries that contain the shop name
    // This ensures complete cache clearing for Facebook disconnect
    const shopPattern = `.*${shop}.*`;
    const remainingCleared = cache.invalidatePattern(shopPattern);
    totalCleared += remainingCleared;
    console.log(`[Facebook Disconnect] Cleared ${remainingCleared} remaining cache entries for shop: ${shop}`);

    console.log(`[Facebook Disconnect] Total cache entries cleared: ${totalCleared}`);

    // Log successful disconnect
    console.log(`[Facebook Disconnect] ✅ Successfully disconnected Facebook for shop: ${shop}`);
    console.log(`[Facebook Disconnect] - Tokens removed from ${apps.length} apps`);
    console.log(`[Facebook Disconnect] - Facebook user ID cleared`);
    console.log(`[Facebook Disconnect] - ${totalCleared} cache entries invalidated`);

    // Return response with cache control headers to prevent browser caching
    const responseHeaders = {
      ...corsHeaders,
      "Cache-Control": "no-cache, no-store, must-revalidate",
      "Pragma": "no-cache",
      "Expires": "0",
    };

    return Response.json({
      success: true,
      message: "Facebook disconnected successfully",
      details: {
        appsUpdated: apps.length,
        cacheEntriesCleared: totalCleared,
        shop,
        timestamp: new Date().toISOString(),
      },
    }, { headers: responseHeaders });

  } catch (error) {
    console.error("[Facebook Disconnect] Error during disconnect:", error);
    
    return Response.json({
      error: "Failed to disconnect Facebook",
      details: String(error),
    }, { 
      status: 500, 
      headers: corsHeaders 
    });
  }
}

export async function loader({ request }: LoaderFunctionArgs) {
  return new Response("Method not allowed", { status: 405, headers: corsHeaders });
}

export default function FacebookDisconnectRoute() {
  return null;
}
