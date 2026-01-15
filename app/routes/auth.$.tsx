
import type { HeadersFunction, LoaderFunctionArgs } from "react-router";
import { redirect } from "react-router";
import { getShopifyInstance } from "../shopify.server";
import { boundary } from "@shopify/shopify-app-react-router/server";

export const loader = async ({ request }: LoaderFunctionArgs) => {
  const url = new URL(request.url);
  const chargeId = url.searchParams.get('charge_id');
  const shopify = getShopifyInstance();
  
  console.log(`[Auth.$] Request path: ${url.pathname}, charge_id: ${chargeId}`);
  
  try {
    await shopify.authenticate.admin(request);
    
    // If authenticated and we have charge_id, redirect to dashboard
    if (chargeId) {
      console.log(`[Auth.$] Authenticated with charge_id: ${chargeId}, redirecting to dashboard`);
      throw redirect(`/app/dashboard?charge_id=${chargeId}`);
    }
    
    // If authenticated without charge_id, redirect to dashboard
    console.log(`[Auth.$] Authenticated, redirecting to dashboard`);
    throw redirect('/app/dashboard');
  } catch (error) {
    if (error instanceof Response) {
      const status = error.status;
      const location = error.headers.get('location') || error.headers.get('Location');
      
      // Handle redirects
      if ((status === 302 || status === 307) && location) {
        // Preserve charge_id in the redirect
        let finalLocation = location;
        if (chargeId && !location.includes('charge_id')) {
          const separator = location.includes('?') ? '&' : '?';
          finalLocation = `${location}${separator}charge_id=${chargeId}`;
        }
        
        console.log(`[Auth.$] Redirect to: ${finalLocation}`);
        
        // For embedded apps, use JavaScript redirect
        return new Response(
          `<html><body><script>window.top.location.href = '${finalLocation.replace(/'/g, "\\'")}';</script></body></html>`,
          {
            headers: { 'Content-Type': 'text/html' },
          }
        );
      }
      
      throw error;
    }
    throw error;
  }
};

export const headers: HeadersFunction = (headersArgs) => {
  return boundary.headers(headersArgs);
};

export default function AuthCatchAll() {
    return null;
}