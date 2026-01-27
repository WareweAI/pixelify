import type { ActionFunctionArgs } from "react-router";
import { getShopifyInstance } from "../shopify.server";
import { checkThemeExtensionStatus } from "../services/theme-extension-check.server";

export async function action({ request }: ActionFunctionArgs) {
  const shopify = getShopifyInstance();

  if (!shopify?.authenticate) {
    return Response.json({ 
      isEnabled: false, 
      error: "Shopify configuration not found" 
    }, { status: 500 });
  }

  try {
    const { session, admin } = await shopify.authenticate.admin(request);
    const formData = await request.formData();
    const intent = formData.get("intent") as string;

    if (intent !== "check-theme-extension") {
      return Response.json({ 
        isEnabled: false, 
        error: "Invalid intent" 
      }, { status: 400 });
    }

    console.log(`[ThemeExtensionStatus] Checking extension status for shop: ${session.shop}`);

    // Check theme extension status
    const extensionStatus = await checkThemeExtensionStatus(admin);
    
    console.log(`[ThemeExtensionStatus] Extension status:`, extensionStatus);

    // Get theme name for better UX
    let themeName = "your published theme";
    try {
      const themesResponse = await admin.graphql(`
        query {
          themes(first: 10) {
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
      const publishedTheme = themesData.data?.themes?.edges?.find(
        (edge: any) => edge.node.role === "MAIN"
      );

      if (publishedTheme) {
        themeName = publishedTheme.node.name;
      }
    } catch (themeError) {
      console.warn("[ThemeExtensionStatus] Could not fetch theme name:", themeError);
    }

    return Response.json({
      isEnabled: extensionStatus.isEnabled,
      themeName,
      extensionId: extensionStatus.extensionId,
      error: extensionStatus.error
    });

  } catch (error) {
    console.error("[ThemeExtensionStatus] Error checking extension status:", error);
    
    return Response.json({ 
      isEnabled: false, 
      error: error instanceof Error ? error.message : "Unknown error" 
    }, { status: 500 });
  }
}

// For GET requests, return method not allowed
export async function loader() {
  return Response.json({ 
    error: "Method not allowed" 
  }, { status: 405 });
}