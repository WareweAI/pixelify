// Visitors API endpoint
import type { LoaderFunctionArgs } from 'react-router';
import prisma from '~/db.server';

export async function loader({ request }: LoaderFunctionArgs) {
  const url = new URL(request.url);
  const appId = url.searchParams.get('appId');
  
  if (!appId) {
    return Response.json({ error: 'App ID required' }, { status: 400 });
  }
  
  try {
    // Find app
    const app = await prisma.app.findUnique({
      where: { appId },
      select: { id: true },
    });

    if (!app) {
      return Response.json({ error: 'App not found' }, { status: 404 });
    }

    // Get sessions
    const sessions = await prisma.analyticsSession.findMany({
      where: { appId: app.id },
      orderBy: { startTime: 'desc' },
      take: 100,
      select: {
        id: true,
        sessionId: true,
        browser: true,
        os: true,
        deviceType: true,
        country: true,
        pageviews: true,
        startTime: true,
        lastSeen: true,
      },
    });

    // Real-time active visitors (last 5 minutes)
    const fiveMinutesAgo = new Date(Date.now() - 5 * 60 * 1000);
    const activeNow = await prisma.analyticsSession.count({
      where: { 
        appId: app.id,
        lastSeen: { gte: fiveMinutesAgo },
      },
    });

    // Get stats
    const totalSessions = await prisma.analyticsSession.count({
      where: { appId: app.id },
    });

    const uniqueVisitors = await prisma.analyticsSession.findMany({
      where: { appId: app.id },
      select: { fingerprint: true },
      distinct: ['fingerprint'],
    }).then(r => r.length);

    // Calculate average duration
    const sessionsWithDuration = await prisma.analyticsSession.findMany({
      where: { appId: app.id },
      select: { startTime: true, lastSeen: true },
    });

    const avgDuration = sessionsWithDuration.length > 0
      ? Math.floor(
          sessionsWithDuration.reduce((sum, s) => {
            const duration = (new Date(s.lastSeen).getTime() - new Date(s.startTime).getTime()) / 1000;
            return sum + duration;
          }, 0) / sessionsWithDuration.length
        )
      : 0;

    // Bounce rate (sessions with only 1 pageview)
    const bouncedSessions = await prisma.analyticsSession.count({
      where: { appId: app.id, pageviews: 1 },
    });
    const bounceRate = totalSessions > 0 ? (bouncedSessions / totalSessions) * 100 : 0;

    // Top countries
    const topCountries = await prisma.analyticsSession.groupBy({
      by: ['country'],
      where: { appId: app.id, country: { not: null } },
      _count: true,
      orderBy: { _count: { country: 'desc' } },
      take: 10,
    }).then(results => results.map(r => ({ country: r.country!, count: r._count })));

    // Device breakdown
    const deviceBreakdown = await prisma.analyticsSession.groupBy({
      by: ['deviceType'],
      where: { appId: app.id, deviceType: { not: null } },
      _count: true,
      orderBy: { _count: { deviceType: 'desc' } },
    }).then(results => results.map(r => ({ type: r.deviceType!, count: r._count })));

    return Response.json({
      activeNow,
      totalSessions,
      uniqueVisitors,
      avgDuration,
      bounceRate,
      sessions,
      topCountries,
      deviceBreakdown,
    });
  } catch (error) {
    console.error('Visitors API error:', error);
    return Response.json({ error: 'Internal error' }, { status: 500 });
  }
}

export default function VisitorsAPI() {
  return null;
}
