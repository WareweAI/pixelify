import type { ActionFunctionArgs } from "react-router";
import { getShopifyInstance } from "../shopify.server";

/**
 * API Route for Facebook Catalog Operations
 * Handles all catalog-related actions: fetch user, businesses, pixels, create, sync, toggle, delete
 */
export const action = async ({ request }: ActionFunctionArgs) => {
  // Import prisma inside the action to avoid server-only module issues
  const prisma = (await import("../db.server")).default;
  
  const shopify = getShopifyInstance();
  if (!shopify?.authenticate) {
    return Response.json({ error: "Shopify not configured" }, { status: 500 });
  }

  let session, admin;
  try {
    const authResult = await shopify.authenticate.admin(request);
    session = authResult.session;
    admin = authResult.admin;
  } catch (error) {
    if (error instanceof Response) {
      const contentType = error.headers.get('content-type');
      if (contentType?.includes('text/html') && error.status === 200) {
        return Response.json({ error: "Session expired. Please refresh the page." }, { status: 401 });
      }
      throw error;
    }
    return Response.json({ error: "Authentication failed" }, { status: 401 });
  }

  const shop = session.shop;
  const formData = await request.formData();
  const intent = formData.get("intent") as string;

  // Get user
  const user = await prisma.user.findUnique({ where: { storeUrl: shop } });
  if (!user) return Response.json({ error: "User not found" }, { status: 404 });

  // Get access token
  const apps = await prisma.app.findMany({ 
    where: { userId: user.id }, 
    include: { settings: true } 
  });
  const appWithToken = apps.find(app => app.settings?.metaAccessToken);
  const accessToken = appWithToken?.settings?.metaAccessToken;

  // Load Facebook user info
  if (intent === "load-facebook-user") {
    if (!accessToken) {
      return Response.json({ success: true, facebookUser: null });
    }
    
    try {
      const res = await fetch(
        `https://graph.facebook.com/v18.0/me?fields=id,name,picture.type(large)&access_token=${accessToken}`
      );
      const data = await res.json();
      
      if (data.error) {
        return Response.json({ success: true, facebookUser: null });
      }
      
      return Response.json({ 
        success: true, 
        facebookUser: { 
          id: data.id, 
          name: data.name, 
          picture: data.picture?.data?.url 
        } 
      });
    } catch (e) {
      return Response.json({ success: true, facebookUser: null });
    }
  }

  if (!accessToken) {
    return Response.json({ error: "Please connect Facebook in Dashboard first" }, { status: 400 });
  }

  // Fetch businesses
  if (intent === "fetch-businesses") {
    try {
      const res = await fetch(
        `https://graph.facebook.com/v18.0/me/businesses?fields=id,name&access_token=${accessToken}`
      );
      const data = await res.json();
      
      if (data.error) {
        return Response.json({ error: data.error.message }, { status: 400 });
      }
      
      return Response.json({ success: true, businesses: data.data || [] });
    } catch (e: any) {
      return Response.json({ error: e.message }, { status: 500 });
    }
  }

  // Fetch pixels for business
  if (intent === "fetch-pixels") {
    const businessId = formData.get("businessId") as string;
    
    if (!businessId) {
      return Response.json({ error: "Business ID required" }, { status: 400 });
    }
    
    try {
      const res = await fetch(
        `https://graph.facebook.com/v18.0/${businessId}/owned_pixels?fields=id,name&access_token=${accessToken}`
      );
      const data = await res.json();
      
      if (data.error) {
        return Response.json({ error: data.error.message }, { status: 400 });
      }
      
      return Response.json({ success: true, pixels: data.data || [] });
    } catch (e: any) {
      return Response.json({ error: e.message }, { status: 500 });
    }
  }

  // Create catalog
  if (intent === "create-catalog") {
    const businessId = formData.get("businessId") as string;
    const businessName = formData.get("businessName") as string;
    const pixelId = formData.get("pixelId") as string;
    const catalogName = formData.get("catalogName") as string;
    const variantSubmission = (formData.get("variantSubmission") as string) || "separate";

    if (!businessId || !catalogName) {
      return Response.json({ error: "Business and catalog name required" }, { status: 400 });
    }

    try {
      // Create catalog on Facebook
      const createRes = await fetch(
        `https://graph.facebook.com/v18.0/${businessId}/owned_product_catalogs?access_token=${accessToken}`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ name: catalogName }),
        }
      );
      const createData = await createRes.json();
      
      if (createData.error) {
        return Response.json({ error: createData.error.message }, { status: 400 });
      }
      
      const catalogId = createData.id;

      // Connect pixel if provided
      if (pixelId) {
        await fetch(
          `https://graph.facebook.com/v18.0/${catalogId}/external_event_sources?access_token=${accessToken}`,
          {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ external_event_sources: [pixelId] }),
          }
        );
      }

      // Sync products
      const productsRes = await admin.graphql(
        `query {
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
        }`
      );
      
      const productsData = await productsRes.json();
      const products = productsData.data?.products?.edges || [];
      const fbProducts: any[] = [];

      products.forEach((edge: any) => {
        const p = edge.node;
        const productId = p.id.split("/").pop();
        const variants = p.variants.edges;
        
        if (variantSubmission === "first" && variants.length > 0) {
          fbProducts.push(makeFbProduct(p, variants[0].node, productId, shop));
        } else if (variantSubmission === "grouped" && variants.length > 0) {
          fbProducts.push(makeFbProduct(p, variants[0].node, productId, shop));
        } else {
          variants.forEach((v: any) => 
            fbProducts.push(makeFbProduct(p, v.node, productId, shop))
          );
        }
      });

      // Upload products in batches
      let synced = 0;
      for (let i = 0; i < fbProducts.length; i += 1000) {
        const batch = fbProducts.slice(i, i + 1000);
        const uploadRes = await fetch(
          `https://graph.facebook.com/v18.0/${catalogId}/products`,
          {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              access_token: accessToken,
              requests: batch,
            }),
          }
        );
        const uploadData = await uploadRes.json();
        if (uploadData.handles) {
          synced += uploadData.handles.length;
        } else if (uploadData.num_received) {
          synced += uploadData.num_received;
        }
      }

      // Save catalog to database
      const catalog = await prisma.facebookCatalog.create({
        data: {
          catalogId,
          name: catalogName,
          userId: user.id,
          businessId,
          businessName,
          pixelId: pixelId || null,
          pixelEnabled: !!pixelId,
          productCount: synced,
          lastSync: new Date(),
          nextSync: new Date(Date.now() + 5 * 24 * 60 * 60 * 1000),
          syncStatus: "synced",
          variantMode: variantSubmission,
        },
      });

      return Response.json({ 
        success: true, 
        message: `Catalog created! ${synced} products synced.`,
        catalog: {
          id: catalog.id,
          catalogId: catalog.catalogId,
          name: catalog.name,
          pixelId: catalog.pixelId,
          pixelEnabled: catalog.pixelEnabled,
          autoSync: catalog.autoSync,
          productCount: catalog.productCount,
          lastSync: catalog.lastSync?.toISOString(),
          nextSync: catalog.nextSync?.toISOString(),
          syncStatus: catalog.syncStatus,
        }
      });
    } catch (e: any) {
      console.error("[Catalog API] Create error:", e);
      return Response.json({ error: e.message }, { status: 500 });
    }
  }

  // Sync catalog
  if (intent === "sync-catalog") {
    const id = formData.get("id") as string;
    
    if (!id) {
      return Response.json({ error: "Catalog ID required" }, { status: 400 });
    }
    
    const catalog = await prisma.facebookCatalog.findUnique({ where: { id } });
    if (!catalog) {
      return Response.json({ error: "Catalog not found" }, { status: 404 });
    }

    console.log(`[Sync] Starting sync for catalog ${catalog.catalogId} (${catalog.name})`);
    console.log(`[Sync] Variant mode: ${catalog.variantMode}`);
    console.log(`[Sync] Shop: ${shop}`);

    try {
      await prisma.facebookCatalog.update({ 
        where: { id }, 
        data: { syncStatus: "syncing" } 
      });

      console.log(`[Sync] Fetching products from Shopify...`);
      const productsRes = await admin.graphql(
        `query {
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
        }`
      );
      
      const productsData = await productsRes.json();
      console.log(`[Sync] GraphQL response status:`, productsRes.status);
      console.log(`[Sync] GraphQL response data:`, JSON.stringify(productsData, null, 2));
      
      const products = productsData.data?.products?.edges || [];
      console.log(`[Sync] ✅ Fetched ${products.length} products from Shopify`);

      if (products.length === 0) {
        console.log(`[Sync] ⚠️ No products found in Shopify!`);
        return Response.json({ 
          error: "No active products found in your Shopify store. Please ensure you have published products.",
          catalog: {
            id: catalog.id,
            syncStatus: "error",
          }
        }, { status: 400 });
      }

      const fbProducts: any[] = [];

      products.forEach((edge: any) => {
        const p = edge.node;
        const productId = p.id.split("/").pop();
        const variants = p.variants.edges;
        
        console.log(`[Sync] Processing product: ${p.title} (${productId}) with ${variants.length} variants`);
        
        // Validate product has required fields
        if (!p.title) {
          console.warn(`[Sync] ⚠️ Skipping product ${productId}: Missing title`);
          return;
        }
        
        if (variants.length === 0) {
          console.warn(`[Sync] ⚠️ Skipping product ${productId}: No variants`);
          return;
        }
        
        if (catalog.variantMode === "first" && variants.length > 0) {
          const fbProduct = makeFbProduct(p, variants[0].node, productId, shop);
          if (fbProduct) fbProducts.push(fbProduct);
        } else if (catalog.variantMode === "grouped" && variants.length > 0) {
          const fbProduct = makeFbProduct(p, variants[0].node, productId, shop);
          if (fbProduct) fbProducts.push(fbProduct);
        } else {
          variants.forEach((v: any) => {
            const fbProduct = makeFbProduct(p, v.node, productId, shop);
            if (fbProduct) fbProducts.push(fbProduct);
          });
        }
      });

      console.log(`[Sync] ✅ Prepared ${fbProducts.length} products for Facebook upload`);
      
      if (fbProducts.length === 0) {
        console.log(`[Sync] ⚠️ No products prepared for upload!`);
        return Response.json({ 
          error: "Failed to prepare products for upload. Check product data.",
          catalog: {
            id: catalog.id,
            syncStatus: "error",
          }
        }, { status: 400 });
      }

      // Log first product for debugging
      console.log(`[Sync] Sample product data:`, JSON.stringify(fbProducts[0], null, 2));

      let synced = 0;
      let failed = 0;
      const errors: string[] = [];
      
      for (let i = 0; i < fbProducts.length; i += 1000) {
        const batch = fbProducts.slice(i, i + 1000);
        console.log(`[Sync] Uploading batch ${Math.floor(i / 1000) + 1} with ${batch.length} products...`);
        
        try {
          // Facebook Catalog API: POST /{catalog-id}/products (batch endpoint)
          const uploadRes = await fetch(
            `https://graph.facebook.com/v18.0/${catalog.catalogId}/products`,
            {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({
                access_token: accessToken,
                requests: batch,
              }),
            }
          );
          
          const uploadData = await uploadRes.json();
          console.log(`[Sync] Facebook API response status: ${uploadRes.status}`);
          console.log(`[Sync] Facebook API response:`, JSON.stringify(uploadData, null, 2));
          
          // Handle error response
          if (uploadData.error) {
            console.error(`[Sync] ❌ Facebook API error:`, uploadData.error);
            errors.push(`Facebook API error: ${uploadData.error.message} (Code: ${uploadData.error.code})`);
            
            // Check for specific error types
            if (uploadData.error.code === 190) {
              throw new Error(`Access token expired or invalid. Please reconnect Facebook in Dashboard.`);
            } else if (uploadData.error.code === 100) {
              throw new Error(`Invalid catalog ID or insufficient permissions. Error: ${uploadData.error.message}`);
            } else if (uploadData.error.code === 200) {
              throw new Error(`Permission denied. Make sure you have admin access to this catalog.`);
            } else {
              throw new Error(`Facebook API error: ${uploadData.error.message}`);
            }
          }
          
          // Check HTTP status
          if (!uploadRes.ok) {
            console.error(`[Sync] ❌ HTTP error: ${uploadRes.status} ${uploadRes.statusText}`);
            throw new Error(`Facebook API returned ${uploadRes.status}: ${uploadRes.statusText}`);
          }
          
          // Check for validation_status in response
          if (uploadData.validation_status) {
            console.log(`[Sync] Validation status:`, JSON.stringify(uploadData.validation_status, null, 2));
            
            // Check for errors in validation
            if (uploadData.validation_status.errors) {
              console.error(`[Sync] ❌ Validation errors:`, uploadData.validation_status.errors);
              errors.push(`Validation errors: ${JSON.stringify(uploadData.validation_status.errors)}`);
            }
            
            // Check for warnings
            if (uploadData.validation_status.warnings) {
              console.warn(`[Sync] ⚠️ Validation warnings:`, uploadData.validation_status.warnings);
            }
          }
          
          // Count successful uploads
          if (uploadData.handles && uploadData.handles.length > 0) {
            synced += uploadData.handles.length;
            console.log(`[Sync] ✅ Batch uploaded: ${uploadData.handles.length} products (total: ${synced})`);
          } else if (uploadData.num_received && uploadData.num_received > 0) {
            // Alternative response format
            synced += uploadData.num_received;
            console.log(`[Sync] ✅ Batch uploaded: ${uploadData.num_received} products (total: ${synced})`);
          } else if (uploadData.num_invalid_entries !== undefined) {
            // Check for invalid entries
            failed += uploadData.num_invalid_entries || 0;
            console.error(`[Sync] ❌ Invalid entries: ${uploadData.num_invalid_entries}`);
            
            if (uploadData.num_invalid_entries > 0 && uploadData.num_invalid_entries === batch.length) {
              errors.push(`All ${batch.length} products in batch were rejected. Check product data format.`);
            }
          } else {
            console.log(`[Sync] ⚠️ Unexpected response format. Full response:`, uploadData);
            errors.push(`Unexpected API response format. Response: ${JSON.stringify(uploadData).substring(0, 200)}`);
          }
          
        } catch (fetchError: any) {
          console.error(`[Sync] ❌ Fetch error:`, fetchError);
          errors.push(`Network error: ${fetchError.message}`);
          throw fetchError; // Re-throw to trigger error handling
        }
      }

      console.log(`[Sync] ✅ Sync complete! Total synced: ${synced} products, Failed: ${failed}`);
      
      // If no products synced, provide detailed error
      if (synced === 0 && fbProducts.length > 0) {
        const errorMessage = errors.length > 0 
          ? `Failed to sync products. Errors: ${errors.join('; ')}` 
          : `Failed to sync products. Facebook API did not accept any products. Check: 1) Access token is valid, 2) Catalog ID is correct, 3) Product data format is valid.`;
        
        console.error(`[Sync] ❌ ${errorMessage}`);
        
        await prisma.facebookCatalog.update({ 
          where: { id }, 
          data: { syncStatus: "error" } 
        });
        
        return Response.json({ 
          error: errorMessage,
          catalog: {
            id: catalog.id,
            syncStatus: "error",
          }
        }, { status: 400 });
      }

      console.log(`[Sync] ✅ Sync complete! Total synced: ${synced} products`);

      const updatedCatalog = await prisma.facebookCatalog.update({
        where: { id },
        data: { 
          productCount: synced, 
          lastSync: new Date(), 
          nextSync: new Date(Date.now() + 5 * 24 * 60 * 60 * 1000), 
          syncStatus: "synced" 
        },
      });

      return Response.json({ 
        success: true, 
        message: `Synced ${synced} products!`,
        catalog: {
          id: updatedCatalog.id,
          catalogId: updatedCatalog.catalogId,
          name: updatedCatalog.name,
          pixelId: updatedCatalog.pixelId,
          pixelEnabled: updatedCatalog.pixelEnabled,
          autoSync: updatedCatalog.autoSync,
          productCount: updatedCatalog.productCount,
          lastSync: updatedCatalog.lastSync?.toISOString(),
          nextSync: updatedCatalog.nextSync?.toISOString(),
          syncStatus: updatedCatalog.syncStatus,
        }
      });
    } catch (e: any) {
      console.error(`[Sync] ❌ Error during sync:`, e);
      await prisma.facebookCatalog.update({ 
        where: { id }, 
        data: { syncStatus: "error" } 
      });
      return Response.json({ error: e.message }, { status: 500 });
    }
  }

  // Toggle autosync
  if (intent === "toggle-autosync") {
    const id = formData.get("id") as string;
    const enabled = formData.get("enabled") === "true";
    
    if (!id) {
      return Response.json({ error: "Catalog ID required" }, { status: 400 });
    }
    
    const catalog = await prisma.facebookCatalog.update({ 
      where: { id }, 
      data: { autoSync: enabled } 
    });
    
    // If enabling autosync, trigger immediate sync via the sync endpoint
    if (enabled) {
      console.log(`[AutoSync] Enabled for catalog ${id}, will trigger sync...`);
      
      // Return immediately, let client trigger sync
      return Response.json({ 
        success: true,
        catalog: {
          id: catalog.id,
          autoSync: catalog.autoSync,
        },
        triggerSync: true, // Signal to client to trigger sync
        message: "AutoSync enabled. Click 'Sync' or wait for automatic sync."
      });
    }
    
    return Response.json({ 
      success: true,
      catalog: {
        id: catalog.id,
        autoSync: catalog.autoSync,
      }
    });
  }

  // Toggle pixel
  if (intent === "toggle-pixel") {
    const id = formData.get("id") as string;
    const enabled = formData.get("enabled") === "true";
    
    if (!id) {
      return Response.json({ error: "Catalog ID required" }, { status: 400 });
    }
    
    const catalog = await prisma.facebookCatalog.update({ 
      where: { id }, 
      data: { pixelEnabled: enabled } 
    });
    
    return Response.json({ 
      success: true,
      catalog: {
        id: catalog.id,
        pixelEnabled: catalog.pixelEnabled,
      }
    });
  }

  // Delete catalog
  if (intent === "delete-catalog") {
    const id = formData.get("id") as string;
    
    if (!id) {
      return Response.json({ error: "Catalog ID required" }, { status: 400 });
    }
    
    await prisma.facebookCatalog.delete({ where: { id } });
    
    return Response.json({ 
      success: true, 
      message: "Catalog deleted successfully" 
    });
  }

  return Response.json({ error: "Invalid action" }, { status: 400 });
};

// Helper function to format product for Facebook
function makeFbProduct(product: any, variant: any, productId: string, shop: string) {
  const variantId = variant.id.split("/").pop();
  const retailerId = variant.sku || `${productId}_${variantId}`;
  
  return {
    method: "UPDATE",
    retailer_id: retailerId,
    data: {
      id: retailerId,
      title: variant.title !== "Default Title" 
        ? `${product.title} - ${variant.title}` 
        : product.title,
      description: product.description?.substring(0, 5000) || product.title,
      availability: (variant.inventoryQuantity || 0) > 0 ? "in stock" : "out of stock",
      condition: "new",
      price: `${variant.price} USD`,
      link: product.onlineStoreUrl || `https://${shop}/products/${product.handle}`,
      image_link: product.featuredImage?.url || "",
      brand: product.vendor || shop.replace(".myshopify.com", ""),
      item_group_id: productId,
    },
  };
}
