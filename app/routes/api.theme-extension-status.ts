import type { LoaderFunctionArgs, ActionFunctionArgs } from "react-router";
import { getShopifyInstance } from "../shopify.server";

// Extension configuration from shopify.app.toml and shopify.extension.toml
const APP_CLIENT_ID = "22e1740803c975ae11fd5bc9b23c7dd4";
const EXTENSION_HANDLE = "pixelify-tracker";

async function checkThemeExtensionStatus(shop: string, admin: any, session: any) {
  try {
    console.log('[Theme Extension Status] Checking status for shop:', shop);
    
    // Get the main theme using GraphQL
    const themesResponse = await admin.graphql(`
      query {
        themes(first: 100) {
          edges {
            node {
              id
              name
              role
            }
          }
        }
      }
    `);

    const themesData = await themesResponse.json();
    const themes = themesData.data?.themes?.edges || [];
    const mainTheme = themes.find((edge: any) => edge.node.role === "MAIN");

    if (!mainTheme) {
      console.log('[Theme Extension Status] No main theme found');
      return {
        isEnabled: false,
        enabled: false,
        reason: "No main theme found",
        appInstalled: false
      };
    }

    const themeGid = mainTheme.node.id;
    const themeId = themeGid.split('/').pop(); // Extract numeric ID from GID
    console.log('[Theme Extension Status] Main theme GID:', themeGid);
    console.log('[Theme Extension Status] Main theme ID:', themeId);
    console.log('[Theme Extension Status] Main theme name:', mainTheme.node.name);

    // Fetch the theme's settings_data.json using REST API with fetch
    const settingsUrl = `https://${shop}/admin/api/2025-01/themes/${themeId}/assets.json?asset[key]=config/settings_data.json`;
    console.log('[Theme Extension Status] Fetching settings from:', settingsUrl);
    
    const settingsResponse = await fetch(settingsUrl, {
      method: 'GET',
      headers: {
        'X-Shopify-Access-Token': session.accessToken,
        'Content-Type': 'application/json',
      },
    });

    if (!settingsResponse.ok) {
      console.error('[Theme Extension Status] Failed to fetch settings:', settingsResponse.status, settingsResponse.statusText);
      return {
        isEnabled: false,
        enabled: false,
        reason: `Failed to fetch theme settings: ${settingsResponse.statusText}`,
        appInstalled: false,
        error: `HTTP ${settingsResponse.status}: ${settingsResponse.statusText}`
      };
    }

    const settingsJson = await settingsResponse.json();
    const settingsData = JSON.parse(settingsJson.asset.value || '{}');
    const blocks = settingsData?.current?.blocks || {};
    
    console.log('[Theme Extension Status] Total blocks found:', Object.keys(blocks).length);
    console.log('[Theme Extension Status] Looking for client ID:', APP_CLIENT_ID);
    console.log('[Theme Extension Status] Looking for handle:', EXTENSION_HANDLE);

    let ourExtension = null;
    let blockId = null;

    for (const [id, block] of Object.entries(blocks)) {
      const blockData = block as any;
      const blockType = blockData.type || '';
      
      const matchesClientId = blockType.includes(APP_CLIENT_ID);
      const matchesHandle = blockType.includes(EXTENSION_HANDLE);
      
      console.log(`[Theme Extension Status] Checking block ${id}:`);
      console.log(`  - Type: ${blockType}`);
      console.log(`  - Matches Client ID: ${matchesClientId}`);
      console.log(`  - Matches Handle: ${matchesHandle}`);
      console.log(`  - Disabled: ${blockData.disabled}`);
      
      if (matchesClientId || matchesHandle) {
        ourExtension = blockData;
        blockId = id;
        break;
      }
    }

    if (!ourExtension) {
      console.log('[Theme Extension Status] Extension not found in theme');
      const allBlockTypes = Object.values(blocks).map((b: any) => b.type);
      console.log('[Theme Extension Status] Available block types:', allBlockTypes.join(', '));
      
      return {
        isEnabled: false,
        enabled: false,
        reason: "Extension not added to theme",
        appInstalled: true,
        themeId: themeId.toString(),
        deepLinkUrl: generateDeepLink(shop, themeId.toString()),
        note: "Click the link to add the Pixelify Tracker app embed to your theme",
        debug: {
          totalBlocks: Object.keys(blocks).length,
          availableTypes: allBlockTypes,
          searchingForClientId: APP_CLIENT_ID,
          searchingForHandle: EXTENSION_HANDLE
        }
      };
    }

    const isEnabled = !ourExtension.disabled;
    console.log('[Theme Extension Status] Extension found!');
    console.log('[Theme Extension Status] Block ID:', blockId);
    console.log('[Theme Extension Status] Extension type:', ourExtension.type);
    console.log('[Theme Extension Status] Extension disabled flag:', ourExtension.disabled);
    console.log('[Theme Extension Status] Final enabled status:', isEnabled);

    return {
      isEnabled,
      enabled: isEnabled,
      reason: isEnabled ? "Extension is enabled" : "Extension is disabled",
      appInstalled: true,
      themeId: themeId.toString(),
      extensionType: ourExtension.type,
      blockId: blockId,
      deepLinkUrl: !isEnabled ? generateDeepLink(shop, themeId.toString()) : undefined,
      note: !isEnabled ? "Click the link to enable the Pixelify Tracker app embed" : undefined,
      debug: {
        totalBlocks: Object.keys(blocks).length,
        foundExtension: true,
        extensionDisabledFlag: ourExtension.disabled,
        calculatedEnabled: isEnabled
      }
    };

  } catch (error) {
    console.error('[Theme Extension Status] Error:', error);
    console.error('[Theme Extension Status] Error stack:', error instanceof Error ? error.stack : 'No stack trace');
    console.error('[Theme Extension Status] Error details:', JSON.stringify(error, null, 2));
    
    return {
      isEnabled: false,
      enabled: false,
      reason: "Error checking status",
      appInstalled: false,
      error: error instanceof Error ? error.message : 'Unknown error',
      errorDetails: error instanceof Error ? error.stack : String(error),
      debug: {
        errorType: error?.constructor?.name || 'Unknown',
        errorMessage: error instanceof Error ? error.message : String(error)
      }
    };
  }
}

function generateDeepLink(shop: string, themeId: string): string {
  const shopDomain = shop.replace('.myshopify.com', '');
  const encodedActivateAppId = encodeURIComponent(`${APP_CLIENT_ID}/${EXTENSION_HANDLE}`);
  return `https://admin.shopify.com/store/${shopDomain}/themes/${themeId}/editor?context=apps&activateAppId=${encodedActivateAppId}`;
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
  const result = await checkThemeExtensionStatus(shop, admin, session);
  
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
    const result = await checkThemeExtensionStatus(shop, admin, session);
    return Response.json(result);
  }

  return Response.json({ 
    isEnabled: false, 
    enabled: false,
    error: "Invalid intent" 
  });
};