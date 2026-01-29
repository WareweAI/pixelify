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
  const bypassCache = url.searchParams.get('refresh') === 'true';

  // Generate cache key for this shop
  const cacheKey = generateCacheKey('catalog-data', shop);

  // ALWAYS bypass cache for catalog data to ensure real-time Facebook API calls
  // This is critical for disconnect/connect operations and pixel validation
  cache.delete(cacheKey);
  console.log(`[Catalog Data API] Cache disabled for real-time Facebook validation`);

  // Fetch fresh data without caching
  const fetchCatalogData = async () => {
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
    
    const appWithToken = apps.find((app: any) => app.settings?.metaAccessToken);
    const accessToken = appWithToken?.settings?.metaAccessToken || null;
    
    console.log(`[Catalog Data API] User: ${user.id}, Apps: ${apps.length}, Has token: ${!!accessToken}`);

    const [productCountRes, facebookUser, dbCatalogs] = await Promise.all([
      admin.graphql(`query { products(first: 250, query: "status:active") { edges { node { id } } } }`)
        .then(r => r.json())
        .then(data => data.data?.products?.edges?.length || 0)
        .catch(() => 0),
      
      accessToken
        ? fetch(`https://graph.facebook.com/v18.0/me?fields=id,name,picture.type(large)&access_token=${accessToken}`)
            .then(res => res.json())
            .then(data => {
              if (data.error) {
                console.error(`[Catalog Data API] Facebook API error:`, data.error);
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
    const isConnected = hasToken && !!facebookUser;

    console.log(`[Catalog Data API] ✅ Final counts - productCount: ${productCount}, syncedProductCount: ${syncedProductCount}`);

    return { 
      hasToken, 
      productCount, 
      syncedProductCount, 
      catalogs, 
      userId: user.id,
      facebookUser,
      isConnected,
      cached: false,
      cacheTimestamp: new Date().toISOString(),
    };
  };

  const catalogData = await fetchCatalogData();
  return Response.json(catalogData);
};
