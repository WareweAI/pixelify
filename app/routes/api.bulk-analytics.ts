// Bulk Analytics API endpoint - OPTIMIZED for speed
import type { LoaderFunctionArgs } from 'react-router';
import prisma from '~/db.server';

export const clientLoader = undefined;

export async function loader({ request }: LoaderFunctionArgs) {
  const url = new URL(request.url);
  const appIdsParam = url.searchParams.get('appIds');
  const range = url.searchParams.get('range') || '7d';

  if (!appIdsParam) {
    return Response.json({ error: 'App IDs required' }, { status: 400 });
  }

  const appIds = appIdsParam.split(',').map(id => id.trim()).filter(Boolean);

  if (appIds.length === 0) {
    return Response.json({ error: 'No valid app IDs provided' }, { status: 400 });
  }

  try {
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

    // Get all apps with settings in one query
    const apps = await prisma.app.findMany({
      where: { appId: { in: appIds } },
      select: { 
        id: true, 
        appId: true, 
        name: true,
        settings: {
          select: { metaPixelId: true }
        }
      },
    });

    if (apps.length === 0) {
      return Response.json([]);
    }

    const appDbIds = apps.map(app => app.id);

    // Single optimized query to get all stats for all apps at once
    const bulkStats = await prisma.$queryRaw`
      SELECT 
        "appId",
        COUNT(*) as "totalEvents",
        COUNT(*) FILTER (WHERE "eventName" IN ('AddToCart', 'add_to_cart', 'addToCart')) as "addToCartEvents",
        COUNT(*) FILTER (WHERE "eventName" IN ('InitiateCheckout', 'initiate_checkout', 'initiateCheckout')) as "initiateCheckoutEvents",
        COUNT(*) FILTER (WHERE "eventName" IN ('Purchase', 'purchase')) as "purchaseEvents",
        COALESCE(SUM("value") FILTER (WHERE "eventName" IN ('Purchase', 'purchase')), 0) as "totalRevenue",
        MODE() WITHIN GROUP (ORDER BY "currency") FILTER (WHERE "currency" IS NOT NULL) as "currency"
      FROM "Event"
      WHERE "appId" = ANY(${appDbIds})
        AND "createdAt" >= ${startDate}
      GROUP BY "appId"
    ` as any[];

    // Create a map for quick lookup
    const statsMap = new Map(bulkStats.map((s: any) => [s.appId, s]));

    // Build results
    const results = apps.map(app => {
      const stats = statsMap.get(app.id) || {};
      return {
        appId: app.appId,
        name: app.name,
        metaPixelId: app.settings?.metaPixelId || '',
        totalEvents: Number(stats.totalEvents) || 0,
        addToCartEvents: Number(stats.addToCartEvents) || 0,
        initiateCheckoutEvents: Number(stats.initiateCheckoutEvents) || 0,
        purchaseEvents: Number(stats.purchaseEvents) || 0,
        totalRevenue: Number(stats.totalRevenue) || 0,
        currency: stats.currency || 'USD',
      };
    });

    return Response.json(results, {
      headers: { 'Cache-Control': 'public, max-age=60' }, // Cache for 1 minute
    });
  } catch (error) {
    console.error('Bulk Analytics API error:', error);
    return Response.json({ error: 'Internal error', details: error instanceof Error ? error.message : 'Unknown' }, { status: 500 });
  }
}
