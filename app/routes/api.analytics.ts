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
  const appId = url.searchParams.get('appId');
  const range = url.searchParams.get('range') || '7d';

  if (!appId) {
    return Response.json({ error: "appId is required" }, { status: 400 });
  }

  // Generate cache key
  const cacheKey = generateCacheKey('analytics', shop, appId, range);

  // If bypassing cache, invalidate it first
  if (bypassCache) {
    cache.delete(cacheKey);
    console.log(`[Analytics API] Cache bypassed for ${shop}`);
  }

  // Use cache with 5 minute TTL (300 seconds)
  const cachedData = await withCache(cacheKey, 300, async () => {
    console.log(`[Analytics API] Fetching fresh data for ${shop}`);

    try {
      const user = await prisma.user.findUnique({ where: { storeUrl: shop } });
      if (!user) throw new Error("User not found");

      const app = await prisma.app.findFirst({
        where: { appId, userId: user.id },
        select: { id: true, appId: true, name: true },
      });

      if (!app) throw new Error("App not found");

      // Calculate date range
      const startDate = new Date();
      switch (range) {
        case '24h':
          startDate.setHours(startDate.getHours() - 24);
          break;
        case '7d':
          startDate.setDate(startDate.getDate() - 7);
          break;
        case '30d':
          startDate.setDate(startDate.getDate() - 30);
          break;
        case '90d':
          startDate.setDate(startDate.getDate() - 90);
          break;
        default:
          startDate.setDate(startDate.getDate() - 7);
      }

      // Fetch all analytics data in parallel
      const [
        events,
        sessions,
        topPages,
        topReferrers,
        topCountries,
        topBrowsers,
        deviceTypes,
        dailyStats
      ] = await Promise.all([
        // All events
        prisma.event.findMany({
          where: {
            appId: app.id,
            createdAt: { gte: startDate }
          },
          select: {
            id: true,
            eventName: true,
            url: true,
            referrer: true,
            country: true,
            browser: true,
            deviceType: true,
            value: true,
            currency: true,
            fingerprint: true,
            sessionId: true,
            createdAt: true
          }
        }),

        // Sessions
        prisma.analyticsSession.findMany({
          where: {
            appId: app.id,
            startTime: { gte: startDate }
          },
          select: {
            id: true,
            fingerprint: true,
            sessionId: true
          }
        }),

        // Top pages
        prisma.event.groupBy({
          by: ['url'],
          where: {
            appId: app.id,
            createdAt: { gte: startDate },
            url: { not: null }
          },
          _count: { id: true },
          orderBy: { _count: { id: 'desc' } },
          take: 10
        }),

        // Top referrers
        prisma.event.groupBy({
          by: ['referrer'],
          where: {
            appId: app.id,
            createdAt: { gte: startDate },
            referrer: { not: null }
          },
          _count: { id: true },
          orderBy: { _count: { id: 'desc' } },
          take: 10
        }),

        // Top countries
        prisma.event.groupBy({
          by: ['country'],
          where: {
            appId: app.id,
            createdAt: { gte: startDate },
            country: { not: null }
          },
          _count: { id: true },
          orderBy: { _count: { id: 'desc' } },
          take: 10
        }),

        // Top browsers
        prisma.event.groupBy({
          by: ['browser'],
          where: {
            appId: app.id,
            createdAt: { gte: startDate },
            browser: { not: null }
          },
          _count: { id: true },
          orderBy: { _count: { id: 'desc' } },
          take: 10
        }),

        // Device types
        prisma.event.groupBy({
          by: ['deviceType'],
          where: {
            appId: app.id,
            createdAt: { gte: startDate },
            deviceType: { not: null }
          },
          _count: { id: true },
          orderBy: { _count: { id: 'desc' } }
        }),

        // Daily stats
        prisma.$queryRaw<Array<{ date: Date; pageviews: number; uniqueUsers: number; sessions: number }>>`
          SELECT 
            DATE("createdAt") as date,
            COUNT(CASE WHEN "eventName" = 'PageView' THEN 1 END)::int as pageviews,
            COUNT(DISTINCT "fingerprint")::int as "uniqueUsers",
            COUNT(DISTINCT "sessionId")::int as sessions
          FROM "Event"
          WHERE "appId" = ${app.id}
          AND "createdAt" >= ${startDate}
          GROUP BY DATE("createdAt")
          ORDER BY date ASC
        `
      ]);

      // Calculate metrics
      const pageviews = events.filter(e => e.eventName === 'PageView').length;
      const uniqueVisitors = new Set(events.map(e => e.fingerprint).filter(Boolean)).size;
      const totalSessions = sessions.length;
      const addToCartEvents = events.filter(e => e.eventName === 'AddToCart').length;
      const initiateCheckoutEvents = events.filter(e => e.eventName === 'InitiateCheckout').length;
      const purchaseEvents = events.filter(e => e.eventName === 'Purchase').length;
      
      const totalRevenue = events
        .filter(e => e.eventName === 'Purchase' && e.value)
        .reduce((sum, e) => sum + (e.value || 0), 0);
      
      const currency = events.find(e => e.currency)?.currency || 'USD';

      // Top events
      const eventCounts = new Map<string, number>();
      events.forEach(e => {
        eventCounts.set(e.eventName, (eventCounts.get(e.eventName) || 0) + 1);
      });
      const topEvents = Array.from(eventCounts.entries())
        .map(([event, count]) => ({ event, count }))
        .sort((a, b) => b.count - a.count)
        .slice(0, 10);

      return {
        app: {
          id: app.id,
          name: app.name,
          appId: app.appId
        },
        range,
        overview: {
          totalEvents: events.length,
          pageviews,
          uniqueVisitors,
          sessions: totalSessions,
          totalRevenue,
          currency,
          addToCartEvents,
          initiateCheckoutEvents,
          purchaseEvents
        },
        topPages: topPages.map(p => ({ url: p.url || '', count: p._count.id })),
        topReferrers: topReferrers.map(r => ({ referrer: r.referrer || '', count: r._count.id })),
        topCountries: topCountries.map(c => ({ country: c.country || '', count: c._count.id })),
        topBrowsers: topBrowsers.map(b => ({ browser: b.browser || '', count: b._count.id })),
        deviceTypes: deviceTypes.map(d => ({ type: d.deviceType || 'Unknown', count: d._count.id })),
        topEvents,
        dailyStats: dailyStats.map(d => ({
          date: d.date.toISOString().split('T')[0],
          pageviews: d.pageviews,
          uniqueUsers: d.uniqueUsers,
          sessions: d.sessions
        })),
        cached: false,
        cacheTimestamp: new Date().toISOString(),
      };
    } catch (error: any) {
      console.error("[Analytics API] Error:", error);
      throw error;
    }
  });

  return Response.json(cachedData);
};
