import type { LoaderFunctionArgs } from "react-router";
import { authenticate } from "../shopify.server";
import { cache, generateCacheKey, withCache } from "~/lib/cache.server";

export const loader = async ({ request }: LoaderFunctionArgs) => {
  let session, admin;
  try {
    const authResult = await authenticate.admin(request);
    session = authResult.session;
    admin = authResult.admin;
  } catch (error) {
    if (error instanceof Response && error.status === 302) throw error;
    return Response.json({ error: "Unable to authenticate" }, { status: 503 });
  }

  const shop = session.shop;
  const url = new URL(request.url);
  const bypassCache = url.searchParams.get('refresh') === 'true';

  // Generate cache key for this shop
  const cacheKey = generateCacheKey('pricing-data', shop);

  // If bypassing cache, invalidate it first
  if (bypassCache) {
    cache.delete(cacheKey);
    console.log(`[Pricing Data API] Cache bypassed for ${shop}`);
  }

  // Use cache with 5 minute TTL (300 seconds)
  const cachedData = await withCache(cacheKey, 300, async () => {
    console.log(`[Pricing Data API] Fetching fresh data for ${shop}`);

    try {
      const response = await admin.graphql(`
        query {
          appInstallation {
            activeSubscriptions {
              id
              name
              status
            }
          }
        }
      `);

      const data = await response.json() as any;
      const activeSubscriptions = data?.data?.appInstallation?.activeSubscriptions || [];

      let currentPlanName = 'free';
      let activeSubscription = null;

      if (activeSubscriptions.length > 0) {
        activeSubscription = activeSubscriptions.find((sub: any) =>
          sub.status === 'ACTIVE' || sub.status === 'active'
        );

        if (activeSubscription) {
          const planMap: Record<string, string> = {
            'Free': 'free',
            'Basic': 'basic',
            'Advance': 'advance'
          };
          currentPlanName = planMap[activeSubscription.name] || 'free';
        }
      }

      return {
        userPlan: { 
          planName: currentPlanName, 
          shopifyPlanName: activeSubscription?.name || 'Free' 
        },
        hasActivePayment: currentPlanName !== 'free',
        error: null,
        cached: false,
        cacheTimestamp: new Date().toISOString(),
      };
    } catch (error: any) {
      console.error('[Pricing Data API] Error:', error);
      return {
        userPlan: { planName: 'free', shopifyPlanName: 'Free' },
        hasActivePayment: false,
        error: error.message,
        cached: false,
        cacheTimestamp: new Date().toISOString(),
      };
    }
  });

  return Response.json(cachedData);
};
