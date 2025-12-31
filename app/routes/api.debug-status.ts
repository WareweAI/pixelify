import type { LoaderFunctionArgs } from "react-router";
import prisma from "~/db.server";

export async function loader({ request }: LoaderFunctionArgs) {
  const url = new URL(request.url);
  const shop = url.searchParams.get("shop");

  try {
    // Get recent events from the last 24 hours
    const twentyFourHoursAgo = new Date(Date.now() - 24 * 60 * 60 * 1000);
    
    const recentEvents = await prisma.event.findMany({
      where: {
        createdAt: {
          gte: twentyFourHoursAgo,
        },
      },
      include: {
        app: {
          include: {
            settings: true,
            user: true,
          },
        },
      },
      orderBy: {
        createdAt: 'desc',
      },
      take: 50,
    });

    // Get app configuration for the shop if provided
    let appConfig = null;
    if (shop) {
      const user = await prisma.user.findUnique({
        where: { storeUrl: shop },
        include: {
          apps: {
            include: {
              settings: true,
            },
            orderBy: { createdAt: 'desc' },
            take: 1,
          },
        },
      });

      if (user && user.apps.length > 0) {
        appConfig = {
          appId: user.apps[0].appId,
          name: user.apps[0].name,
          settings: user.apps[0].settings,
        };
      }
    }

    // Event statistics
    const eventStats = await prisma.event.groupBy({
      by: ['eventName'],
      where: {
        createdAt: {
          gte: twentyFourHoursAgo,
        },
      },
      _count: {
        eventName: true,
      },
      orderBy: {
        _count: {
          eventName: 'desc',
        },
      },
    });

    // App statistics
    const appStats = await prisma.app.findMany({
      include: {
        settings: true,
        _count: {
          select: {
            events: {
              where: {
                createdAt: {
                  gte: twentyFourHoursAgo,
                },
              },
            },
          },
        },
      },
    });

    return Response.json({
      timestamp: new Date().toISOString(),
      shop: shop || 'not specified',
      recentEvents: recentEvents.map(event => ({
        id: event.id,
        eventName: event.eventName,
        createdAt: event.createdAt,
        url: event.url,
        appId: event.app.appId,
        appName: event.app.name,
        hasCustomData: !!event.customData,
        customDataKeys: event.customData ? Object.keys(event.customData as any) : [],
        userAgent: event.userAgent?.substring(0, 100),
      })),
      eventStats: eventStats.map(stat => ({
        eventName: stat.eventName,
        count: stat._count.eventName,
      })),
      appConfig,
      appStats: appStats.map(app => ({
        appId: app.appId,
        name: app.name,
        eventCount24h: app._count.events,
        metaPixelEnabled: app.settings?.metaPixelEnabled || false,
        metaVerified: app.settings?.metaVerified || false,
        hasMetaPixelId: !!app.settings?.metaPixelId,
        hasMetaAccessToken: !!app.settings?.metaAccessToken,
        autoTrackPageviews: app.settings?.autoTrackPageviews ?? true,
        autoTrackAddToCart: app.settings?.autoTrackAddToCart ?? true,
        autoTrackViewContent: app.settings?.autoTrackViewContent ?? true,
      })),
      totalEvents24h: recentEvents.length,
    });
  } catch (error) {
    console.error('[Debug Status] Error:', error);
    return Response.json({
      error: 'Failed to get debug status',
      timestamp: new Date().toISOString(),
    }, { status: 500 });
  }
}

export default function DebugStatusRoute() {
  return null;
}