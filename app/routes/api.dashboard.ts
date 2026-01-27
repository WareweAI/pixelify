import type { ActionFunctionArgs, LoaderFunctionArgs } from "react-router";
import { getShopifyInstance } from "../shopify.server";
import prisma, { withDatabaseRetry } from "../db.server";
import { generateRandomPassword } from "~/lib/crypto.server";
import { createAppWithSettings, renameApp, deleteAppWithData } from "~/services/app.service.server";
import { cache, generateCacheKey, withCache } from "~/lib/cache.server";

export const loader = async ({ request }: LoaderFunctionArgs) => {
  const shopify = getShopifyInstance();

  if (!shopify?.authenticate) {
    throw new Response("Shopify configuration not found", { status: 500 });
  }

  let session, admin;
  try {
    const authResult = await shopify.authenticate.admin(request);
    session = authResult.session;
    admin = authResult.admin;
  } catch (error) {
    if (error instanceof Response && error.status === 302) throw error;
    throw new Response("Unable to authenticate", { status: 503 });
  }

  const shop = session.shop;
  const url = new URL(request.url);
  const purchaseOffset = parseInt(url.searchParams.get('purchaseOffset') || '0');
  const purchaseLimit = 10;
  
  // Check if cache should be bypassed
  const bypassCache = url.searchParams.get('refresh') === 'true';

  // Generate cache key for this shop and pagination
  const cacheKey = generateCacheKey('dashboard', shop, purchaseOffset, purchaseLimit);

  // If bypassing cache, invalidate it first
  if (bypassCache) {
    cache.delete(cacheKey);
    console.log(`[Dashboard API] Cache bypassed for ${shop}`);
  }

  // Use cache with 5 minute TTL (300 seconds)
  return withCache(cacheKey, 300, async () => {
    console.log(`[Dashboard API] Fetching fresh data for ${shop}`);
    
    try {
      let user = await prisma.user.findUnique({ where: { storeUrl: shop } });

      if (!user) {
        user = await prisma.user.create({
          data: { storeUrl: shop, password: generateRandomPassword() },
        });
      }

      const sevenDaysAgo = new Date();
      sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);
      const today = new Date();
      today.setHours(0, 0, 0, 0);

      // Initialize store pages with system defaults
      let storePages = [
        { label: "All Pages", value: "all", type: "system" },
        { label: "Home Page", value: "/", type: "system" },
        { label: "Cart Page", value: "/cart", type: "system" },
        { label: "Checkout Page", value: "/checkout", type: "system" },
        { label: "Search Results", value: "/search", type: "system" },
        { label: "Account Page", value: "/account", type: "system" },
      ];

      // Fetch products and collections from Shopify GraphQL
      try {
        const [productsRes, collectionsRes] = await Promise.all([
          admin.graphql(`
            query {
              products(first: 250, query: "status:active") {
                edges {
                  node {
                    id
                    title
                    handle
                  }
                }
              }
            }
          `),
          admin.graphql(`
            query {
              collections(first: 50, sortKey: TITLE) {
                edges {
                  node {
                    id
                    title
                    handle
                  }
                }
              }
            }
          `)
        ]);

        const productsData = await productsRes.json();
        const collectionsData = await collectionsRes.json();

        const products = productsData.data?.products?.edges || [];
        const collections = collectionsData.data?.collections?.edges || [];

        console.log(`[Dashboard API] Fetched ${products.length} products and ${collections.length} collections`);

        // Add collection pages
        const collectionPages = collections.map((edge: any) => ({
          label: `Collection: ${edge.node.title}`,
          value: `/collections/${edge.node.handle}`,
          type: "collection",
          collectionId: edge.node.id,
        }));

        // Add product pages
        const productPages = products.map((edge: any) => ({
          label: `Product: ${edge.node.title}`,
          value: `/products/${edge.node.handle}`,
          type: "product",
          productId: edge.node.id,
        }));

        storePages = [...storePages, ...collectionPages, ...productPages];
        console.log(`[Dashboard API] Total pages: ${storePages.length}`);
      } catch (error) {
        console.error("[Dashboard API] Error fetching products/collections:", error);
      }

      // Run database queries in parallel with retry logic
      const [apps, totalPurchaseEvents, recentPurchaseEvents, todayEvents] = await withDatabaseRetry(async () => {
        return Promise.all([
          prisma.$queryRaw`
            SELECT
              a."id", a."appId", a."appToken", a."name", a."plan", a."welcomeEmailSent",
              a."enabled", a."shopEmail", a."createdAt", a."userId", a."websiteDomain",
              s."metaPixelId", s."metaPixelEnabled", s."timezone", s."metaAccessToken",
              COALESCE((SELECT COUNT(*)::int FROM "Event" e WHERE e."appId" = a."id"), 0) as "eventCount",
              COALESCE((SELECT COUNT(*)::int FROM "AnalyticsSession" ase WHERE ase."appId" = a."id"), 0) as "sessionCount"
            FROM "App" a
            LEFT JOIN "AppSettings" s ON s."appId" = a."id"
            WHERE a."userId" = ${user.id}
            ORDER BY a."createdAt" DESC
          `,
          prisma.event.count({
            where: { app: { userId: user.id }, eventName: "Purchase", createdAt: { gte: sevenDaysAgo } },
          }),
          prisma.event.findMany({
            where: { app: { userId: user.id }, eventName: "Purchase", createdAt: { gte: sevenDaysAgo } },
            orderBy: { createdAt: "desc" },
            take: purchaseLimit,
            skip: purchaseOffset,
            include: { app: { select: { name: true, appId: true } } },
          }),
          prisma.event.count({
            where: { app: { userId: user.id }, createdAt: { gte: today } },
          }),
        ]);
      });

      const transformedApps = (apps as any[]).map((app: any) => ({
        ...app,
        _count: { events: app.eventCount || 0, analyticsSessions: app.sessionCount || 0 },
        settings: { 
          metaPixelId: app.metaPixelId, 
          metaPixelEnabled: app.metaPixelEnabled || false, 
          timezone: app.timezone,
          metaAccessToken: app.metaAccessToken // Include for token check
        },
      }));

      const totalPixels = transformedApps.length;
      const totalEvents = transformedApps.reduce((sum: number, app: any) => sum + app._count.events, 0);
      const totalSessions = transformedApps.reduce((sum: number, app: any) => sum + app._count.analyticsSessions, 0);
      
      // Check if user has any Facebook tokens
      const hasValidFacebookToken = transformedApps.some((app: any) => 
        app.settings?.metaAccessToken && app.settings.metaAccessToken.length > 0
      );

      return {
        apps: transformedApps,
        hasPixels: transformedApps.length > 0,
        hasValidFacebookToken,
        stats: { totalPixels, totalEvents, totalSessions, todayEvents },
        recentPurchaseEvents: recentPurchaseEvents.map((e: any) => ({
          id: e.id,
          orderId: e.customData?.order_id || e.productId || '-',
          value: e.value || (typeof e.customData?.value === 'number' ? e.customData.value : parseFloat(e.customData?.value) || null),
          currency: e.currency || e.customData?.currency || 'USD',
          pixelId: e.app.appId,
          source: e.utmSource || '-',
          purchaseTime: e.createdAt,
        })),
        totalPurchaseEvents,
        purchaseOffset,
        purchaseLimit,
        storePages,
        cached: false, // Indicates this is fresh data
        cacheTimestamp: new Date().toISOString(),
      };
    } catch (error: any) {
      console.error("[Dashboard API] Error:", error);

      if (error.message?.includes('connection pool') || error.code === 'P2024') {
        return {
          apps: [],
          hasPixels: false,
          hasValidFacebookToken: false,
          stats: { totalPixels: 0, totalEvents: 0, totalSessions: 0, todayEvents: 0 },
          recentPurchaseEvents: [],
          totalPurchaseEvents: 0,
          purchaseOffset: 0,
          purchaseLimit: 10,
          storePages: [],
          connectionError: true,
        };
      }

      throw new Response("Database temporarily unavailable", { status: 503 });
    }
  });
};

