# AutoSync Implementation Guide

## Current Problem

**AutoSync toggle is ON but products don't sync automatically.**

### Why?
The current implementation only sets a database flag (`autoSync: true`) but doesn't actually trigger any syncing. There's no background job or scheduler running.

```typescript
// Current implementation - just sets a flag
if (intent === "toggle-autosync") {
  await prisma.facebookCatalog.update({ 
    where: { id }, 
    data: { autoSync: enabled } // ❌ Only updates flag, no actual sync
  });
}
```

---

## Solution Options

### Option 1: Webhook-Based Auto Sync (Recommended) ⭐

Sync automatically when products are updated in Shopify.

**Pros:**
- Real-time syncing
- No scheduled jobs needed
- Efficient (only syncs when needed)

**Cons:**
- Requires webhook setup
- More complex implementation

### Option 2: Scheduled Cron Job

Run a background job every X hours to sync catalogs with autoSync enabled.

**Pros:**
- Simple to implement
- Reliable
- Works for all catalogs

**Cons:**
- Not real-time
- Uses more resources
- Requires cron setup

### Option 3: Manual Sync Button (Current)

User clicks "Sync" button to manually sync products.

**Pros:**
- Simple
- User has control
- No background jobs

**Cons:**
- Not automatic
- User must remember to sync

---

## Recommended Implementation: Webhook + Cron Hybrid

### Step 1: Add Product Webhook Handler

**File:** `app/routes/webhooks.products.update.tsx`

```typescript
import type { ActionFunctionArgs } from "react-router";
import { getShopifyInstance } from "../shopify.server";
import prisma from "../db.server";

export const action = async ({ request }: ActionFunctionArgs) => {
  const shopify = getShopifyInstance();
  const { payload, session, topic, shop } = await shopify.authenticate.webhook(request);

  console.log(`[Webhook] Product updated: ${payload.id} in shop: ${shop}`);

  try {
    // Find user
    const user = await prisma.user.findUnique({ where: { storeUrl: shop } });
    if (!user) return new Response("OK", { status: 200 });

    // Find catalogs with autoSync enabled
    const catalogs = await prisma.facebookCatalog.findMany({
      where: { 
        userId: user.id,
        autoSync: true // Only sync catalogs with autoSync ON
      }
    });

    if (catalogs.length === 0) {
      console.log("[Webhook] No catalogs with autoSync enabled");
      return new Response("OK", { status: 200 });
    }

    // Get access token
    const apps = await prisma.app.findMany({ 
      where: { userId: user.id }, 
      include: { settings: true } 
    });
    const appWithToken = apps.find(app => app.settings?.metaAccessToken);
    const accessToken = appWithToken?.settings?.metaAccessToken;

    if (!accessToken) {
      console.log("[Webhook] No Facebook access token");
      return new Response("OK", { status: 200 });
    }

    // Sync each catalog (in background)
    for (const catalog of catalogs) {
      // Queue sync job or sync immediately
      await syncCatalogProducts(catalog.id, catalog.catalogId, accessToken, shop);
    }

    return new Response("OK", { status: 200 });
  } catch (error) {
    console.error("[Webhook] Error:", error);
    return new Response("OK", { status: 200 }); // Always return 200 to Shopify
  }
};

async function syncCatalogProducts(
  catalogDbId: string, 
  catalogId: string, 
  accessToken: string, 
  shop: string
) {
  try {
    console.log(`[AutoSync] Syncing catalog ${catalogId}...`);
    
    // Update status to syncing
    await prisma.facebookCatalog.update({
      where: { id: catalogDbId },
      data: { syncStatus: "syncing" }
    });

    // Fetch products from Shopify
    const shopify = getShopifyInstance();
    const { admin } = await shopify.authenticate.admin(request);
    
    const productsRes = await admin.graphql(`
      query {
        products(first: 250, query: "status:active") {
          edges {
            node {
              id
              title
              description
              handle
              vendor
              onlineStoreUrl
              featuredImage { url }
              variants(first: 100) {
                edges {
                  node {
                    id
                    title
                    sku
                    price
                    inventoryQuantity
                  }
                }
              }
            }
          }
        }
      }
    `);

    const productsData = await productsRes.json();
    const products = productsData.data?.products?.edges || [];

    // Transform products for Facebook
    const fbProducts: any[] = [];
    products.forEach((edge: any) => {
      const p = edge.node;
      const productId = p.id.split("/").pop();
      const variants = p.variants.edges;
      
      variants.forEach((v: any) => {
        fbProducts.push(makeFbProduct(p, v.node, productId, shop));
      });
    });

    // Upload to Facebook in batches
    let synced = 0;
    for (let i = 0; i < fbProducts.length; i += 1000) {
      const batch = fbProducts.slice(i, i + 1000);
      const uploadRes = await fetch(
        `https://graph.facebook.com/v18.0/${catalogId}/batch?access_token=${accessToken}`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ requests: batch }),
        }
      );
      const uploadData = await uploadRes.json();
      if (uploadData.handles) synced += uploadData.handles.length;
    }

    // Update catalog with sync results
    await prisma.facebookCatalog.update({
      where: { id: catalogDbId },
      data: {
        productCount: synced,
        lastSync: new Date(),
        nextSync: new Date(Date.now() + 24 * 60 * 60 * 1000), // Next sync in 24 hours
        syncStatus: "synced"
      }
    });

    console.log(`[AutoSync] ✅ Synced ${synced} products to catalog ${catalogId}`);
  } catch (error) {
    console.error(`[AutoSync] Error syncing catalog ${catalogId}:`, error);
    
    await prisma.facebookCatalog.update({
      where: { id: catalogDbId },
      data: { syncStatus: "error" }
    });
  }
}

