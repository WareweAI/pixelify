import type { LoaderFunctionArgs } from "react-router";
import { getShopifyInstance } from "../shopify.server";
import db from "../db.server";
import { cache, generateCacheKey, withCache } from "~/lib/cache.server";

export const loader = async ({ request }: LoaderFunctionArgs) => {
  const shopify = getShopifyInstance();
  if (!shopify?.authenticate) {
    return Response.json({ error: "Shopify configuration not found" }, { status: 500 });
  }

  let session, admin;
  try {
    const authResult = await shopify.authenticate.admin(request);
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
  const cacheKey = generateCacheKey('custom-events', shop);

  // If bypassing cache, invalidate it first
  if (bypassCache) {
    cache.delete(cacheKey);
    console.log(`[Custom Events API] Cache bypassed for ${shop}`);
  }

  // Use cache with 5 minute TTL (300 seconds)
  const cachedData = await withCache(cacheKey, 300, async () => {
    console.log(`[Custom Events API] Fetching fresh data for ${shop}`);

    const user = await db.user.findUnique({ where: { storeUrl: shop } });
    if (!user) {
      throw new Error("User not found for this shop");
    }

    const app = await db.app.findFirst({
      where: { userId: user.id },
      include: { 
        customEvents: {
          select: {
            id: true,
            name: true,
            displayName: true,
            description: true,
            metaEventName: true,
            isActive: true,
            createdAt: true,
            pageType: true,
            pageUrl: true,
            eventType: true,
            selector: true,
            eventData: true,
          },
          orderBy: { createdAt: "desc" },
        }
      },
      orderBy: { createdAt: "desc" },
    });

    if (!app) {
      throw new Error("App not found for this shop");
    }

    // Get current plan from Shopify GraphQL API (source of truth)
    let currentPlan = app.plan || 'Free';
    
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

      if (activeSubscriptions.length > 0) {
        const activeSubscription = activeSubscriptions.find((sub: any) =>
          sub.status === 'ACTIVE' || sub.status === 'active'
        );

        if (activeSubscription) {
          // Only recognize Free, Basic, and Advance plans
          const shopifyPlanName = activeSubscription.name;
          
          // Normalize plan name - only accept exact matches for Free, Basic, or Advance
          if (shopifyPlanName === 'Free' || shopifyPlanName === 'Basic' || shopifyPlanName === 'Advance') {
            currentPlan = shopifyPlanName;
          } else {
            // Any other plan name defaults to Free
            currentPlan = 'Free';
          }
          
          // Update database if plan changed
          if (currentPlan !== app.plan) {
            await db.app.update({
              where: { id: app.id },
              data: { plan: currentPlan },
            });
            console.log(`✅ Updated plan in database: ${app.plan} → ${currentPlan} for shop ${shop}`);
          }
        } else {
          // No active subscription = Free plan
          currentPlan = 'Free';
          if (app.plan !== 'Free') {
            await db.app.update({
              where: { id: app.id },
              data: { plan: 'Free' },
            });
            console.log(`✅ Updated plan to Free (no active subscription) for shop ${shop}`);
          }
        }
      } else {
        // No subscriptions = Free plan
        currentPlan = 'Free';
        if (app.plan !== 'Free') {
          await db.app.update({
            where: { id: app.id },
            data: { plan: 'Free' },
          });
          console.log(`✅ Updated plan to Free (no subscriptions) for shop ${shop}`);
        }
      }
    } catch (error: any) {
      console.error('⚠️ Failed to fetch plan from Shopify GraphQL, using database plan:', error);
      // Fallback to database plan if GraphQL fails
      currentPlan = app.plan || 'Free';
    }

    // Determine access based on plan - only Free, Basic, and Advance are valid
    // Ensure plan is one of the three valid plans
    if (currentPlan !== 'Free' && currentPlan !== 'Basic' && currentPlan !== 'Advance') {
      currentPlan = 'Free';
    }
    
    const isFreePlan = currentPlan === 'Free';
    const hasAccess = currentPlan === 'Basic' || currentPlan === 'Advance';

    console.log(`📊 Custom Events Access Check - Shop: ${shop}, Plan: ${currentPlan}, Has Access: ${hasAccess}`);

    return {
      app,
      customEvents: app.customEvents,
      shop,
      plan: currentPlan,
      isFreePlan,
      hasAccess,
      cached: false,
      cacheTimestamp: new Date().toISOString(),
    };
  });

  return Response.json(cachedData);
};
