// Events API endpoint
import type { LoaderFunctionArgs } from 'react-router';
import prisma from '~/db.server';

export async function loader({ request }: LoaderFunctionArgs) {
  const url = new URL(request.url);
  const appId = url.searchParams.get('appId');
  const limit = parseInt(url.searchParams.get('limit') || '50');
  const offset = parseInt(url.searchParams.get('offset') || '0');
  const eventName = url.searchParams.get('eventName');
  
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

    // Build where clause
    let whereClause = 'WHERE "appId" = $1';
    const params: any[] = [app.id];

    if (eventName) {
      whereClause += ' AND "eventName" = $2';
      params.push(eventName);
    }

    // Get total count
    const totalQuery = `SELECT COUNT(*) as total FROM "Event" ${whereClause}`;
    const totalResult = await prisma.$queryRawUnsafe(totalQuery, ...params) as any;
    const total = parseInt(totalResult[0].total);

    // Get events with raw SQL for better performance
    const eventsQuery = `
      SELECT
        "id",
        "eventName",
        "url",
        "city",
        "country",
        "browser",
        "deviceType",
        "customData",
        "createdAt"
      FROM "Event"
      ${whereClause}
      ORDER BY "createdAt" DESC
      LIMIT $${params.length + 1} OFFSET $${params.length + 2}
    `;

    params.push(limit, offset);
    const events = await prisma.$queryRawUnsafe(eventsQuery, ...params) as any;

    return Response.json({ events, total }, {
      headers: {
        'Cache-Control': 'public, max-age=60', // Cache for 1 minute
      },
    });
  } catch (error) {
    console.error('Events API error:', error);
    return Response.json({ error: 'Internal error' }, { status: 500 });
  }
}

export default function EventsAPI() {
  return null;
}
