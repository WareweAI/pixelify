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
    const chargeId = url.searchParams.get('charge_id');
    
    if (shopifyReload) {
      // Preserve charge_id if present
      const reloadUrl = new URL(shopifyReload, request.url);
      if (chargeId) {
        reloadUrl.searchParams.set('charge_id', chargeId);
      }
      // Redirect to the original page that was requested
      return new Response(null, {
        status: 302,
        headers: {
          Location: reloadUrl.toString(),
        },
      });
    }
    
    // Default redirect to dashboard, preserve charge_id if present
    const dashboardUrl = chargeId ? `/app/dashboard?charge_id=${chargeId}` : '/app/dashboard';
    return new Response(null, {
      status: 302,
      headers: {
        Location: dashboardUrl,
      },
    });
  } catch (error) {
    console.error("Session token authentication failed:", error);
    
    // If session token auth fails, preserve charge_id in login redirect
    const url = new URL(request.url);
    const chargeId = url.searchParams.get('charge_id');
    const loginUrl = chargeId ? `/auth/login?charge_id=${chargeId}` : '/auth/login';
    
    return new Response(null, {
      status: 302,
      headers: {
        Location: loginUrl,
      },
    });
  }
};

export default function SessionToken() {
  return null;
}