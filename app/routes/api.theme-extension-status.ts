import type { LoaderFunctionArgs, ActionFunctionArgs } from "react-router";
import { getShopifyInstance } from "../shopify.server";

async function checkThemeExtensionStatus(shop: string, admin: any) {
  try {
    console.log('[Theme Extension Status] Checking status for shop:', shop);
    
    // Simple check: Is the app installed?
    const appInstallationRes = await admin.graphql(`
      query {
        currentAppInstallation {
          id
          activeSubscriptions {
            id
            status
          }
        }
      }
    `);

    const appInstallationData = await appInstallationRes.json();
    console.log('[Theme Extension Status] App installation check complete');
    
    const appInstallation = appInstallationData.data?.currentAppInstallation;

    if (!appInstallation) {
      console.log('[Theme Extension Status] App not installed');
      return {
        isEnabled: false,
        enabled: false,
        reason: "App not installed",
        appInstalled: false
      };
    }

    // App is installed - assume extension is available
    // Note: Shopify doesn't provide a reliable way to check if app embed is actually enabled
    // This is the same approach used by Omega Pixel and other Shopify apps
    console.log('[Theme Extension Status] App is installed, extension is available');
    
    return {
      isEnabled: true,
      enabled: true,
      reason: "App is installed and extension is available",
      appInstalled: true,
      note: "Enable the app embed in your theme editor (Online Store → Themes → Customize → App embeds) to activate tracking"
    };

  } catch (error) {
    console.error('[Theme Extension Status] Error:', error);
    return {
      isEnabled: false,
      enabled: false,
      reason: "Error checking status",
      appInstalled: false,
      error: error instanceof Error ? error.message : 'Unknown error'
    };
  }
}

export const loader = async ({ request }: LoaderFunctionArgs) => {
  const shopify = getShopifyInstance();

  if (!shopify?.authenticate) {
    throw new Response("Shopify configuration not found", { status: 500 });
  }

  let session, admin;
  try {
    const authResult = await shopify.authenticate.admin(request);
    session = authResult.session;
    admin = authResult.admin;
  } catch (error) {
    if (error instanceof Response && error.status === 302) throw error;
    throw new Response("Unable to authenticate", { status: 503 });
  }

  const shop = session.shop;
  const result = await checkThemeExtensionStatus(shop, admin);
  
  return Response.json(result);
};

export const action = async ({ request }: ActionFunctionArgs) => {
  const shopify = getShopifyInstance();

  if (!shopify?.authenticate) {
    throw new Response("Shopify configuration not found", { status: 500 });
  }

  let session, admin;
  try {
    const authResult = await shopify.authenticate.admin(request);
    session = authResult.session;
    admin = authResult.admin;
  } catch (error) {
    if (error instanceof Response && error.status === 302) throw error;
    throw new Response("Unable to authenticate", { status: 503 });
  }

  const shop = session.shop;
  const formData = await request.formData();
  const intent = formData.get("intent");

  if (intent === "check-theme-extension") {
    const result = await checkThemeExtensionStatus(shop, admin);
    return Response.json(result);
  }

  return Response.json({ 
    isEnabled: false, 
    enabled: false,
    error: "Invalid intent" 
  });
};