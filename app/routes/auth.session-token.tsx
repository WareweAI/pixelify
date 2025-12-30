import type { LoaderFunctionArgs } from "react-router";
import { getShopifyInstance } from "../shopify.server";

export const loader = async ({ request }: LoaderFunctionArgs) => {
  try {
    const shopify = getShopifyInstance();
    
    // Handle session token authentication - this should complete the auth flow
    const { session } = await shopify.authenticate.admin(request);
    
    // If authentication succeeds, redirect to the original destination
    const url = new URL(request.url);
    const shopifyReload = url.searchParams.get('shopify-reload');
    
    if (shopifyReload) {
      // Redirect to the original page that was requested
      return new Response(null, {
        status: 302,
        headers: {
          Location: shopifyReload,
        },
      });
    }
    
    // Default redirect to dashboard
    return new Response(null, {
      status: 302,
      headers: {
        Location: '/app/dashboard',
      },
    });
  } catch (error) {
    console.error("Session token authentication failed:", error);
    
    // If session token auth fails, redirect to login
    return new Response(null, {
      status: 302,
      headers: {
        Location: '/auth/login',
      },
    });
  }
};

export default function SessionToken() {
  return null;
}