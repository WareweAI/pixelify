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
    
    // ALWAYS fetch theme extension status from Shopify (independent of database)
    let themeExtensionEnabled = false;
    try {
      console.log('[Dashboard API] Fetching theme status from Shopify...');
      
      const appInstallationRes = await admin.graphql(`
        query {
          currentAppInstallation {
            id
            activeSubscriptions {
              id
              status
            }
          }
        }
      `);

      const appInstallationData = await appInstallationRes.json() as { data?: any; errors?: any[] };

      // Check for GraphQL errors
      if (appInstallationData.errors) {
        console.error('[Dashboard API] App installation GraphQL errors:', appInstallationData.errors);
      }

      const appInstallation = appInstallationData.data?.currentAppInstallation;

      // For now, we'll check if the app is installed
      // Note: Shopify doesn't provide a direct way to check if app embed is enabled via GraphQL
      // This is a limitation of the Shopify API - we can only check if the app is installed
      themeExtensionEnabled = !!appInstallation;

      console.log(`[Dashboard API] Theme Extension Status: ${themeExtensionEnabled ? 'Enabled' : 'Not Enabled'} (App Installed: ${!!appInstallation})`);
    } catch (error: any) {
      console.error("[Dashboard API] ❌ Error fetching theme status:", error.message || error);
    }
    
    // Now try database queries - if they fail, still return storePages
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

      // Run database queries in parallel with retry logic
      const [apps, totalPurchaseEvents, recentPurchaseEvents, todayEvents] = await withDatabaseRetry(async () => {
        return Promise.all([
          prisma.$queryRaw`
            SELECT
              a."id", a."appId", a."appToken", a."name", a."plan", a."welcomeEmailSent",
              a."enabled", a."shopEmail", a."createdAt", a."userId", a."websiteDomain",
              s."metaPixelId", s."metaPixelEnabled", s."timezone", s."metaAccessToken", s."metaTokenExpiresAt",
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
          metaAccessToken: app.metaAccessToken, // Include for token check
          metaTokenExpiresAt: app.metaTokenExpiresAt // Include token expiry
        },
      }));

      const totalPixels = transformedApps.length;
      const totalEvents = transformedApps.reduce((sum: number, app: any) => sum + app._count.events, 0);
      const totalSessions = transformedApps.reduce((sum: number, app: any) => sum + app._count.analyticsSessions, 0);
      
      // Check if user has any Facebook tokens and if they're valid
      let hasValidFacebookToken = false;
      let hasExpiredTokens = false;
      
      for (const app of transformedApps) {
        if (app.settings?.metaAccessToken && app.settings.metaAccessToken.length > 0) {
          // Check if token is expired
          const expiresAt = app.settings.metaTokenExpiresAt;
          const now = new Date();
          
          if (expiresAt && now > new Date(expiresAt)) {
            hasExpiredTokens = true;
          } else {
            hasValidFacebookToken = true;
          }
        }
      }
      
      // If we only have expired tokens, mark as no valid token
      if (hasExpiredTokens && !hasValidFacebookToken) {
        hasValidFacebookToken = false;
      }

      return {
        apps: transformedApps,
        hasPixels: transformedApps.length > 0,
        hasValidFacebookToken,
        themeExtensionEnabled,
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
          themeExtensionEnabled: false,
          stats: { totalPixels: 0, totalEvents: 0, totalSessions: 0, todayEvents: 0 },
          recentPurchaseEvents: [],
          totalPurchaseEvents: 0,
          purchaseOffset: 0,
          purchaseLimit: 10,
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

  console.log('[Dashboard API] 🔍 Action request received');
  console.log('[Dashboard API] Intent:', intent);
  console.log('[Dashboard API] Form data keys:', Array.from(formData.keys()));
  console.log('[Dashboard API] Request method:', request.method);
  console.log('[Dashboard API] Request URL:', request.url);

  const user = await prisma.user.findUnique({ where: { storeUrl: shop } });
  if (!user) {
    console.error('[Dashboard API] ❌ User not found for shop:', shop);
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
    const trackingPages = formData.get("trackingPages") as string || "all";
    const selectedPages = formData.get("selectedPages") as string || "[]";

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
        trackingPages,
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

    try {
      console.log('[Dashboard API] 🔍 Validating pixel in real-time:', pixelId);
      
      const response = await fetch(
        `https://graph.facebook.com/v24.0/${pixelId}?access_token=${accessToken}`,
        {
          method: 'GET',
          headers: {
            'Accept': 'application/json'
          }
        }
      );
      const data = await response.json();

      if (data.error) {
        console.error('[Dashboard API] ❌ Pixel validation failed:', data.error);
        return { error: `Validation failed: ${data.error.message}` };
      }

      console.log('[Dashboard API] ✅ Pixel validated successfully:', data.name || 'Unknown');
      return { 
        success: true, 
        message: `✅ Pixel validated: ${data.name || 'Unknown'}`,
        pixelName: data.name || 'Unknown',
        intent: "validate-pixel",
        realTimeData: true // Flag to indicate this is real-time validation from Facebook API
      };
    } catch (error) {
      console.error('[Dashboard API] ❌ Exception during pixel validation:', error);
      return { 
        error: `Validation failed: ${error instanceof Error ? error.message : 'Unknown error'}` 
      };
    }
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

    console.log('[Dashboard API] 🔄 save-facebook-token request received');
    console.log('[Dashboard API] Access token provided:', !!accessToken);
    console.log('[Dashboard API] Access token length:', accessToken?.length || 0);
    console.log('[Dashboard API] User ID:', user.id);
    console.log('[Dashboard API] Shop:', shop);

    if (!accessToken) {
      console.error('[Dashboard API] ❌ No access token provided');
      return { 
        success: false,
        error: "Access token is required", 
        intent: "save-facebook-token" 
      };
    }

    try {
      // Exchange short-lived token for long-lived token (60 days)
      const appId = process.env.FACEBOOK_APP_ID;
      const appSecret = process.env.FACEBOOK_APP_SECRET;

      console.log('[Dashboard API] Facebook app credentials check:');
      console.log('[Dashboard API] - App ID configured:', !!appId);
      console.log('[Dashboard API] - App Secret configured:', !!appSecret);

      if (!appId || !appSecret) {
        console.error('[Dashboard API] ❌ Facebook app credentials not configured');
        return { 
          success: false,
          error: "Facebook app credentials not configured", 
          intent: "save-facebook-token" 
        };
      }

      console.log('[Dashboard API] Exchanging token for long-lived token...');
      const exchangeResponse = await fetch(
        `https://graph.facebook.com/v18.0/oauth/access_token?grant_type=fb_exchange_token&client_id=${appId}&client_secret=${appSecret}&fb_exchange_token=${accessToken}`,
        {
          method: 'GET',
          headers: {
            'Accept': 'application/json'
          }
        }
      );

      if (!exchangeResponse.ok) {
        console.error('[Dashboard API] Token exchange failed:', exchangeResponse.status);
        return { error: `Token exchange failed: ${exchangeResponse.status}`, intent: "save-facebook-token" };
      }

      const exchangeData = await exchangeResponse.json();

      if (exchangeData.error) {
        console.error('[Dashboard API] Token exchange error:', exchangeData.error);
        return { error: `Failed to exchange token: ${exchangeData.error.message}`, intent: "save-facebook-token" };
      }

      const longLivedToken = exchangeData.access_token || accessToken;
      console.log('[Dashboard API] Long-lived token obtained:', !!longLivedToken);

      // Get token expiry info
      console.log('[Dashboard API] Getting token expiry info...');
      const debugResponse = await fetch(
        `https://graph.facebook.com/v18.0/debug_token?input_token=${longLivedToken}&access_token=${longLivedToken}`,
        {
          method: 'GET',
          headers: {
            'Accept': 'application/json'
          }
        }
      );

      let expiresAt = new Date(Date.now() + 60 * 24 * 60 * 60 * 1000); // Default to 60 days

      if (debugResponse.ok) {
        const debugData = await debugResponse.json();
        if (debugData.data?.expires_at) {
          expiresAt = new Date(debugData.data.expires_at * 1000);
        }
      }

      console.log('[Dashboard API] Token expires at:', expiresAt.toISOString());

      // Use database retry wrapper for all database operations
      console.log('[Dashboard API] Starting database operations...');
      const result = await withDatabaseRetry(async () => {
        // Get all user's apps
        console.log('[Dashboard API] Fetching user apps...');
        let apps = await prisma.app.findMany({
          where: { userId: user.id },
          include: { settings: true },
        });

        console.log('[Dashboard API] Found', apps.length, 'apps for user');

        // If no apps exist, create a default app to store the token
        if (apps.length === 0) {
          console.log('[Dashboard API] No apps found, creating default app...');
          const defaultApp = await prisma.app.create({
            data: {
              userId: user.id,
              name: "Facebook Integration",
              appId: `fb_integration_${Date.now()}`,
              appToken: `token_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`,
            },
          });
          
          await prisma.appSettings.create({
            data: { 
              appId: defaultApp.id, 
              metaAccessToken: longLivedToken,
              metaTokenExpiresAt: expiresAt,
            },
          });
          
          console.log('[Dashboard API] Created default app with token:', defaultApp.name);
          
          // Refresh apps list
          apps = await prisma.app.findMany({
            where: { userId: user.id },
            include: { settings: true },
          });
        }

        // Update ALL apps with the new token
        let updatedCount = 0;
        let createdCount = 0;

        console.log('[Dashboard API] Updating tokens for all apps...');
        for (const app of apps) {
          if (app.settings) {
            await prisma.appSettings.update({
              where: { id: app.settings.id },
              data: { 
                metaAccessToken: longLivedToken,
                metaTokenExpiresAt: expiresAt,
              },
            });
            updatedCount++;
            console.log('[Dashboard API] Updated token for app:', app.name);
          } else {
            await prisma.appSettings.create({
              data: { 
                appId: app.id, 
                metaAccessToken: longLivedToken,
                metaTokenExpiresAt: expiresAt,
              },
            });
            createdCount++;
            console.log('[Dashboard API] Created settings with token for app:', app.name);
          }
        }

        // Verify the token was saved
        console.log('[Dashboard API] Verifying token was saved...');
        const verifyApps = await prisma.app.findMany({
          where: { userId: user.id },
          include: { settings: true },
        });

        const appsWithToken = verifyApps.filter(app => 
          app.settings?.metaAccessToken && 
          app.settings.metaAccessToken === longLivedToken
        );

        console.log('[Dashboard API] Verification: Found', appsWithToken.length, 'apps with the new token out of', verifyApps.length, 'total apps');

        if (appsWithToken.length === 0) {
          throw new Error("Token was not saved to any app - verification failed");
        }

        return {
          updatedCount,
          createdCount,
          verifiedApps: appsWithToken.length,
          totalApps: verifyApps.length
        };
      }, 3); // Retry up to 3 times

      // IMPORTANT: Clear all caches after token save to ensure real-time data
      console.log('[Dashboard API] Clearing all caches for real-time data...');
      invalidateDashboardCache();
      cache.invalidatePattern(`catalog-data:${shop}:`);
      cache.invalidatePattern(`settings:${shop}:`);
      cache.invalidatePattern(`app-settings:${shop}:`);
      cache.invalidatePattern(`facebook:${shop}:`);
      cache.invalidatePattern(`pixels:${shop}:`);
      
      console.log('[Dashboard API] ✅ Facebook token saved successfully!');
      return { 
        success: true, 
        message: `Facebook token saved successfully! Updated ${result.updatedCount} apps, created ${result.createdCount} settings.`, 
        expiresAt: expiresAt.toISOString(),
        updatedApps: result.updatedCount,
        createdSettings: result.createdCount,
        intent: "save-facebook-token",
        realTimeUpdate: true, // Flag to indicate this should trigger real-time refresh
        saveToLocalStorage: {
          accessToken: longLivedToken,
          expiresAt: expiresAt.toISOString()
        } // Data to save in localStorage
      };
    } catch (error) {
      console.error('[Dashboard API] Error saving Facebook token:', error);
      
      // Check if it's a database connection error
      if (error instanceof Error && (
        error.message.includes('Max client connections reached') ||
        error.message.includes('connection') ||
        error.message.includes('timeout')
      )) {
        console.error('[Dashboard API] Database connection issue detected');
        return { 
          error: "Database connection issue. Please try again in a moment.",
          intent: "save-facebook-token"
        };
      }
      
      return { 
        error: `Failed to save Facebook token: ${error instanceof Error ? error.message : 'Unknown error'}`,
        intent: "save-facebook-token"
      };
    }
  }

  // Test Facebook API access
  if (intent === "test-facebook-api") {
    const accessToken = formData.get("accessToken") as string;

    console.log('[Dashboard API] 🧪 Testing Facebook API access...');
    console.log('[Dashboard API] Access token provided:', !!accessToken);

    if (!accessToken) {
      return { 
        success: false,
        error: "Access token is required for testing",
        intent: "test-facebook-api"
      };
    }

    try {
      // Test 1: Get user info
      console.log('[Dashboard API] Test 1: Fetching user info...');
      const userResponse = await fetch(
        `https://graph.facebook.com/v24.0/me?fields=id,name&access_token=${accessToken}`,
        {
          method: 'GET',
          headers: { 'Accept': 'application/json' }
        }
      );
      
      const userData = await userResponse.json();
      console.log('[Dashboard API] User response:', userData);

      if (userData.error) {
        return {
          success: false,
          error: `Facebook API Error: ${userData.error.message}`,
          intent: "test-facebook-api",
          testResults: {
            userTest: { success: false, error: userData.error }
          }
        };
      }

      // Test 2: Get businesses
      console.log('[Dashboard API] Test 2: Fetching businesses...');
      const businessResponse = await fetch(
        `https://graph.facebook.com/v24.0/me/businesses?access_token=${accessToken}`,
        {
          method: 'GET',
          headers: { 'Accept': 'application/json' }
        }
      );
      
      const businessData = await businessResponse.json();
      console.log('[Dashboard API] Business response:', businessData);

      // Test 3: Get pixels from businesses (correct approach)
      console.log('[Dashboard API] Test 3: Fetching pixels from businesses...');
      let pixelTestResult: { success: boolean; data: any[]; error: any } = { success: false, data: [], error: null };
      
      if (businessData.data && businessData.data.length > 0) {
        const allPixels: Array<{
          id: string;
          name: string;
          businessName: string;
          businessId: string;
        }> = [];
        
        for (const business of businessData.data) {
          try {
            console.log(`[Dashboard API] Fetching pixels from business: ${business.name} (${business.id})`);
            const pixelResponse = await fetch(
              `https://graph.facebook.com/v24.0/${business.id}/adspixels?fields=id,name&access_token=${accessToken}`,
              {
                method: 'GET',
                headers: { 'Accept': 'application/json' }
              }
            );
            
            const pixelData = await pixelResponse.json();
            console.log(`[Dashboard API] Pixels from ${business.name}:`, pixelData);
            
            if (pixelData.data && pixelData.data.length > 0) {
              pixelData.data.forEach((pixel: any) => {
                allPixels.push({
                  id: pixel.id,
                  name: pixel.name,
                  businessName: business.name,
                  businessId: business.id
                });
              });
            }
          } catch (businessPixelError) {
            console.error(`[Dashboard API] Error fetching pixels from business ${business.name}:`, businessPixelError);
          }
        }
        
        pixelTestResult = {
          success: true,
          data: allPixels,
          error: null
        };
      } else {
        pixelTestResult = {
          success: false,
          data: [],
          error: { message: "No businesses found to fetch pixels from" }
        };
      }

      return {
        success: true,
        message: "Facebook API tests completed",
        intent: "test-facebook-api",
        testResults: {
          userTest: { 
            success: true, 
            data: { id: userData.id, name: userData.name } 
          },
          businessTest: { 
            success: !businessData.error, 
            data: businessData.data || [], 
            error: businessData.error 
          },
          pixelTest: { 
            success: pixelTestResult.success, 
            data: pixelTestResult.data, 
            error: pixelTestResult.error 
          }
        }
      };

    } catch (error) {
      console.error('[Dashboard API] ❌ Facebook API test failed:', error);
      return {
        success: false,
        error: `Test failed: ${error instanceof Error ? error.message : 'Unknown error'}`,
        intent: "test-facebook-api"
      };
    }
  }

  // Fetch Facebook pixels
  if (intent === "fetch-facebook-pixels") {
    const accessToken = formData.get("accessToken") as string;

    console.log('[Dashboard API] 🔍 fetch-facebook-pixels request received');
    console.log('[Dashboard API] Access token provided:', !!accessToken);
    console.log('[Dashboard API] Access token length:', accessToken?.length || 0);
    console.log('[Dashboard API] Access token (first 20 chars):', accessToken?.substring(0, 20) + '...');

    if (!accessToken) {
      console.error('[Dashboard API] ❌ No access token provided');
      return { 
        success: false,
        error: "Access token is required",
        intent: "fetch-facebook-pixels",
        facebookPixels: [],
        debugInfo: {
          errorType: 'missing_token',
          message: 'No access token provided in request'
        }
      };
    }

    try {
      // Step 1: Get businesses (me is resolved from access token)
      console.log('[Dashboard API] 📡 Fetching businesses from /me/businesses...');
      const businessesResponse = await fetch(
        `https://graph.facebook.com/v24.0/me/businesses?access_token=${accessToken}`,
        {
          method: 'GET',
          headers: {
            'Accept': 'application/json'
          }
        }
      );
      
      console.log('[Dashboard API] Businesses response status:', businessesResponse.status);
      console.log('[Dashboard API] Businesses response headers:', Object.fromEntries(businessesResponse.headers.entries()));
      
      const businessesData = await businessesResponse.json();
      console.log('[Dashboard API] 📊 FULL Businesses response:', JSON.stringify(businessesData, null, 2));

      if (businessesData.error) {
        console.error('[Dashboard API] ❌ Facebook API error (businesses):', businessesData.error);
        return { 
          success: false,
          error: "Failed to fetch businesses: " + businessesData.error.message,
          intent: "fetch-facebook-pixels",
          facebookPixels: [],
          debugInfo: {
            errorCode: businessesData.error.code,
            errorType: businessesData.error.type,
            errorSubcode: businessesData.error.error_subcode,
            fullError: businessesData.error
          }
        };
      }

      const businesses = businessesData.data || [];
      console.log('[Dashboard API] 📈 Found', businesses.length, 'business(es)');
      
      if (businesses.length > 0) {
        businesses.forEach((business: any, index: number) => {
          console.log(`[Dashboard API] Business ${index + 1}:`, {
            id: business.id,
            name: business.name,
            verification_status: business.verification_status,
            permitted_tasks: business.permitted_tasks
          });
        });
      }

      if (businesses.length === 0) {
        console.warn('[Dashboard API] ⚠️ No businesses found for this user');
        
        // Try alternative approach: fetch pixels from user's businesses using user ID
        console.log('[Dashboard API] 🔄 Trying alternative approach: fetch pixels via user businesses...');
        try {
          // First get user ID
          const userResponse = await fetch(
            `https://graph.facebook.com/v24.0/me?fields=id&access_token=${accessToken}`,
            {
              method: 'GET',
              headers: { 'Accept': 'application/json' }
            }
          );
          
          const userData = await userResponse.json();
          console.log('[Dashboard API] User data for alternative approach:', userData);
          
          if (userData.id) {
            // Get businesses using user ID
            const userBusinessesResponse = await fetch(
              `https://graph.facebook.com/v24.0/${userData.id}/businesses?access_token=${accessToken}`,
              {
                method: 'GET',
                headers: { 'Accept': 'application/json' }
              }
            );
            
            const userBusinessesData = await userBusinessesResponse.json();
            console.log('[Dashboard API] User businesses data:', userBusinessesData);
            
            if (userBusinessesData.data && userBusinessesData.data.length > 0) {
              const alternativePixels: { id: any; name: any; accountName: any; }[] = [];
              
              for (const business of userBusinessesData.data) {
                try {
                  console.log(`[Dashboard API] Fetching pixels from user business: ${business.name} (${business.id})`);
                  const businessPixelsResponse = await fetch(
                    `https://graph.facebook.com/v24.0/${business.id}/adspixels?fields=id,name&access_token=${accessToken}`,
                    {
                      method: 'GET',
                      headers: { 'Accept': 'application/json' }
                    }
                  );
                  
                  const businessPixelsData = await businessPixelsResponse.json();
                  console.log(`[Dashboard API] Business pixels from ${business.name}:`, businessPixelsData);
                  
                  if (businessPixelsData.data && businessPixelsData.data.length > 0) {
                    businessPixelsData.data.forEach((pixel: any) => {
                      alternativePixels.push({
                        id: pixel.id,
                        name: pixel.name,
                        accountName: business.name
                      });
                    });
                  }
                } catch (businessError) {
                  console.error(`[Dashboard API] Error fetching pixels from user business ${business.name}:`, businessError);
                }
              }
              
              if (alternativePixels.length > 0) {
                console.log('[Dashboard API] ✅ Found', alternativePixels.length, 'pixel(s) via user businesses');
                return { 
                  success: true, 
                  facebookPixels: alternativePixels,
                  intent: "fetch-facebook-pixels",
                  realTimeData: true,
                  debugInfo: {
                    method: "user_businesses",
                    businessCount: userBusinessesData.data.length,
                    pixelCount: alternativePixels.length,
                    accessMethod: `${userData.id}/businesses -> {business_id}/adspixels`
                  }
                };
              }
            }
          }
        } catch (alternativeError) {
          console.error('[Dashboard API] ❌ Alternative approach failed:', alternativeError);
        }
        
        return { 
          success: false,
          error: "No businesses found and direct pixel access failed. Please ensure you have admin access to a Facebook Business Manager or create pixels in Facebook Events Manager.",
          intent: "fetch-facebook-pixels",
          facebookPixels: [],
          debugInfo: {
            businessCount: 0,
            hasBusinessManagerAccess: false,
            suggestedAction: "Create a Business Manager account or get admin access to an existing one",
            directAccessAttempted: true,
            directAccessFailed: true
          }
        };
      }

      // Step 2: Fetch pixels from each business
      const allPixels: Array<{ id: string; name: string; accountName: string }> = [];
      const businessResults: any[] = [];

      for (const business of businesses) {
        const businessId = business.id;
        const businessName = business.name || "Business Manager";
        
        console.log('[Dashboard API] 📡 Fetching pixels from business:', businessName, '(ID:', businessId, ')');
        
        try {
          const pixelsResponse = await fetch(
            `https://graph.facebook.com/v24.0/${businessId}/adspixels?fields=id,name&access_token=${accessToken}`,
            {
              method: 'GET',
              headers: {
                'Accept': 'application/json'
              }
            }
          );
          
          console.log('[Dashboard API] Pixels response status for', businessName, ':', pixelsResponse.status);
          console.log('[Dashboard API] Pixels response headers for', businessName, ':', Object.fromEntries(pixelsResponse.headers.entries()));
          
          const pixelsData = await pixelsResponse.json();
          console.log('[Dashboard API] 📊 FULL Pixels response for', businessName, ':', JSON.stringify(pixelsData, null, 2));

          const businessResult = {
            businessId,
            businessName,
            status: pixelsResponse.status,
            pixelCount: 0,
            error: null
          };

          if (pixelsData.error) {
            console.error('[Dashboard API] ❌ Error fetching pixels from', businessName, ':', pixelsData.error);
            businessResult.error = pixelsData.error;
            businessResults.push(businessResult);
            // Continue to next business instead of failing completely
            continue;
          }

          if (pixelsData.data && pixelsData.data.length > 0) {
            console.log('[Dashboard API] 🎯 Found', pixelsData.data.length, 'pixel(s) in', businessName);
            businessResult.pixelCount = pixelsData.data.length;
            
            pixelsData.data.forEach((pixel: any, index: number) => {
              console.log(`[Dashboard API] Pixel ${index + 1} in ${businessName}:`, {
                id: pixel.id,
                name: pixel.name,
                business: businessName
              });
              
              allPixels.push({
                id: pixel.id,
                name: pixel.name,
                accountName: businessName,
              });
            });
          } else {
            console.warn('[Dashboard API] ⚠️ No pixels found in', businessName);
            console.log('[Dashboard API] Pixels data structure:', pixelsData);
          }
          
          businessResults.push(businessResult);
        } catch (businessError) {
          console.error('[Dashboard API] ❌ Exception fetching pixels from', businessName, ':', businessError);
          businessResults.push({
            businessId,
            businessName,
            status: 'exception',
            pixelCount: 0,
            error: businessError instanceof Error ? businessError.message : 'Unknown error'
          });
        }
      }

      console.log('[Dashboard API] 📊 SUMMARY:');
      console.log('[Dashboard API] Total businesses checked:', businesses.length);
      console.log('[Dashboard API] Total pixels found across all businesses:', allPixels.length);
      console.log('[Dashboard API] Business results:', businessResults);

      if (allPixels.length === 0) {
        console.warn('[Dashboard API] ⚠️ No pixels found in any business');
        return { 
          success: false,
          error: "No pixels found in any of your businesses. Create pixels in Facebook Events Manager.",
          intent: "fetch-facebook-pixels",
          facebookPixels: [],
          debugInfo: {
            businessCount: businesses.length,
            businessResults,
            suggestedAction: "Go to Facebook Events Manager and create a pixel, or check your Business Manager permissions",
            method: "business_manager_complete_but_empty"
          }
        };
      }

      console.log('[Dashboard API] ✅ SUCCESS: Returning', allPixels.length, 'pixel(s)');
      allPixels.forEach((pixel, index) => {
        console.log(`[Dashboard API] Final Pixel ${index + 1}:`, pixel);
      });
      
      return { 
        success: true, 
        facebookPixels: allPixels,
        intent: "fetch-facebook-pixels",
        realTimeData: true,
        debugInfo: {
          method: "business_manager",
          businessCount: businesses.length,
          pixelCount: allPixels.length,
          businessResults
        }
      };
      
    } catch (error) {
      console.error('[Dashboard API] ❌ Exception while fetching pixels:', error);
      return { 
        success: false,
        error: `Failed to fetch pixels: ${error instanceof Error ? error.message : 'Unknown error'}`,
        intent: "fetch-facebook-pixels",
        facebookPixels: [],
        debugInfo: {
          errorType: 'exception',
          errorMessage: error instanceof Error ? error.message : 'Unknown error',
          errorStack: error instanceof Error ? error.stack : undefined
        }
      };
    }
  }

  // Refresh Facebook access tokens
  if (intent === "refresh-facebook-token") {
    try {
      const { refreshAllUserTokens } = await import("~/services/facebook-token-refresh.server");
      const refreshedCount = await refreshAllUserTokens(user.id);
      
      if (refreshedCount > 0) {
        // Clear all caches after token refresh to ensure real-time data
        invalidateDashboardCache();
        cache.invalidatePattern(`catalog-data:${shop}:`);
        cache.invalidatePattern(`settings:${shop}:`);
        cache.invalidatePattern(`app-settings:${shop}:`);
        cache.invalidatePattern(`facebook:${shop}:`);
        cache.invalidatePattern(`pixels:${shop}:`);
        
        return { 
          success: true, 
          message: `Successfully refreshed ${refreshedCount} token(s)`,
          intent: "refresh-facebook-token",
          realTimeUpdate: true // Flag to trigger real-time refresh
        };
      } else {
        return { 
          error: "No tokens were refreshed. You may need to reconnect Facebook.",
          intent: "refresh-facebook-token"
        };
      }
    } catch (error) {
      console.error("Error refreshing Facebook tokens:", error);
      return { error: "Failed to refresh tokens. Please reconnect Facebook." };
    }
  }

  // Disconnect Facebook (remove tokens from database) - ENHANCED
  if (intent === "disconnect-facebook") {
    try {
      console.log('[Dashboard API] Disconnecting Facebook for user:', user.id);
      
      // Step 1: Remove Facebook tokens from all user's apps
      const apps = await prisma.app.findMany({
        where: { userId: user.id },
        include: { settings: true },
      });

      for (const app of apps) {
        if (app.settings) {
          await prisma.appSettings.update({
            where: { id: app.settings.id },
            data: { 
              // Clear ONLY authentication tokens
              metaAccessToken: null,
              metaTokenExpiresAt: null,
              metaVerified: false,
              
              // PRESERVE Facebook business data - these should NOT be cleared
              // metaPixelId: KEEP - this is the user's pixel ID
              // metaCatalogId: KEEP - this is the user's catalog ID  
              // metaBusinessId: KEEP - this is the user's business ID
              // metaAdAccountId: KEEP - this is the user's ad account ID
              // metaPixelEnabled: KEEP - this is user's preference setting
            },
          });
          console.log(`[Dashboard API] Removed Facebook authentication tokens from app: ${app.name}`);
          console.log(`[Dashboard API] Preserved Facebook business data (pixel ID, catalog ID, etc.) for app: ${app.name}`);
        }
      }

      // Step 2: Clear Facebook user ID from user record
      await prisma.user.update({
        where: { id: user.id },
        data: { 
          facebookUserId: null,
          // Clear any other Facebook-related fields
        }
      });
      console.log('[Dashboard API] Cleared Facebook user ID from user record');

      // Step 3: Invalidate ALL caches related to this shop (comprehensive cleanup)
      invalidateDashboardCache();
      cache.invalidatePattern(`catalog:${shop}:`);
      cache.invalidatePattern(`settings:${shop}:`);
      cache.invalidatePattern(`app-settings:${shop}:`);
      cache.invalidatePattern(`facebook:${shop}:`);
      cache.invalidatePattern(`pixels:${shop}:`);
      console.log('[Dashboard API] Cleared all Facebook-related caches');

      // Step 4: Return success with instruction to clear client-side storage
      return { 
        success: true, 
        message: "Facebook authentication disconnected. Your pixel and catalog configurations are preserved.",
        intent: "disconnect-facebook",
        clearClientStorage: true, // Signal to client to clear localStorage
        realTimeUpdate: true, // Flag to trigger real-time refresh
      };
    } catch (error) {
      console.error("Error disconnecting Facebook:", error);
      return { 
        error: "Failed to disconnect Facebook. Please try again.",
        intent: "disconnect-facebook",
        success: false,
      };
    }
  }

  // Clean up expired Facebook tokens
  if (intent === "cleanup-expired-tokens") {
    try {
      console.log('[Dashboard API] Cleaning up expired Facebook tokens...');
      
      const apps = await prisma.app.findMany({
        where: { userId: user.id },
        include: { settings: true },
      });

      let cleanedCount = 0;
      for (const app of apps) {
        if (app.settings?.metaAccessToken && app.settings.metaTokenExpiresAt) {
          const now = new Date();
          const expiresAt = new Date(app.settings.metaTokenExpiresAt);
          
          if (now > expiresAt) {
            console.log(`[Dashboard API] Cleaning up expired token for app: ${app.name}`);
            await prisma.appSettings.update({
              where: { id: app.settings.id },
              data: { 
                metaAccessToken: null,
                metaTokenExpiresAt: null,
              },
            });
            cleanedCount++;
          }
        }
      }

      // Invalidate caches after cleanup
      invalidateDashboardCache();
      cache.invalidatePattern(`catalog:${shop}:`);
      cache.invalidatePattern(`settings:${shop}:`);
      cache.invalidatePattern(`app-settings:${shop}:`);
      
      console.log(`[Dashboard API] ✅ Cleaned up ${cleanedCount} expired tokens`);
      
      return { 
        success: true, 
        message: `Cleaned up ${cleanedCount} expired Facebook token(s).`,
        cleanedCount,
        intent: "cleanup-expired-tokens"
      };
    } catch (error) {
      console.error("Error cleaning up expired tokens:", error);
      return { error: "Failed to clean up expired tokens" };
    }
  }

  // Clear all cache for this shop
  if (intent === "clear-cache") {
    try {
      console.log('[Dashboard API] Clearing all cache for shop:', shop);
      
      // Clear all cache patterns for this shop
      const patterns = [
        `dashboard:${shop}:`,
        `catalog:${shop}:`,
        `settings:${shop}:`,
        `app-settings:${shop}:`,
        `facebook:${shop}:`,
        `pixels:${shop}:`,
        `analytics:${shop}:`,
        `events:${shop}:`,
        `sessions:${shop}:`,
      ];

      let totalCleared = 0;
      for (const pattern of patterns) {
        const cleared = cache.invalidatePattern(pattern);
        totalCleared += cleared;
      }

      console.log(`[Dashboard API] ✅ Cleared ${totalCleared} cache entries for ${shop}`);
      
      return { 
        success: true, 
        message: `Cache cleared successfully! Removed ${totalCleared} cached entries.`,
        clearedCount: totalCleared,
        intent: "clear-cache"
      };
    } catch (error) {
      console.error("Error clearing cache:", error);
      return { error: "Failed to clear cache" };
    }
  }

  return { error: "Invalid action" };
};
