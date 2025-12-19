// Apps management API - Thin HTTP handler
import type { ActionFunctionArgs, LoaderFunctionArgs } from 'react-router';
import { getUserApps, createAppWithSettings } from '~/services/app.service.server';
import { ValidationError, DatabaseError } from '~/lib/errors.server';

// GET - List apps for a user
export async function loader({ request }: LoaderFunctionArgs) {
  const url = new URL(request.url);
  const userId = url.searchParams.get('userId');
  
  if (!userId) {
    return Response.json({ error: 'User ID required' }, { status: 400 });
  }
  
  try {
    const apps = await getUserApps(userId);
    return Response.json({ apps });
  } catch (error) {
    console.error('Apps list error:', error);
    return Response.json({ error: 'Internal error' }, { status: 500 });
  }
}

// POST - Create a new app
export async function action({ request }: ActionFunctionArgs) {
  if (request.method !== 'POST') {
    return Response.json({ error: 'Method not allowed' }, { status: 405 });
  }
  
  try {
    const body = await request.json();
    const { userId, name, metaAppId, metaAccessToken } = body;
    
    if (!userId || !name) {
      return Response.json(
        { error: 'userId and name are required' },
        { status: 400 }
      );
    }
    
    const result = await createAppWithSettings({
      userId,
      name,
      metaAppId,
      metaAccessToken,
    });
    
    return Response.json(result);
  } catch (error) {
    if (error instanceof ValidationError) {
      return Response.json({ error: error.message }, { status: 400 });
    }
    console.error('Create app error:', error);
    return Response.json({ error: 'Internal error' }, { status: 500 });
  }
}


export default function AppsAPI() {
  return null;
}
