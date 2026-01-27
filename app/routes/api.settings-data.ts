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
  const bypassCache = url.searchParams.get('refresh') === 'true';

  // Generate cache key for this shop
  const cacheKey = generateCacheKey('settings-data', shop);

  // If bypassing cache, invalidate it first
  if (bypassCache) {
    cache.delete(cacheKey);
    console.log(`[Settings Data API] Cache bypassed for ${shop}`);
  }

  // Use cache with 5 minute TTL (300 seconds)
  const cachedData = await withCache(cacheKey, 300, async () => {
    console.log(`[Settings Data API] Fetching fresh data for ${shop}`);

    const user = await prisma.user.findUnique({
      where: { storeUrl: shop },
    });

    if (!user) {
      return {
        apps: [],
        cached: false,
        cacheTimestamp: new Date().toISOString(),
      };
    }

    const apps = await prisma.app.findMany({
      where: { userId: user.id },
      select: {
        id: true,
        appId: true,
        name: true,
      },
    });

    return {
      apps,
      cached: false,
      cacheTimestamp: new Date().toISOString(),
    };
  });

  return Response.json(cachedData);
};
