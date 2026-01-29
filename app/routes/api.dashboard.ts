import type { ActionFunctionArgs, LoaderFunctionArgs } from "react-router";
import { getShopifyInstance } from "../shopify.server";
import prisma, { withDatabaseRetry } from "../db.server";
import { generateRandomPassword } from "~/lib/crypto.server";
import { createAppWithSettings, renameApp, deleteAppWithData } from "~/services/app.service.server";
import { cache } from "~/lib/cache.server";

export const loader = async ({ request }: LoaderFunctionArgs) => {
  const shopify = getShopifyInstance();

  if (!shopify?.authenticate) {
    console.error("[Dashboard API] Shopify instance not configured");
    throw new Response("Shopify configuration not found", { status: 500 });
  }

  let session, admin;
  try {
    const authResult = await shopify.authenticate.admin(request);
    session = authResult.session;
    admin = authResult.admin;
  } catch (error) {
    console.error("[Dashboard API] Authentication failed:", error);
    if (error instanceof Response && error.status === 302) throw error;
    throw new Response("Unable to authenticate", { status: 503 });
  }

  const shop = session.shop;
  const url = new URL(request.url);
  const purchaseOffset = parseInt(url.searchParams.get('purchaseOffset') || '0');
  const purchaseLimit = 10;
  
  console.log(`[Dashboard API] Request from shop: ${shop}, offset: ${purchaseOffset}`);
  
  // ALWAYS clear ALL cache for this shop to ensure real-time data
  try {
    console.log(`[Dashboard API] Clearing ALL cache for ${shop}...`);
    const cachePatterns = [
      `dashboard:${shop}`,
      `app-settings:${shop}`,
      `catalog-data:${shop}`,
      `settings-data:${shop}`,
      `analytics:${shop}`,
      `pixels:${shop}`,
      `facebook`,
    ];
    
    let totalCleared = 0;
    for (const pattern of cachePatterns) {
      try {
        const cleared = cache.invalidatePattern(pattern);
        totalCleared += cleared;
      } catch (cacheError) {
        console.warn(`[Dashboard API] Failed to clear cache pattern ${pattern}:`, cacheError);
      }
    }
    console.log(`[Dashboard API] Cleared ${totalCleared} cache entries for ${shop}`);
  } catch (cacheError) {
    console.error("[Dashboard API] Cache clearing failed:", cacheError);
    // Continue even if cache clearing fails
  }

  // Fetch fresh data without any caching
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
    
    // Check if user has any Facebook tokens
    const hasValidFacebookToken = transformedApps.some((app: any) => 
      app.settings?.metaAccessToken && app.settings.metaAccessToken.length > 0
    );

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
    console.log('[API] 🔵 CREATE-PIXEL request received');
    console.log('[API] Request timestamp:', new Date().toISOString());
    
    try {
      const pixelName = formData.get("pixelName") as string;
      const pixelId = formData.get("pixelId") as string;
      const accessToken = formData.get("accessToken") as string;
      const timezone = formData.get("timezone") as string || "GMT+0";

      console.log('[API] 📋 Pixel data:', {
        pixelName,
        pixelId,
        timezone,
        hasAccessToken: !!accessToken,
        tokenLength: accessToken?.length || 0
      });

      if (!pixelName || !pixelId || !accessToken) {
        console.error('[API] ❌ Missing required fields');
        return { success: false, error: "Pixel name, ID, and access token are required" };
      }

      // Check if pixel already exists
      console.log('[API] 🔍 Checking for existing pixel...');
      const existingPixel = await prisma.appSettings.findFirst({
        where: { metaPixelId: pixelId, app: { userId: user.id } },
        include: { app: { select: { name: true } } }
      });

      if (existingPixel) {
        console.log('[API] ⚠️ Pixel already exists:', existingPixel.app.name);
        return { success: false, error: `Pixel already exists as "${existingPixel.app.name}"` };
      }
      console.log('[API] ✅ No existing pixel found');

      // Validate pixel with Facebook (with timeout)
      console.log('[API] 🔍 Validating pixel with Facebook...');
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 8000); // 8 second timeout
      
      try {
        const validateResponse = await fetch(
          `https://graph.facebook.com/v24.0/${pixelId}?access_token=${accessToken}`,
          { signal: controller.signal }
        );
        clearTimeout(timeoutId);
        
        console.log('[API] Facebook validation response status:', validateResponse.status);
        
        if (!validateResponse.ok) {
          console.error('[API] ❌ Facebook validation failed with HTTP', validateResponse.status);
          return { success: false, error: `Failed to validate pixel with Facebook (HTTP ${validateResponse.status})` };
        }
        
        const validateData = await validateResponse.json();
        console.log('[API] Facebook validation data:', validateData);

        if (validateData.error) {
          console.error('[API] ❌ Facebook returned error:', validateData.error.message);
          return { success: false, error: `Pixel validation failed: ${validateData.error.message}` };
        }
        
        console.log('[API] ✅ Pixel validated successfully');
      } catch (fetchError: any) {
        clearTimeout(timeoutId);
        if (fetchError.name === 'AbortError') {
          console.error('[API] ❌ Facebook validation timed out after 8 seconds');
          return { success: false, error: 'Facebook validation timed out. Please check your access token and try again.' };
        }
        console.error('[API] ❌ Facebook validation error:', fetchError.message);
        return { success: false, error: `Failed to validate pixel: ${fetchError.message}` };
      }

      // Create pixel
      console.log('[API] 💾 Creating app in database...');
      const app = await prisma.app.create({
        data: {
          userId: user.id,
          name: pixelName,
          appId: `pixel_${Date.now()}`,
          appToken: `token_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`,
        },
      });
      console.log('[API] ✅ App created with ID:', app.id);

      console.log('[API] 💾 Creating app settings...');
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
          timezone: timezone,
        },
      });
      console.log('[API] ✅ App settings created');

      // Invalidate cache after creating pixel
      invalidateDashboardCache();
      console.log('[API] ✅ Cache invalidated');

      console.log('[API] 🎉 Pixel creation complete! Returning success response');
      return { success: true, message: "Pixel created successfully", appId: app.id };
    } catch (error: any) {
      console.error('[API] ❌ CRITICAL ERROR creating pixel:', error);
      console.error('[API] Error stack:', error.stack);
      return { success: false, error: `Failed to create pixel: ${error.message || 'Unknown error'}` };
    }
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

    // Exchange short-lived token for long-lived token (60 days)
    console.log('[Dashboard API] Exchanging short-lived token for long-lived token...');
    const appId = process.env.FACEBOOK_APP_ID;
    const appSecret = process.env.FACEBOOK_APP_SECRET;

    try {
      const exchangeResponse = await fetch(
        `https://graph.facebook.com/v18.0/oauth/access_token?grant_type=fb_exchange_token&client_id=${appId}&client_secret=${appSecret}&fb_exchange_token=${accessToken}`
      );

      const exchangeData = await exchangeResponse.json();

      if (exchangeData.error) {
        console.error('[Dashboard API] Token exchange failed:', exchangeData.error);
        return { error: `Failed to exchange token: ${exchangeData.error.message}` };
      }

      const longLivedToken = exchangeData.access_token || accessToken;

      // Get token expiry info
      const debugResponse = await fetch(
        `https://graph.facebook.com/v18.0/debug_token?input_token=${longLivedToken}&access_token=${longLivedToken}`
      );

      const debugData = await debugResponse.json();
      const expiresAt = debugData.data?.expires_at 
        ? new Date(debugData.data.expires_at * 1000)
        : new Date(Date.now() + 60 * 24 * 60 * 60 * 1000); // Default to 60 days

      console.log(`[Dashboard API] Token exchanged successfully, expires: ${expiresAt.toISOString()}`);

      // Save long-lived token to all apps
      let apps = await prisma.app.findMany({
        where: { userId: user.id },
        include: { settings: true },
      });

      // If no apps exist, create a default app to store the token
      if (apps.length === 0) {
        console.log('[Dashboard API] No apps found, creating default app for token storage');
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
        
        console.log('[Dashboard API] Created default app for Facebook token storage');
        apps = [{ ...defaultApp, settings: { 
          id: '', 
          appId: defaultApp.id, 
          timezone: "GMT+0",
          autoTrackPageviews: true,
          autoTrackClicks: true,
          autoTrackScroll: true,
          recordIp: true,
          recordLocation: true,
          recordSession: true,
          customEventsEnabled: true,
          autoTrackViewContent: true,
          autoTrackAddToCart: true,
          autoTrackInitiateCheckout: true,
          autoTrackPurchase: true,
          metaPixelId: null,
          metaAccessToken: longLivedToken,
          metaTokenExpiresAt: expiresAt,
          metaPixelEnabled: false,
          metaTestEventCode: null,
          metaVerified: false,
          trackingPages: "all",
          selectedCollections: null,
          selectedProductTypes: null,
          selectedProductTags: null,
          selectedProducts: null,
          facebookCatalogId: null,
          facebookCatalogEnabled: false,
          facebookCatalogSyncStatus: null,
          facebookCatalogLastSync: null,
        } }];
      }

      for (const app of apps) {
        // Skip the default app we just created with settings
        if (app.name === "Facebook Integration" && app.settings?.id === '') {
          continue;
        }
        
        if (app.settings) {
          await prisma.appSettings.update({
            where: { id: app.settings.id },
            data: { 
              metaAccessToken: longLivedToken,
              metaTokenExpiresAt: expiresAt,
            },
          });
        } else {
          await prisma.appSettings.create({
            data: { 
              appId: app.id, 
              metaAccessToken: longLivedToken,
              metaTokenExpiresAt: expiresAt,
            },
          });
        }
      }

      // Invalidate ALL caches after token update
      invalidateDashboardCache();
      cache.invalidatePattern(`catalog:${shop}:`);
      cache.invalidatePattern(`settings:${shop}:`);
      cache.invalidatePattern(`app-settings:${shop}:`);
      console.log('[Dashboard API] Cleared all caches for fresh token data');

      return { 
        success: true, 
        message: "Token saved and exchanged for long-lived token", 
        expiresAt: expiresAt.toISOString(),
        intent: "save-facebook-token" 
      };
    } catch (error) {
      console.error('[Dashboard API] Error exchanging token:', error);
      return { error: "Failed to exchange token for long-lived token" };
    }
  }

  // Fetch Facebook pixels
  if (intent === "fetch-facebook-pixels") {
    const accessToken = formData.get("accessToken") as string;

    if (!accessToken) {
      return { error: "Access token is required", success: false };
    }

    console.log('[Dashboard API] Fetching Facebook pixels from API...');

    try {
      // First, get user info
      const userResponse = await fetch(
        `https://graph.facebook.com/v24.0/me?fields=id,name,picture&access_token=${accessToken}`
      );
      const userData = await userResponse.json();

      if (userData.error) {
        console.error('[Dashboard API] Failed to fetch user info:', userData.error);
        return { error: "Failed to access Facebook user info", success: false };
      }

      console.log('[Dashboard API] Facebook user:', userData.name);

      // Get ad accounts
      const adAccountsResponse = await fetch(
        `https://graph.facebook.com/v24.0/me/adaccounts?fields=id,name,business&access_token=${accessToken}`
      );
      const adAccountsData = await adAccountsResponse.json();

      if (adAccountsData.error) {
        console.error('[Dashboard API] Failed to fetch ad accounts:', adAccountsData.error);
        return { error: "Failed to access Facebook ad accounts", success: false };
      }

      let businessId: string | null = null;
      let businessName: string | null = null;
      const adAccounts = adAccountsData.data || [];

      console.log('[Dashboard API] Found', adAccounts.length, 'ad accounts');

      const accountWithBusiness = adAccounts.find((acc: any) => acc.business?.id);
      if (accountWithBusiness) {
        businessId = accountWithBusiness.business.id;
        businessName = accountWithBusiness.business.name || "Business Manager";
        console.log('[Dashboard API] Using business:', businessName, '(', businessId, ')');
      }

      const allPixels: Array<{ id: string; name: string; accountName: string }> = [];

      if (businessId) {
        const pixelsResponse = await fetch(
          `https://graph.facebook.com/v24.0/${businessId}/adspixels?fields=id,name&access_token=${accessToken}`
        );
        const pixelsData = await pixelsResponse.json();

        if (pixelsData.error) {
          console.error('[Dashboard API] Failed to fetch pixels:', pixelsData.error);
        } else if (pixelsData.data) {
          pixelsData.data.forEach((pixel: any) => {
            allPixels.push({
              id: pixel.id,
              name: pixel.name,
              accountName: businessName || "Business Manager",
            });
          });
          console.log('[Dashboard API] Found', allPixels.length, 'pixels from business');
        }
      } else {
        console.warn('[Dashboard API] No business manager found - checking ad accounts directly');
        
        // Try to get pixels from each ad account
        for (const account of adAccounts) {
          try {
            const pixelsResponse = await fetch(
              `https://graph.facebook.com/v24.0/${account.id}/adspixels?fields=id,name&access_token=${accessToken}`
            );
            const pixelsData = await pixelsResponse.json();

            if (pixelsData.data) {
              pixelsData.data.forEach((pixel: any) => {
                allPixels.push({
                  id: pixel.id,
                  name: pixel.name,
                  accountName: account.name || "Ad Account",
                });
              });
            }
          } catch (err) {
            console.error('[Dashboard API] Error fetching pixels from account', account.id, ':', err);
          }
        }
      }

      console.log('[Dashboard API] Total pixels from Facebook:', allPixels.length);
      
      // Log the actual pixel IDs from Facebook
      if (allPixels.length > 0) {
        console.log('[Dashboard API] Facebook pixel IDs:', allPixels.map(p => p.id).join(', '));
      }

      // Check if user has any pixels in Facebook at all
      if (allPixels.length === 0) {
        console.warn('[Dashboard API] No pixels found in Facebook account');
        return { 
          error: "No pixels found in your Facebook account. Create pixels in Facebook Events Manager first.", 
          success: false,
          user: userData,
          totalPixels: 0,
          existingPixels: 0
        };
      }

      // NOW CHECK DATABASE - Filter out pixels that already exist in the database
      console.log('[Dashboard API] Checking database for existing pixels...');
      const existingPixels = await prisma.appSettings.findMany({
        where: {
          app: { userId: user.id },
          metaPixelId: { in: allPixels.map(p => p.id) }
        },
        select: { 
          metaPixelId: true,
          app: {
            select: {
              name: true,
              appId: true
            }
          }
        }
      });

      const existingPixelIds = new Set(existingPixels.map(p => p.metaPixelId).filter(Boolean));
      console.log('[Dashboard API] Pixels already in database:', existingPixelIds.size);
      
      // Log which pixels are in the database
      if (existingPixelIds.size > 0) {
        console.log('[Dashboard API] Existing pixel IDs in DB:', Array.from(existingPixelIds).join(', '));
        existingPixels.forEach(p => {
          console.log(`[Dashboard API] - Pixel ${p.metaPixelId} in app: ${p.app.name} (${p.app.appId})`);
        });
      }

      // Filter out pixels that are already in the database
      const availablePixels = allPixels.filter(pixel => !existingPixelIds.has(pixel.id));

      console.log('[Dashboard API] Available pixels (not in DB):', availablePixels.length);
      
      // Log which pixels are available
      if (availablePixels.length > 0) {
        console.log('[Dashboard API] Available pixel IDs:', availablePixels.map(p => p.id).join(', '));
      }

      if (availablePixels.length === 0 && allPixels.length > 0) {
        console.warn('[Dashboard API] All pixels are already added to your account');
        console.log('[Dashboard API] Summary: Total in Facebook:', allPixels.length, ', Already in DB:', existingPixelIds.size);
        return { 
          error: "All your Facebook pixels are already added. Create new pixels in Facebook Events Manager or use Manual Input.", 
          success: false,
          user: userData,
          totalPixels: allPixels.length,
          existingPixels: existingPixelIds.size,
          existingPixelDetails: existingPixels.map(p => ({
            pixelId: p.metaPixelId,
            appName: p.app.name,
            appId: p.app.appId
          }))
        };
      }

      console.log('[Dashboard API] Successfully fetched', availablePixels.length, 'available pixels');
      return { 
        success: true, 
        facebookPixels: availablePixels,
        user: userData,
        totalPixels: allPixels.length,
        availablePixels: availablePixels.length,
        existingPixels: existingPixelIds.size
      };
    } catch (error) {
      console.error('[Dashboard API] Error fetching Facebook pixels:', error);
      return { 
        error: "Failed to fetch pixels from Facebook. Please try again.", 
        success: false 
      };
    }
  }

  // Refresh Facebook access tokens
  if (intent === "refresh-facebook-token") {
    try {
      const { refreshAllUserTokens } = await import("~/services/facebook-token-refresh.server");
      const refreshedCount = await refreshAllUserTokens(user.id);
      
      if (refreshedCount > 0) {
        // Invalidate cache after token refresh
        invalidateDashboardCache();
        
        return { 
          success: true, 
          message: `Successfully refreshed ${refreshedCount} token(s)`,
          intent: "refresh-facebook-token" 
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

  // Disconnect Facebook (remove tokens from database)
  if (intent === "disconnect-facebook") {
    try {
      console.log('[Dashboard API] Disconnecting Facebook for user:', user.id);
      
      // Remove Facebook tokens from all user's apps
      const apps = await prisma.app.findMany({
        where: { userId: user.id },
        include: { settings: true },
      });

      for (const app of apps) {
        if (app.settings) {
          await prisma.appSettings.update({
            where: { id: app.settings.id },
            data: { 
              metaAccessToken: null,
              metaTokenExpiresAt: null,
              metaPixelId: null,
              metaPixelEnabled: false,
            },
          });
          console.log(`[Dashboard API] Removed Facebook token from app: ${app.name}`);
        }
      }

      // Invalidate ALL caches related to this shop
      invalidateDashboardCache();
      cache.invalidatePattern(`catalog:${shop}:`);
      cache.invalidatePattern(`settings:${shop}:`);
      cache.invalidatePattern(`app-settings:${shop}:`);
      console.log('[Dashboard API] Cleared all Facebook-related caches');

      return { 
        success: true, 
        message: "Facebook disconnected successfully. All tokens and caches cleared.",
        intent: "disconnect-facebook" 
      };
    } catch (error) {
      console.error("Error disconnecting Facebook:", error);
      return { error: "Failed to disconnect Facebook. Please try again." };
    }
  }

  return { error: "Invalid action" };
};
