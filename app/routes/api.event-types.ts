import type { LoaderFunctionArgs } from 'react-router';
import prisma from '~/db.server';

export const clientLoader = undefined;

export async function loader({ request }: LoaderFunctionArgs) {
  const url = new URL(request.url);
  const appId = url.searchParams.get('appId');

  if (!appId) {
    return Response.json({ error: 'App ID required' }, { status: 400 });
  }

  try {
    const app = await prisma.app.findUnique({
      where: { appId },
      select: { id: true },
    });

    if (!app) {
      return Response.json({ error: 'App not found' }, { status: 404 });
    }

    // Get distinct event names for this app
    const eventTypes = await prisma.event.findMany({
      where: { appId: app.id },
      select: { eventName: true },
      distinct: ['eventName'],
      orderBy: { eventName: 'asc' },
    });

    const types = eventTypes.map(et => et.eventName);

    return Response.json({ eventTypes: types }, {
      headers: {
        'Cache-Control': 'public, max-age=300', // Cache for 5 minutes
      },
    });
  } catch (error) {
    console.error('Event types API error:', error);
    return Response.json({ error: 'Internal error' }, { status: 500 });
  }
}

export default function EventTypesAPI() {
  return null;
}