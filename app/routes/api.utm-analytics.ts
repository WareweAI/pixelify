// UTM Analytics API endpoint
import type { LoaderFunctionArgs } from 'react-router';
import { AnalyticsService } from '~/services/analytics.server';

// Server-only route - no client bundle needed
export const clientLoader = undefined;

export async function loader({ request }: LoaderFunctionArgs) {
  const url = new URL(request.url);
  const appId = url.searchParams.get('appId');
  const range = url.searchParams.get('range') || '30d';
  const type = url.searchParams.get('type') || 'facebook'; // facebook, campaigns, sources

  if (!appId) {
    return Response.json({ error: 'App ID required' }, { status: 400 });
  }

  try {
    let data;

    switch (type) {
      case 'facebook':
        data = await AnalyticsService.getFacebookAdsAnalytics(appId, range);
        break;
      case 'campaigns':
        data = await AnalyticsService.getUtmCampaignPerformance(appId, range);
        break;
      case 'sources':
        data = await AnalyticsService.getUtmSourceMediumBreakdown(appId, range);
        break;
      default:
        return Response.json({ error: 'Invalid type parameter' }, { status: 400 });
    }

    return Response.json(data);
  } catch (error) {
    console.error('UTM Analytics API error:', error);
    return Response.json({ error: 'Internal error' }, { status: 500 });
  }
}