function makeFbProduct(product: any, variant: any, productId: string, shop: string) {
  const variantId = variant.id.split("/").pop();
  const retailerId = variant.sku || `${productId}_${variantId}`;
  
  return {
    method: "UPDATE", // Use UPDATE instead of CREATE for existing products
    retailer_id: retailerId,
    data: {
      id: retailerId,
      title: variant.title !== "Default Title" 
        ? `${product.title} - ${variant.title}` 
        : product.title,
      description: product.description?.substring(0, 5000) || product.title,
      image_link: product.featuredImage?.url || "",
      link: product.onlineStoreUrl || `https://${shop}/products/${product.handle}`,
      price: `${variant.price} USD`,
      availability: (variant.inventoryQuantity || 0) > 0 ? "in stock" : "out of stock",
      condition: "new",
      brand: product.vendor || shop.replace(".myshopify.com", ""),
      item_group_id: productId,
    },
  };
}
```

### Step 2: Register Webhook in Shopify Config

**File:** `shopify.server.ts`

```typescript
webhooks: {
  PRODUCTS_UPDATE: {
    deliveryMethod: DeliveryMethod.Http,
    callbackUrl: "/webhooks/products/update",
  },
  PRODUCTS_CREATE: {
    deliveryMethod: DeliveryMethod.Http,
    callbackUrl: "/webhooks/products/create",
  },
  PRODUCTS_DELETE: {
    deliveryMethod: DeliveryMethod.Http,
    callbackUrl: "/webhooks/products/delete",
  },
}
```

### Step 3: Add Scheduled Sync (Fallback)

**File:** `app/routes/api.cron.sync-catalogs.ts`

```typescript
import type { ActionFunctionArgs } from "react-router";
import prisma from "../db.server";

export const action = async ({ request }: ActionFunctionArgs) => {
  // Verify cron secret
  const authHeader = request.headers.get("Authorization");
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  console.log("[Cron] Starting scheduled catalog sync...");

  try {
    // Find all catalogs that need syncing
    const now = new Date();
    const catalogsToSync = await prisma.facebookCatalog.findMany({
      where: {
        autoSync: true,
        OR: [
          { nextSync: { lte: now } }, // Past due
          { nextSync: null } // Never synced
        ]
      },
      include: {
        user: {
          include: {
            apps: {
              include: { settings: true }
            }
          }
        }
      }
    });

    console.log(`[Cron] Found ${catalogsToSync.length} catalogs to sync`);

    let synced = 0;
    let failed = 0;

    for (const catalog of catalogsToSync) {
      try {
        const appWithToken = catalog.user.apps.find(
          app => app.settings?.metaAccessToken
        );
        
        if (!appWithToken?.settings?.metaAccessToken) {
          console.log(`[Cron] No token for catalog ${catalog.id}`);
          failed++;
          continue;
        }

        // Trigger sync via API
        await fetch(`${process.env.SHOPIFY_APP_URL}/api/catalog`, {
          method: "POST",
          headers: { "Content-Type": "application/x-www-form-urlencoded" },
          body: new URLSearchParams({
            intent: "sync-catalog",
            id: catalog.id
          })
        });

        synced++;
      } catch (error) {
        console.error(`[Cron] Error syncing catalog ${catalog.id}:`, error);
        failed++;
      }
    }

    console.log(`[Cron] ✅ Synced: ${synced}, Failed: ${failed}`);

    return Response.json({ 
      success: true, 
      synced, 
      failed,
      total: catalogsToSync.length 
    });
  } catch (error) {
    console.error("[Cron] Error:", error);
    return Response.json({ error: "Sync failed" }, { status: 500 });
  }
};
```

### Step 4: Setup Cron Job (Vercel)

**File:** `vercel.json`

```json
{
  "crons": [
    {
      "path": "/api/cron/sync-catalogs",
      "schedule": "0 */6 * * *"
    }
  ]
}
```

This runs every 6 hours.

---

## Quick Fix: Manual Sync with Auto-Refresh

If you want a quick solution without webhooks/cron:

**Update the toggle handler to trigger immediate sync:**

```typescript
// In api.catalog.ts
if (intent === "toggle-autosync") {
  const id = formData.get("id") as string;
  const enabled = formData.get("enabled") === "true";
  
  const catalog = await prisma.facebookCatalog.update({ 
    where: { id }, 
    data: { autoSync: enabled } 
  });
  
  // If enabling autosync, trigger immediate sync
  if (enabled) {
    console.log("[AutoSync] Triggering immediate sync...");
    
    // Trigger sync in background (don't wait)
    syncCatalogInBackground(id).catch(err => 
      console.error("[AutoSync] Background sync failed:", err)
    );
  }
  
  return Response.json({ 
    success: true,
    catalog: {
      id: catalog.id,
      autoSync: catalog.autoSync,
    },
    message: enabled ? "AutoSync enabled. Syncing products..." : "AutoSync disabled"
  });
}

async function syncCatalogInBackground(catalogId: string) {
  // Wait a bit to return response first
  await new Promise(resolve => setTimeout(resolve, 100));
  
  // Then trigger sync
  await fetch(`${process.env.SHOPIFY_APP_URL}/api/catalog`, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      intent: "sync-catalog",
      id: catalogId
    })
  });
}
```

---

## Summary

### Current State:
- ❌ AutoSync toggle only sets a flag
- ❌ No automatic syncing happens
- ✅ Manual sync button works

### Recommended Solution:
1. ✅ Add product webhooks (real-time sync)
2. ✅ Add cron job (scheduled sync every 6 hours)
3. ✅ Trigger immediate sync when enabling autoSync

### Quick Fix:
- Trigger sync immediately when user enables autoSync toggle
- Show "Syncing..." message
- Update UI when sync completes

Would you like me to implement the quick fix or the full webhook solution?
