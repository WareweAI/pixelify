import type { LoaderFunctionArgs } from "react-router";
import { getShopifyInstance } from "../shopify.server";
import prisma from "../db.server";
import { cache, generateCacheKey, withCache } from "~/lib/cache.server";

export const loader = async ({ request }: LoaderFunctionArgs) => {
  const shopify = getShopifyInstance();
  if (!shopify?.authenticate) {
    return Response.json({ error: "Shopify configuration not found" }, { status: 500 });
  }

  let session;
  try {
    const authResult = await shopify.authenticate.admin(request);
    session = authResult.session;
  } catch (error) {
    if (error instanceof Response && error.status === 302) throw error;
    return Response.json({ error: "Unable to authenticate" }, { status: 503 });
  }

  const shop = session.shop;
  const url = new URL(request.url);
  const appId = url.searchParams.get('appId');
  const bypassCache = url.searchParams.get('refresh') === 'true';

  if (!appId) {
    return Response.json({ error: "appId is required" }, { status: 400 });
  }

  // Generate cache key for this app's settings
  const cacheKey = generateCacheKey('app-settings', shop, appId);

  // ALWAYS bypass cache for app settings to ensure real-time Facebook token validation
  cache.delete(cacheKey);
  console.log(`[App Settings API] Cache disabled for real-time Facebook validation`);

  // Fetch fresh data without caching
  const fetchAppSettings = async () => {
    console.log(`[App Settings API] Fetching fresh data for ${shop}:${appId}`);

    const user = await prisma.user.findUnique({
      where: { storeUrl: shop },
    });

    if (!user) {
      return {
        settings: null,
        error: "User not found",
        cached: false,
        cacheTimestamp: new Date().toISOString(),
      };
    }

    const app = await prisma.app.findFirst({
      where: {
        appId,
        userId: user.id,
      },
      select: {
        id: true,
        appId: true,
        name: true,
        settings: true,
      },
    });

    if (!app) {
      return {
        settings: null,
        error: "App not found",
        cached: false,
        cacheTimestamp: new Date().toISOString(),
      };
    }

    return {
      settings: app.settings,
      cached: false,
      cacheTimestamp: new Date().toISOString(),
    };
  };

  const appSettings = await fetchAppSettings();
  return Response.json(appSettings);
};
