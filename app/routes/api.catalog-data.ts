import type { LoaderFunctionArgs } from "react-router";
import { getShopifyInstance } from "../shopify.server";
import prisma from "../db.server";
import { cache, generateCacheKey, withCache } from "~/lib/cache.server";

interface Catalog {
  id: string;
  catalogId: string;
  name: string;
  pixelId: string | null;
  pixelEnabled: boolean;
  autoSync: boolean;
  productCount: number;
  lastSync: string | null;
  nextSync: string | null;
  syncStatus: string;
}

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
  const bypassCache = url.searchParams.get('refresh') === 'true' || url.searchParams.get('force') === 'true';

  // Generate cache key for this shop
  const cacheKey = generateCacheKey('catalog-data', shop);

  // If bypassing cache, invalidate it first
  if (bypassCache) {
    cache.delete(cacheKey);
    console.log(`[Catalog Data API] Cache bypassed for ${shop} (refresh=${url.searchParams.get('refresh')}, force=${url.searchParams.get('force')})`);
  }

  // Use cache with 5 minute TTL (300 seconds)
  const cachedData = await withCache(cacheKey, 300, async () => {
    console.log(`[Catalog Data API] Fetching fresh data for ${shop}`);

    // Get user first
    const user = await prisma.user.findUnique({ where: { storeUrl: shop } });
    if (!user) {
      throw new Error("User not found");
    }

    // Get apps with settings to find access token
    const apps = await prisma.app.findMany({ 
      where: { userId: user.id }, 
      include: { settings: true } 
    });
    
    console.log(`[Catalog Data API] Found ${apps.length} apps for user ${user.id}`);
    
    // Find any app with a valid Facebook access token
    const appWithToken = apps.find((app: any) => 
      app.settings?.metaAccessToken && 
      app.settings.metaAccessToken.length > 0
    );
    const accessToken = appWithToken?.settings?.metaAccessToken || null;
    
    console.log(`[Catalog Data API] User: ${user.id}, Apps: ${apps.length}, Has token: ${!!accessToken}`);
    
    // Debug: Show detailed token information
    if (accessToken) {
      console.log(`[Catalog Data API] ✅ Found Facebook token in app: ${appWithToken.name}`);
      console.log(`[Catalog Data API] Token preview: ${accessToken.substring(0, 20)}...`);
      const expiresAt = appWithToken.settings.metaTokenExpiresAt;
      if (expiresAt) {
        const now = new Date();
        const isExpired = now > new Date(expiresAt);
        console.log(`[Catalog Data API] Token expires: ${expiresAt}, Is expired: ${isExpired}`);
      } else {
        console.log(`[Catalog Data API] Token has no expiry date`);
      }
    } else {
      console.log(`[Catalog Data API] ❌ No Facebook token found in any app`);
      apps.forEach((app: any, index: number) => {
        const tokenLength = app.settings?.metaAccessToken?.length || 0;
        const tokenPreview = app.settings?.metaAccessToken ? 
          `${app.settings.metaAccessToken.substring(0, 10)}...` : 'none';
        const expiresAt = app.settings?.metaTokenExpiresAt;
        const isExpired = expiresAt ? new Date() > new Date(expiresAt) : 'unknown';
        console.log(`[Catalog Data API] App ${index + 1}: "${app.name}", has settings: ${!!app.settings}, token length: ${tokenLength}, token: ${tokenPreview}, expires: ${expiresAt || 'never'}, expired: ${isExpired}`);
      });
    }

    const [productCountRes, facebookUser, dbCatalogs] = await Promise.all([
      admin.graphql(`query { products(first: 250, query: "status:active") { edges { node { id } } } }`)
        .then(r => r.json())
        .then(data => data.data?.products?.edges?.length || 0)
        .catch(() => 0),
      
      accessToken
        ? fetch(`https://graph.facebook.com/v18.0/me?fields=id,name,picture.type(large)&access_token=${accessToken}`, {
            method: 'GET',
            headers: {
              'Accept': 'application/json'
            }
          })
            .then(res => res.json())
            .then(data => {
              if (data.error) {
                console.error(`[Catalog Data API] Facebook API error:`, data.error);
                
                // Check if it's a token expiry error
                if (data.error.code === 190 || data.error.error_subcode === 463) {
                  console.log(`[Catalog Data API] ⚠️ Facebook token expired - user needs to reconnect`);
                  // Return special object to indicate token expired
                  return { tokenExpired: true };
                }
                return null;
              }
              console.log(`[Catalog Data API] Facebook user: ${data.name}`);
              return {
                id: data.id,
                name: data.name,
                picture: data.picture?.data?.url || null,
              };
            })
            .catch((err) => {
              console.error(`[Catalog Data API] Facebook fetch error:`, err);
              return null;
            })
        : Promise.resolve(null),
      
      // Get catalogs from DATABASE (only catalogs created through Pixelify)
      prisma.facebookCatalog.findMany({
        where: { userId: user.id },
        orderBy: { createdAt: "desc" },
      }).catch(() => []),
    ]);

    const productCount = productCountRes;

    // Fetch actual product counts from Facebook for all catalogs to auto-fix incorrect counts
    const catalogsWithCorrectCounts = await Promise.all(
      dbCatalogs.map(async (cat: any) => {
        try {
          if (accessToken && cat.catalogId) {
            console.log(`[Catalog Data API] Fetching actual count from Facebook for catalog ${cat.name}...`);
            const countRes = await fetch(
              `https://graph.facebook.com/v18.0/${cat.catalogId}/products?fields=id&limit=1&summary=true&access_token=${accessToken}`
            );
            const countData = await countRes.json();
            
            if (countData.summary?.total_count !== undefined) {
              const actualCount = Math.max(0, Math.floor(countData.summary.total_count || 0));
              console.log(`[Catalog Data API] Catalog ${cat.name}: DB has ${cat.productCount}, Facebook has ${actualCount}`);
              
              // If counts don't match, update database
              if (actualCount !== cat.productCount) {
                console.log(`[Catalog Data API] ⚠️ Mismatch detected! Updating database from ${cat.productCount} to ${actualCount}...`);
                const updated = await prisma.facebookCatalog.update({
                  where: { id: cat.id },
                  data: { productCount: actualCount, lastSync: new Date() },
                });
                console.log(`[Catalog Data API] ✅ Updated catalog ${cat.name} productCount to ${updated.productCount}`);
                return updated;
              }
            }
          }
        } catch (err) {
          console.error(`[Catalog Data API] Error fetching count for ${cat.name}:`, err);
        }
        return cat;
      })
    );

    const catalogs: Catalog[] = catalogsWithCorrectCounts.map((cat: any) => ({
      id: cat.id,
      catalogId: cat.catalogId,
      name: cat.name,
      pixelId: cat.pixelId,
      pixelEnabled: cat.pixelEnabled,
      autoSync: cat.autoSync,
      productCount: cat.productCount,
      lastSync: cat.lastSync?.toISOString() || null,
      nextSync: cat.nextSync?.toISOString() || null,
      syncStatus: cat.syncStatus,
    }));

    const syncedProductCount = catalogs.reduce((sum, c) => sum + c.productCount, 0);
    const hasToken = !!accessToken;
    
    // Check if Facebook user fetch failed due to expired token
    const tokenExpired = facebookUser && facebookUser.tokenExpired === true;
    const isConnected = hasToken && !!facebookUser && !tokenExpired;

    // If token is expired, clean it up from database
    if (tokenExpired && appWithToken?.settings) {
      console.log(`[Catalog Data API] 🧹 Cleaning up expired token from app: ${appWithToken.name}`);
      try {
        await prisma.appSettings.update({
          where: { id: appWithToken.settings.id },
          data: { 
            metaAccessToken: null,
            metaTokenExpiresAt: null,
          },
        });
        console.log(`[Catalog Data API] ✅ Expired token cleaned up successfully`);
        
        // Invalidate caches to reflect token removal
        cache.invalidatePattern(`dashboard:${shop}:`);
        cache.invalidatePattern(`catalog:${shop}:`);
        console.log(`[Catalog Data API] 🗑️ Cleared caches due to expired token cleanup`);
      } catch (err) {
        console.error(`[Catalog Data API] ❌ Failed to clean up expired token:`, err);
      }
    }

    console.log(`[Catalog Data API] ✅ Final counts - productCount: ${productCount}, syncedProductCount: ${syncedProductCount}`);
    console.log(`[Catalog Data API] Token status - hasToken: ${hasToken}, tokenExpired: ${tokenExpired}, isConnected: ${isConnected}`);

    return { 
      hasToken, 
      tokenExpired,
      productCount, 
      syncedProductCount, 
      catalogs, 
      userId: user.id,
      facebookUser: tokenExpired ? null : facebookUser, // Don't return user info if token expired
      isConnected,
      cached: false,
      cacheTimestamp: new Date().toISOString(),
    };
  });

  return Response.json(cachedData);
};
