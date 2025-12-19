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
    const where: any = { appId: app.id };
    if (eventName) {
      where.eventName = eventName;
    }

    // Get total count
    const total = await prisma.event.count({ where });

    // Get events
    const events = await prisma.event.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      take: limit,
      skip: offset,
      select: {
        id: true,
        eventName: true,
        url: true,
        city: true,
        country: true,
        browser: true,
        deviceType: true,
        createdAt: true,
      },
    });

    return Response.json({ events, total });
  } catch (error) {
    console.error('Events API error:', error);
    return Response.json({ error: 'Internal error' }, { status: 500 });
  }
}

export default function EventsAPI() {
  return null;
}
