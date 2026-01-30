import type { LoaderFunctionArgs } from "react-router";
import { getShopifyInstance } from "../shopify.server";
import { STORE_PAGES_QUERY } from "../lib/queries";

export const loader = async ({ request }: LoaderFunctionArgs) => {
  const shopify = getShopifyInstance();

  if (!shopify?.authenticate) {
    return Response.json({ error: "Shopify not configured" }, { status: 500 });
  }

  // Helper function for system pages
  const getSystemPages = () => [
    { label: "Home Page", value: "/", type: "system" },
    { label: "All Products Page", value: "/products", type: "system" },
    { label: "All Collections Page", value: "/collections", type: "system" },
    { label: "Cart Page", value: "/cart", type: "system" },
    { label: "Checkout Page", value: "/checkout", type: "system" },
    { label: "Thank You Page", value: "/thank_you", type: "system" },
    { label: "Account Page", value: "/account", type: "system" },
    { label: "Login Page", value: "/account/login", type: "system" },
    { label: "Register Page", value: "/account/register", type: "system" },
    { label: "Order History", value: "/account/orders", type: "system" },
    { label: "Search Page", value: "/search", type: "system" },
    { label: "Any Product Page", value: "/products/*", type: "system" },
    { label: "Any Collection Page", value: "/collections/*", type: "system" },
    { label: "Any Blog Post", value: "/blogs/*", type: "system" },
    { label: "Any Custom Page", value: "/pages/*", type: "system" },
  ];

  try {
    // Only authenticate with Shopify, don't use database
    const { admin, session } = await shopify.authenticate.admin(request);

    console.log(`[Store Pages API] Fetching store content for shop: ${session.shop}`);

    // Get system pages (always available)
    const systemPages = getSystemPages();

    // Fetch collections and products from Shopify (no database needed)
    const response = await admin.graphql(STORE_PAGES_QUERY);
    const data = await response.json() as any;

    if (data.errors) {
      console.error("[Store Pages API] GraphQL errors:", data.errors);
      // Return system pages only if there's an error
      return Response.json({
        pages: systemPages,
        warning: "Could not fetch collections and products from Shopify. Only system pages are available.",
      });
    }

    const collections = data.data.collections.edges.map((edge: any) => ({
      label: edge.node.title,
      value: `/collections/${edge.node.handle}`,
      type: "collection",
      collectionId: edge.node.id,
    }));

    const products = data.data.products.edges.map((edge: any) => ({
      label: edge.node.title,
      value: `/products/${edge.node.handle}`,
      type: "product",
      productId: edge.node.id,
    }));

    // Combine all pages
    const allPages = [
      ...systemPages,
      ...collections,
      ...products,
    ];

    console.log(`[Store Pages API] Found ${systemPages.length} system pages, ${collections.length} collections, ${products.length} products`);
    console.log(`[Store Pages API] Total pages: ${allPages.length}`);

    return Response.json({
      pages: allPages,
      breakdown: {
        system: systemPages.length,
        collections: collections.length,
        products: products.length,
        total: allPages.length,
      },
    });
  } catch (error) {
    console.error("[Store Pages API] Error:", error);
    
    // Return system pages as fallback
    const systemPages = getSystemPages();

    return Response.json({
      pages: systemPages,
      error: "Failed to fetch store content from Shopify. Using system pages only.",
      details: error instanceof Error ? error.message : "Unknown error",
    });
  }
};