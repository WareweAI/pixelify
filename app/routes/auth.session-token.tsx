import type { LoaderFunctionArgs } from "react-router";
import { getShopifyInstance } from "../shopify.server";

export const loader = async ({ request }: LoaderFunctionArgs) => {
  try {
    const shopify = getShopifyInstance();
    const url = new URL(request.url);
    const chargeId = url.searchParams.get('charge_id');
    const shopifyReload = url.searchParams.get('shopify-reload');
    
    // Attempt session token authentication
    const authResult = await shopify.authenticate.admin(request);
    
    // Check if authentication returned a redirect response (indicates failed auth)
    if (authResult instanceof Response) {
      console.warn("Session token authentication returned a redirect response - likely session expired or invalid");
      
      // Always redirect to login for re-authentication
      const loginUrl = chargeId ? `/auth/login?charge_id=${chargeId}&return=${encodeURIComponent(shopifyReload || '/app/dashboard')}` : `/auth/login?return=${encodeURIComponent(shopifyReload || '/app/dashboard')}`;
      
      return new Response(null, {
        status: 302,
        headers: {
          Location: loginUrl,
        },
      });
    }
    
    const { session } = authResult;
    
    // Validate that we have a valid session
    if (!session || !session.shop) {
      console.warn("Session token authentication succeeded but session data is invalid");
      
      const loginUrl = chargeId ? `/auth/login?charge_id=${chargeId}` : '/auth/login';
      return new Response(null, {
        status: 302,
        headers: {
          Location: loginUrl,
        },
      });
    }
    
    // Authentication successful - redirect to original destination or dashboard
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
    console.error("Session token authentication error:", {
      message: error instanceof Error ? error.message : 'Unknown error',
      stack: error instanceof Error ? error.stack : undefined,
      timestamp: new Date().toISOString(),
    });
    
    // Extract URL parameters for retry
    const url = new URL(request.url);
    const chargeId = url.searchParams.get('charge_id');
    const shopifyReload = url.searchParams.get('shopify-reload');
    
    // Redirect to login for re-authentication with optional return URL
    const loginUrl = chargeId 
      ? `/auth/login?charge_id=${chargeId}&return=${encodeURIComponent(shopifyReload || '/app/dashboard')}`
      : `/auth/login?return=${encodeURIComponent(shopifyReload || '/app/dashboard')}`;
    
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