import type { LoaderFunctionArgs } from "react-router";
import { getShopifyInstance } from "../shopify.server";
import { STORE_PAGES_QUERY } from "~/lib/queries";

export const loader = async ({ request }: LoaderFunctionArgs) => {
  const shopify = getShopifyInstance();

  if (!shopify?.authenticate) {
    return Response.json({ 
      success: true, 
      pages: getSystemPages(),
      warning: "Shopify not configured" 
    });
  }

  try {
    const { admin } = await shopify.authenticate.admin(request);

    console.log('[Shopify Pages API] Fetching collections and products...');

    // Fetch collections and products from Shopify
    const response = await admin.graphql(STORE_PAGES_QUERY);
    const data = await response.json();

    if (data.errors) {
      console.error("[Shopify Pages API] GraphQL errors:", data.errors);
      // Return system pages even if GraphQL fails
      return Response.json({
        success: true,
        pages: getSystemPages(),
        shopName: data.data?.shop?.name || 'Store',
        warning: 'Could not fetch collections/products from Shopify'
      });
    }

    const pages = [];

    // Add system pages first (always available)
    pages.push(...getSystemPages());

    // Add collections
    const collections = data.data?.collections?.edges || [];
    console.log(`[Shopify Pages API] Found ${collections.length} collections`);
    collections.forEach((edge: any) => {
      pages.push({
        label: edge.node.title,
        value: `/collections/${edge.node.handle}`,
        type: "collection",
        id: edge.node.id,
      });
    });

    // Add products
    const products = data.data?.products?.edges || [];
    console.log(`[Shopify Pages API] Found ${products.length} products`);
    products.forEach((edge: any) => {
      pages.push({
        label: edge.node.title,
        value: `/products/${edge.node.handle}`,
        type: "product",
        id: edge.node.id,
      });
    });

    console.log(`[Shopify Pages API] ✅ Total: ${pages.length} pages (${getSystemPages().length} system + ${collections.length} collections + ${products.length} products)`);

    return Response.json({
      success: true,
      pages: pages,
      shopName: data.data?.shop?.name,
    });
  } catch (error: any) {
    console.error("[Shopify Pages API] Error:", error);
    
    // Always return system pages as fallback
    return Response.json({
      success: true,
      pages: getSystemPages(),
      shopName: 'Store',
      warning: error.message || 'Could not fetch from Shopify'
    });
  }
};

// Helper function to get system pages (URL patterns)
function getSystemPages() {
  return [
    // Special option
    { label: "All Pages", value: "all", type: "system" },
    
    // Main store pages
    { label: "Home Page", value: "/", type: "system" },
    { label: "All Products Page", value: "/products", type: "system" },
    { label: "All Collections Page", value: "/collections", type: "system" },
    
    // Shopping flow
    { label: "Cart Page", value: "/cart", type: "system" },
    { label: "Checkout Page", value: "/checkout", type: "system" },
    { label: "Thank You Page", value: "/thank_you", type: "system" },
    
    // Customer pages
    { label: "Account Page", value: "/account", type: "system" },
    { label: "Login Page", value: "/account/login", type: "system" },
    { label: "Register Page", value: "/account/register", type: "system" },
    { label: "Order History", value: "/account/orders", type: "system" },
    
    // Search & Browse
    { label: "Search Page", value: "/search", type: "system" },
    
    // Wildcard patterns for dynamic pages
    { label: "Any Product Page", value: "/products/*", type: "system" },
    { label: "Any Collection Page", value: "/collections/*", type: "system" },
    { label: "Any Blog Post", value: "/blogs/*", type: "system" },
    { label: "Any Custom Page", value: "/pages/*", type: "system" },
  ];
}

