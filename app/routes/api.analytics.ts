// Analytics API endpoint
import type { LoaderFunctionArgs } from 'react-router';
import prisma from '~/db.server';

// Server-only route - no client bundle needed
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

    // Get overview stats
    const [totalEvents, pageviews, uniqueVisitors, sessions] = await Promise.all([
      prisma.event.count({
        where: { appId: app.id, createdAt: { gte: startDate } },
      }),
      prisma.event.count({
        where: { appId: app.id, eventName: 'pageview', createdAt: { gte: startDate } },
      }),
      prisma.event.findMany({
        where: { appId: app.id, createdAt: { gte: startDate } },
        select: { fingerprint: true },
        distinct: ['fingerprint'],
      }).then(r => r.length),
      prisma.analyticsSession.count({
        where: { appId: app.id, startTime: { gte: startDate } },
      }),
    ]);

    // Get top pages
    const topPages = await prisma.event.groupBy({
      by: ['url'],
      where: {
        appId: app.id,
        eventName: 'pageview',
        createdAt: { gte: startDate },
        url: { not: null },
      },
      _count: true,
      orderBy: { _count: { url: 'desc' } },
      take: 10,
    }).then(results => results.map(r => ({ url: r.url!, count: r._count })));

    // Get top countries
    const topCountries = await prisma.event.groupBy({
      by: ['country'],
      where: {
        appId: app.id,
        createdAt: { gte: startDate },
        country: { not: null },
      },
      _count: true,
      orderBy: { _count: { country: 'desc' } },
      take: 10,
    }).then(results => results.map(r => ({ country: r.country!, count: r._count })));

    // Get top browsers
    const topBrowsers = await prisma.event.groupBy({
      by: ['browser'],
      where: {
        appId: app.id,
        createdAt: { gte: startDate },
        browser: { not: null },
      },
      _count: true,
      orderBy: { _count: { browser: 'desc' } },
      take: 10,
    }).then(results => results.map(r => ({ browser: r.browser!, count: r._count })));

    // Get device types
    const deviceTypes = await prisma.event.groupBy({
      by: ['deviceType'],
      where: {
        appId: app.id,
        createdAt: { gte: startDate },
        deviceType: { not: null },
      },
      _count: true,
      orderBy: { _count: { deviceType: 'desc' } },
    }).then(results => results.map(r => ({ type: r.deviceType!, count: r._count })));

    // Get top events (excluding pageview)
    const topEvents = await prisma.event.groupBy({
      by: ['eventName'],
      where: {
        appId: app.id,
        createdAt: { gte: startDate },
        eventName: { not: 'pageview' },
      },
      _count: true,
      orderBy: { _count: { eventName: 'desc' } },
      take: 10,
    }).then(results => results.map(r => ({ event: r.eventName, count: r._count })));

    // Get top referrers
    const topReferrers = await prisma.event.groupBy({
      by: ['referrer'],
      where: {
        appId: app.id,
        createdAt: { gte: startDate },
      },
      _count: true,
      orderBy: { _count: { referrer: 'desc' } },
      take: 10,
    }).then(results => results.map(r => ({ referrer: r.referrer || 'Direct', count: r._count })));

    // Get daily stats
    const dailyStats = await prisma.dailyStats.findMany({
      where: {
        appId: app.id,
        date: { gte: startDate },
      },
      orderBy: { date: 'asc' },
      select: {
        date: true,
        pageviews: true,
        uniqueUsers: true,
        sessions: true,
      },
    }).then(results => results.map(r => ({
      date: r.date.toISOString().split('T')[0],
      pageviews: r.pageviews,
      uniqueUsers: r.uniqueUsers,
      sessions: r.sessions,
    })));

    // Get recent events
    const recentEvents = await prisma.event.findMany({
      where: { appId: app.id, createdAt: { gte: startDate } },
      orderBy: { createdAt: 'desc' },
      take: 20,
      select: {
        id: true,
        eventName: true,
        url: true,
        country: true,
        city: true,
        browser: true,
        deviceType: true,
        createdAt: true,
      },
    });

    return Response.json({
      app: { id: app.id, name: app.name, appId: app.appId },
      range,
      overview: {
        totalEvents,
        pageviews,
        uniqueVisitors,
        sessions,
      },
      topPages,
      topReferrers,
      topCountries,
      topBrowsers,
      deviceTypes,
      topEvents,
      dailyStats,
      recentEvents,
    });
  } catch (error) {
    console.error('Analytics API error:', error);
    return Response.json({ error: 'Internal error' }, { status: 500 });
  }
}

