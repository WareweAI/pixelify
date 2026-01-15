// Analytics API endpoint - OPTIMIZED for speed
import type { LoaderFunctionArgs } from 'react-router';
import prisma from '~/db.server';

export const clientLoader = undefined;

export async function loader({ request }: LoaderFunctionArgs) {
  const url = new URL(request.url);
  const appId = url.searchParams.get('appId');
  const range = url.searchParams.get('range') || '7d';
  
  if (!appId) {
    return Response.json({ error: 'App ID required' }, { status: 400 });
  }
  
  try {
    // Find app
    const app = await prisma.app.findUnique({
      where: { appId },
      select: { id: true, name: true, appId: true },
    });

    if (!app) {
      return Response.json({ error: 'App not found' }, { status: 404 });
    }

    // Calculate date range
    const now = new Date();
    const startDate = new Date();
    switch (range) {
      case '24h': startDate.setHours(now.getHours() - 24); break;
      case '7d': startDate.setDate(now.getDate() - 7); break;
      case '30d': startDate.setDate(now.getDate() - 30); break;
      case '90d': startDate.setDate(now.getDate() - 90); break;
      default: startDate.setDate(now.getDate() - 7);
    }

    // Run ALL queries in parallel using raw SQL for speed
    const [
      overviewStats,
      topPages,
      topCountries,
      topBrowsers,
      deviceTypes,
      topEvents,
      topReferrers,
      dailyStats
    ] = await Promise.all([
      // Single optimized query for all overview stats
      prisma.$queryRaw`
        SELECT 
          COUNT(*) as "totalEvents",
          COUNT(*) FILTER (WHERE "eventName" IN ('PageView', 'pageview')) as "pageviews",
          COUNT(DISTINCT "fingerprint") as "uniqueVisitors",
          COUNT(*) FILTER (WHERE "eventName" IN ('AddToCart', 'add_to_cart', 'addToCart')) as "addToCartEvents",
          COUNT(*) FILTER (WHERE "eventName" IN ('InitiateCheckout', 'initiate_checkout', 'initiateCheckout')) as "initiateCheckoutEvents",
          COUNT(*) FILTER (WHERE "eventName" IN ('Purchase', 'purchase')) as "purchaseEvents",
          COALESCE(SUM("value") FILTER (WHERE "eventName" IN ('Purchase', 'purchase')), 0) as "totalRevenue",
          MODE() WITHIN GROUP (ORDER BY "currency") FILTER (WHERE "currency" IS NOT NULL) as "currency"
        FROM "Event"
        WHERE "appId" = ${app.id} AND "createdAt" >= ${startDate}
      ` as Promise<any[]>,

      // Top pages
      prisma.$queryRaw`
        SELECT "url", COUNT(*) as "count"
        FROM "Event"
        WHERE "appId" = ${app.id} 
          AND "eventName" IN ('PageView', 'pageview')
          AND "createdAt" >= ${startDate}
          AND "url" IS NOT NULL
        GROUP BY "url"
        ORDER BY "count" DESC
        LIMIT 10
      ` as Promise<any[]>,

      // Top countries
      prisma.$queryRaw`
        SELECT "country", COUNT(*) as "count"
        FROM "Event"
        WHERE "appId" = ${app.id} 
          AND "createdAt" >= ${startDate}
          AND "country" IS NOT NULL
        GROUP BY "country"
        ORDER BY "count" DESC
        LIMIT 10
      ` as Promise<any[]>,

      // Top browsers
      prisma.$queryRaw`
        SELECT "browser", COUNT(*) as "count"
        FROM "Event"
        WHERE "appId" = ${app.id} 
          AND "createdAt" >= ${startDate}
          AND "browser" IS NOT NULL
        GROUP BY "browser"
        ORDER BY "count" DESC
        LIMIT 10
      ` as Promise<any[]>,

      // Device types
      prisma.$queryRaw`
        SELECT "deviceType" as "type", COUNT(*) as "count"
        FROM "Event"
        WHERE "appId" = ${app.id} 
          AND "createdAt" >= ${startDate}
          AND "deviceType" IS NOT NULL
        GROUP BY "deviceType"
        ORDER BY "count" DESC
      ` as Promise<any[]>,

      // Top events (excluding pageview)
      prisma.$queryRaw`
        SELECT "eventName" as "event", COUNT(*) as "count"
        FROM "Event"
        WHERE "appId" = ${app.id} 
          AND "createdAt" >= ${startDate}
          AND "eventName" NOT IN ('PageView', 'pageview')
        GROUP BY "eventName"
        ORDER BY "count" DESC
        LIMIT 10
      ` as Promise<any[]>,

      // Top referrers
      prisma.$queryRaw`
        SELECT COALESCE("referrer", 'Direct') as "referrer", COUNT(*) as "count"
        FROM "Event"
        WHERE "appId" = ${app.id} 
          AND "createdAt" >= ${startDate}
        GROUP BY "referrer"
        ORDER BY "count" DESC
        LIMIT 10
      ` as Promise<any[]>,

      // Daily stats
      prisma.dailyStats.findMany({
        where: { appId: app.id, date: { gte: startDate } },
        orderBy: { date: 'asc' },
        select: { date: true, pageviews: true, uniqueUsers: true, sessions: true },
      }),
    ]);

    // Get session count separately (different table)
    const sessionCount = await prisma.analyticsSession.count({
      where: { appId: app.id, startTime: { gte: startDate } },
    });

    const stats = overviewStats[0] || {};

    return Response.json({
      app: { id: app.id, name: app.name, appId: app.appId },
      range,
      overview: {
        totalEvents: Number(stats.totalEvents) || 0,
        pageviews: Number(stats.pageviews) || 0,
        uniqueVisitors: Number(stats.uniqueVisitors) || 0,
        sessions: sessionCount,
        totalRevenue: Number(stats.totalRevenue) || 0,
        currency: stats.currency || 'USD',
        addToCartEvents: Number(stats.addToCartEvents) || 0,
        initiateCheckoutEvents: Number(stats.initiateCheckoutEvents) || 0,
        purchaseEvents: Number(stats.purchaseEvents) || 0,
      },
      topPages: topPages.map((r: any) => ({ url: r.url, count: Number(r.count) })),
      topReferrers: topReferrers.map((r: any) => ({ referrer: r.referrer, count: Number(r.count) })),
      topCountries: topCountries.map((r: any) => ({ country: r.country, count: Number(r.count) })),
      topBrowsers: topBrowsers.map((r: any) => ({ browser: r.browser, count: Number(r.count) })),
      deviceTypes: deviceTypes.map((r: any) => ({ type: r.type, count: Number(r.count) })),
      topEvents: topEvents.map((r: any) => ({ event: r.event, count: Number(r.count) })),
      dailyStats: dailyStats.map((r: any) => ({
        date: r.date.toISOString().split('T')[0],
        pageviews: r.pageviews,
        uniqueUsers: r.uniqueUsers,
        sessions: r.sessions,
      })),
    }, {
      headers: { 'Cache-Control': 'public, max-age=60' }, // Cache for 1 minute
    });
  } catch (error) {
    console.error('Analytics API error:', error);
    return Response.json({ error: 'Internal error', details: error instanceof Error ? error.message : 'Unknown' }, { status: 500 });
  }
}