export const action = async ({ request }: ActionFunctionArgs) => {
  const shopify = getShopifyInstance();

  if (!shopify?.authenticate) {
    throw new Response("Shopify configuration not found", { status: 500 });
  }

  const { session } = await shopify.authenticate.admin(request);
  const shop = session.shop;
  const formData = await request.formData();
  const intent = formData.get("intent") as string;

  const user = await prisma.user.findUnique({ where: { storeUrl: shop } });
  if (!user) {
    return { error: "User not found" };
  }

  // Helper function to invalidate dashboard cache for this shop
  const invalidateDashboardCache = () => {
    const invalidated = cache.invalidatePattern(`dashboard:${shop}:`);
    console.log(`[Dashboard API] Invalidated ${invalidated} cache entries for ${shop}`);
  };

  // Assign website domain to pixel
  if (intent === "assign-website") {
    const appId = formData.get("appId") as string;
    const websiteDomain = formData.get("websiteDomain") as string;

    if (!appId || !websiteDomain) {
      return { error: "App ID and website domain are required" };
    }

    const cleanDomain = websiteDomain
      .toLowerCase()
      .trim()
      .replace(/^https?:\/\//, '')
      .replace(/^www\./, '')
      .replace(/\/+$/, '');

    await prisma.app.update({
      where: { id: appId },
      data: { websiteDomain: cleanDomain }
    });

    // Invalidate cache after modification
    invalidateDashboardCache();

    return { success: true, message: `Website domain assigned successfully` };
  }

  // Create pixel (new flow)
  if (intent === "create-pixel") {
    const pixelName = formData.get("pixelName") as string;
    const pixelId = formData.get("pixelId") as string;
    const accessToken = formData.get("accessToken") as string;

    if (!pixelName || !pixelId || !accessToken) {
      return { error: "Pixel name, ID, and access token are required" };
    }

    // Check if pixel already exists
    const existingPixel = await prisma.appSettings.findFirst({
      where: { metaPixelId: pixelId, app: { userId: user.id } },
      include: { app: { select: { name: true } } }
    });

    if (existingPixel) {
      return { error: `Pixel already exists as "${existingPixel.app.name}"` };
    }

    // Validate pixel with Facebook
    const validateResponse = await fetch(`https://graph.facebook.com/v24.0/${pixelId}?access_token=${accessToken}`);
    const validateData = await validateResponse.json();

    if (validateData.error) {
      return { error: `Pixel validation failed: ${validateData.error.message}` };
    }

    // Create pixel
    const app = await prisma.app.create({
      data: {
        userId: user.id,
        name: pixelName,
        appId: `pixel_${Date.now()}`,
        appToken: `token_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`,
      },
    });

    await prisma.appSettings.create({
      data: {
        appId: app.id,
        metaPixelId: pixelId,
        metaAccessToken: accessToken,
        metaPixelEnabled: true,
        metaVerified: true,
        autoTrackPageviews: true,
        autoTrackClicks: true,
        recordIp: true,
        recordLocation: true,
        recordSession: true,
      },
    });

    // Invalidate cache after creating pixel
    invalidateDashboardCache();

    return { success: true, message: "Pixel created successfully", step: 2 };
  }

  // Validate pixel
  if (intent === "validate-pixel") {
    const pixelId = formData.get("pixelId") as string;
    const accessToken = formData.get("accessToken") as string;

    if (!pixelId || !accessToken) {
      return { error: "Pixel ID and access token are required" };
    }

    const response = await fetch(`https://graph.facebook.com/v24.0/${pixelId}?access_token=${accessToken}`);
    const data = await response.json();

    if (data.error) {
      return { error: `Validation failed: ${data.error.message}` };
    }

    return { success: true, message: `✅ Pixel validated: ${data.name || 'Unknown'}` };
  }

  // Rename pixel
  if (intent === "rename") {
    const appId = formData.get("appId") as string;
    const newName = formData.get("newName") as string;

    if (!newName) {
      return { error: "Name is required" };
    }

    await renameApp(appId, newName);
    
    // Invalidate cache after rename
    invalidateDashboardCache();
    
    return { success: true, intent: "rename" };
  }

  // Delete pixel
  if (intent === "delete") {
    const appId = formData.get("appId") as string;
    await deleteAppWithData(appId);
    
    // Invalidate cache after delete
    invalidateDashboardCache();
    
    return { success: true, intent: "delete" };
  }

  // Save timezone
  if (intent === "save-timezone") {
    const appId = formData.get("appId") as string;
    const timezone = formData.get("timezone") as string;

    if (!appId || !timezone) {
      return { error: "App ID and timezone are required" };
    }

    await prisma.appSettings.updateMany({
      where: { app: { id: appId, userId: user.id } },
      data: { timezone }
    });

    // Invalidate cache after timezone update
    invalidateDashboardCache();

    return { success: true, message: "Timezone saved successfully", step: 3 };
  }

  // Toggle pixel enabled/disabled
  if (intent === "toggle-pixel") {
    const appId = formData.get("appId") as string;
    const enabled = formData.get("enabled") === "true";

    if (!appId) {
      return { error: "App ID is required" };
    }

    await prisma.app.update({
      where: { id: appId, userId: user.id },
      data: { enabled }
    });

    // Invalidate cache after toggle
    invalidateDashboardCache();

    return { success: true, message: `Pixel ${enabled ? 'enabled' : 'disabled'}` };
  }

  // Save Facebook token
  if (intent === "save-facebook-token") {
    const accessToken = formData.get("accessToken") as string;

    if (!accessToken) {
      return { error: "Access token is required" };
    }

    const apps = await prisma.app.findMany({
      where: { userId: user.id },
      include: { settings: true },
    });

    for (const app of apps) {
      if (app.settings) {
        await prisma.appSettings.update({
          where: { id: app.settings.id },
          data: { metaAccessToken: accessToken, metaTokenExpiresAt: null },
        });
      } else {
        await prisma.appSettings.create({
          data: { appId: app.id, metaAccessToken: accessToken },
        });
      }
    }

    // Invalidate cache after token update
    invalidateDashboardCache();

    return { success: true, message: "Token saved", intent: "save-facebook-token" };
  }

  // Fetch Facebook pixels
  if (intent === "fetch-facebook-pixels") {
    const accessToken = formData.get("accessToken") as string;

    if (!accessToken) {
      return { error: "Access token is required" };
    }

    const adAccountsResponse = await fetch(
      `https://graph.facebook.com/v24.0/me/adaccounts?fields=id,name,business&access_token=${accessToken}`
    );
    const adAccountsData = await adAccountsResponse.json();

    if (adAccountsData.error) {
      return { error: "Failed to access Facebook ad accounts" };
    }

    let businessId: string | null = null;
    let businessName: string | null = null;
    const adAccounts = adAccountsData.data || [];

    const accountWithBusiness = adAccounts.find((acc: any) => acc.business?.id);
    if (accountWithBusiness) {
      businessId = accountWithBusiness.business.id;
      businessName = accountWithBusiness.business.name || "Business Manager";
    }

    const pixels: Array<{ id: string; name: string; accountName: string }> = [];

    if (businessId) {
      const pixelsResponse = await fetch(
        `https://graph.facebook.com/v24.0/${businessId}/adspixels?fields=id,name&access_token=${accessToken}`
      );
      const pixelsData = await pixelsResponse.json();

      if (pixelsData.data) {
        pixelsData.data.forEach((pixel: any) => {
          pixels.push({
            id: pixel.id,
            name: pixel.name,
            accountName: businessName || "Business Manager",
          });
        });
      }
    }

    if (pixels.length === 0) {
      return { error: "No pixels found. Create pixels in Facebook Events Manager." };
    }

    return { success: true, facebookPixels: pixels };
  }

  return { error: "Invalid action" };
};
