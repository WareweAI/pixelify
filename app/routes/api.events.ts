// Events API endpoint - optimized for performance
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

    // Build where clause - OPTIMIZED: Use app.id directly and combine queries
    const whereFilter = eventName 
      ? { appId: app.id, eventName }
      : { appId: app.id };

    // Use Promise.all to run count and fetch in parallel
    const [total, events] = await Promise.all([
      prisma.event.count({ where: whereFilter }),
      prisma.event.findMany({
        where: whereFilter,
        select: {
          id: true,
          eventName: true,
          url: true,
          city: true,
          country: true,
          browser: true,
          deviceType: true,
          customData: true,
          createdAt: true,
        },
        orderBy: { createdAt: 'desc' },
        take: limit,
        skip: offset,
      }),
    ]);

    return Response.json({ events, total }, {
      headers: {
        'Cache-Control': 'public, max-age=30', // Cache for 30 seconds - more responsive
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
