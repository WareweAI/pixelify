// App Settings API endpoint
import type { LoaderFunctionArgs } from 'react-router';
import prisma from '~/db.server';

// Server-only route - no client bundle needed
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
      include: { settings: true },
    });

    if (!app) {
      return Response.json({ error: 'App not found' }, { status: 404 });
    }

    return Response.json({ settings: app.settings });
  } catch (error) {
    console.error('App Settings API error:', error);
    return Response.json({ error: 'Internal error' }, { status: 500 });
  }
}