// Bulk Analytics API endpoint
import type { LoaderFunctionArgs } from 'react-router';
import prisma from '~/db.server';

// Server-only route - no client bundle needed
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
      case '24h':
        startDate.setHours(now.getHours() - 24);
        break;
      case '7d':
        startDate.setDate(now.getDate() - 7);
        break;
      case '30d':
        startDate.setDate(now.getDate() - 30);
        break;
      case '90d':
        startDate.setDate(now.getDate() - 90);
        break;
      default:
        startDate.setDate(now.getDate() - 7);
    }

    // First get the app records
    const apps = await prisma.app.findMany({
      where: { appId: { in: appIds } },
      select: { id: true, appId: true, name: true },
    });

    const appIdsMap = new Map(apps.map(app => [app.appId, app.id]));
    const validAppIds = apps.map(app => app.id);

    if (validAppIds.length === 0) {
      return Response.json([]);
    }

    // Get analytics data for all apps
    const results = await Promise.all(
      apps.map(async (app) => {
        try {
          const [totalEvents, addToCartEvents, initiateCheckoutEvents, purchaseEvents, purchaseEventsData, currencyData] = await Promise.all([
            prisma.event.count({
              where: { appId: app.id, createdAt: { gte: startDate } },
            }),
            prisma.event.count({
              where: { appId: app.id, eventName: 'add_to_cart', createdAt: { gte: startDate } },
            }),
            prisma.event.count({
              where: { appId: app.id, eventName: 'initiate_checkout', createdAt: { gte: startDate } },
            }),
            prisma.event.count({
              where: { appId: app.id, eventName: 'purchase', createdAt: { gte: startDate } },
            }),
            prisma.event.findMany({
              where: {
                appId: app.id,
                eventName: 'purchase',
                createdAt: { gte: startDate },
              },
              select: { value: true, currency: true },
            }),
            prisma.event.groupBy({
              by: ['currency'],
              where: {
                appId: app.id,
                createdAt: { gte: startDate },
                currency: { not: null },
              },
              _count: true,
              orderBy: { _count: { currency: 'desc' } },
              take: 1,
            }).then((results: any) => results[0]?.currency || 'USD'),
          ]);

          const totalRevenue = purchaseEventsData.reduce((sum: number, event: any) => {
            return sum + (event.value || 0);
          }, 0);

          // Get meta pixel ID from settings
          const settings = await prisma.appSettings.findUnique({
            where: { appId: app.appId },
            select: { metaPixelId: true },
          });

          return {
            appId: app.appId,
            name: app.name,
            metaPixelId: settings?.metaPixelId || '',
            totalEvents,
            addToCartEvents,
            initiateCheckoutEvents,
            purchaseEvents,
            totalRevenue,
            currency: currencyData,
          };
        } catch (error) {
          console.error(`Error fetching analytics for app ${app.appId}:`, error);
          return null;
        }
      })
    );

    const validResults = results.filter(Boolean);

    return Response.json(validResults, {
      headers: {
        'Cache-Control': 'public, max-age=300', // Cache for 5 minutes
      },
    });
  } catch (error) {
    console.error('Bulk Analytics API error:', error);
    if (error instanceof Error) {
      console.error('Stack:', error.stack);
      return Response.json({ error: 'Internal error', details: error.message }, { status: 500 });
    }
    return Response.json({ error: 'Internal error' }, { status: 500 });
  }
}