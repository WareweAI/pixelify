import type { LoaderFunctionArgs } from "react-router";
import { getShopifyInstance } from "../shopify.server";
import prisma from "../db.server";
import { cache, generateCacheKey, withCache } from "~/lib/cache.server";

export const loader = async ({ request }: LoaderFunctionArgs) => {
  const shopify = getShopifyInstance();
  if (!shopify?.authenticate) {
    return Response.json({ error: "Shopify not configured" }, { status: 500 });
  }

  let session;
  try {
    const authResult = await shopify.authenticate.admin(request);
    session = authResult.session;
  } catch (error) {
    if (error instanceof Response) throw error;
    return Response.json({ error: "Authentication failed" }, { status: 401 });
  }

  const shop = session.shop;
  const url = new URL(request.url);
  const bypassCache = url.searchParams.get('refresh') === 'true';
  const page = parseInt(url.searchParams.get('page') || '1');
  const limit = parseInt(url.searchParams.get('limit') || '20');
  const appId = url.searchParams.get('appId') || 'all';

  // Generate cache key
  const cacheKey = generateCacheKey('visitors', shop, appId, page, limit);

  // If bypassing cache, invalidate it first
  if (bypassCache) {
    cache.delete(cacheKey);
    console.log(`[Visitors API] Cache bypassed for ${shop}`);
  }

  // Use cache with 5 minute TTL (300 seconds)
  const cachedData = await withCache(cacheKey, 300, async () => {
    console.log(`[Visitors API] Fetching fresh data for ${shop}`);

    try {
      const user = await prisma.user.findUnique({ where: { storeUrl: shop } });
      if (!user) throw new Error("User not found");

      const apps = await prisma.app.findMany({
        where: { userId: user.id },
        select: { id: true, appId: true, name: true },
        orderBy: { createdAt: "desc" },
      });

      // Build where clause
      const whereClause: any = {
        app: { userId: user.id },
      };

      if (appId !== 'all') {
        whereClause.appId = appId;
      }

      // Fetch visitors data
      const [totalSessions, sessions] = await Promise.all([
        prisma.analyticsSession.count({ where: whereClause }),
        prisma.analyticsSession.findMany({
          where: whereClause,
          include: {
            app: { select: { name: true, appId: true } },
          },
          orderBy: { createdAt: 'desc' },
          take: limit,
          skip: (page - 1) * limit,
        }),
      ]);

      return {
        apps,
        sessions: sessions.map((s: any) => ({
          id: s.id,
          sessionId: s.sessionId,
          ipAddress: s.ipAddress,
          userAgent: s.userAgent,
          country: s.country,
          city: s.city,
          device: s.device,
          browser: s.browser,
          os: s.os,
          referrer: s.referrer,
          landingPage: s.landingPage,
          createdAt: s.createdAt,
          pixelName: s.app.name,
          pixelId: s.app.appId,
        })),
        totalSessions,
        page,
        limit,
        totalPages: Math.ceil(totalSessions / limit),
        cached: false,
        cacheTimestamp: new Date().toISOString(),
      };
    } catch (error: any) {
      console.error("[Visitors API] Error:", error);
      throw error;
    }
  });

  return Response.json(cachedData);
};
