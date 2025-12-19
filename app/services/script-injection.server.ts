import { getShopifyInstance } from "../shopify.server";
import prisma from "../db.server";

export interface ScriptInjectionOptions {
  appId: string;
  shop: string;
  scriptUrl: string;
  scriptName?: string;
  enabled?: boolean;
}

export interface ThemeScriptOptions {
  appId: string;
  pixelId: string;
  autoTrackPageviews?: boolean;
  autoTrackClicks?: boolean;
  autoTrackScroll?: boolean;
  customEvents?: Array<{
    name: string;
    selector: string;
    eventType: string;
  }>;
}


export async function injectPixelScript(
  adminContext: { admin: any; session: any },
  options: ThemeScriptOptions
): Promise<{ success: boolean; scriptTagId?: string; error?: string }> {
  try {
    const { admin, session } = adminContext;

    const baseUrl = process.env.SHOPIFY_APP_URL || "https://pixel-warewe.vercel.app";
    const scriptUrl = `${baseUrl}/pixel.js?id=${options.pixelId}&auto_pageview=${options.autoTrackPageviews}&auto_clicks=${options.autoTrackClicks}&auto_scroll=${options.autoTrackScroll}`;

    const scriptTagResponse = await fetch(`https://${session.shop}/admin/api/2024-10/script_tags.json`, {
      method: 'POST',
      headers: {
        'X-Shopify-Access-Token': session.accessToken,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        script_tag: {
          src: scriptUrl,
          event: "onload",
          display_scope: "online_store",
        }
      })
    });

    if (!scriptTagResponse.ok) {
      if (scriptTagResponse.status === 403) {
        throw new Error("Failed to create script tag: Forbidden. The app is missing the 'write_script_tags' access scope. Please update app scopes and reinstall.");
      }
      throw new Error(`Failed to create script tag: ${scriptTagResponse.statusText}`);
    }

    const scriptTagData = await scriptTagResponse.json();
    const scriptTag = scriptTagData.script_tag;

    // Save script injection record
    if (prisma && prisma.scriptInjection) {
      await prisma.scriptInjection.create({
        data: {
          appId: options.appId,
          shop: session.shop,
          scriptTagId: scriptTag.id?.toString() || "",
          scriptUrl,
          enabled: true,
          config: {
            autoTrackPageviews: options.autoTrackPageviews,
            autoTrackClicks: options.autoTrackClicks,
            autoTrackScroll: options.autoTrackScroll,
            customEvents: options.customEvents || [],
          },
        },
      });
    }

    return {
      success: true,
      scriptTagId: scriptTag.id?.toString(),
    };
  } catch (error: any) {
    console.error("Script injection failed:", error);
    return {
      success: false,
      error: error.message || "Failed to inject script",
    };
  }
}


export async function removePixelScript(
  adminContext: { admin: any; session: any },
  appId: string
): Promise<{ success: boolean; error?: string }> {
  try {
    const { admin, session } = adminContext;

    // Find script injection record
    if (!prisma || !prisma.scriptInjection) {
      return { success: false, error: "Database not available" };
    }

    const injection = await prisma.scriptInjection.findFirst({
      where: {
        appId,
        shop: session.shop,
        enabled: true,
      },
    });

    if (!injection) {
      return { success: true }; // Already removed
    }

    // Remove script tag from Shopify
    if (injection.scriptTagId) {
      try {
        const deleteResponse = await fetch(`https://${session.shop}/admin/api/2024-10/script_tags/${injection.scriptTagId}.json`, {
          method: 'DELETE',
          headers: {
            'X-Shopify-Access-Token': session.accessToken,
            'Content-Type': 'application/json',
          },
        });

        if (!deleteResponse.ok && deleteResponse.status !== 404) {
          console.warn("Failed to delete script tag from Shopify:", deleteResponse.statusText);
        }
      } catch (error) {
        console.warn("Script tag already removed from Shopify:", error);
      }
    }

    // Update injection record
    await prisma.scriptInjection.update({
      where: { id: injection.id },
      data: { enabled: false },
    });

    return { success: true };
  } catch (error: any) {
    console.error("Script removal failed:", error);
    return {
      success: false,
      error: error.message || "Failed to remove script",
    };
  }
}

/**
 * Update script configuration
 */
export async function updateScriptConfig(
  appId: string,
  shop: string,
  config: Partial<ThemeScriptOptions>
): Promise<{ success: boolean; error?: string }> {
  try {
    const injection = await prisma.scriptInjection.findFirst({
      where: { appId, shop, enabled: true },
      });

    if (!injection) {
      return { success: false, error: "Script injection not found" };
    }

    // Update configuration
    await prisma.scriptInjection.update({
      where: { id: injection.id },
      data: {
        config: {
          ...(typeof injection.config === "object" && injection.config !== null ? injection.config : {}),
          ...(config || {}),
        },
      },
    });

    return { success: true };
  } catch (error: any) {
    console.error("Script config update failed:", error);
    return {
      success: false,
      error: error.message || "Failed to update script config",
    };
  }
}

/**
 * Get script injection status
 */
export async function getScriptInjectionStatus(
  appId: string,
  shop: string
): Promise<{
  injected: boolean;
  scriptTagId?: string;
  config?: any;
  error?: string;
}> {
  try {
    if (!prisma || !prisma.scriptInjection) {
      console.error("Prisma client or scriptInjection model not available");
      return {
        injected: false,
        error: "Database not available",
      };
    }

    const injection = await prisma.scriptInjection.findFirst({
      where: { appId, shop, enabled: true },
    });

    return {
      injected: !!injection,
      scriptTagId: injection?.scriptTagId || undefined,
      config: injection?.config,
    };
  } catch (error: any) {
    console.error("Failed to get script status:", error);
    return {
      injected: false,
      error: error.message || "Failed to get script status",
    };
  }
}

/**
 * Create custom event configuration
 */
export async function createCustomEvent(
  appId: string,
  eventConfig: {
    name: string;
    displayName: string;
    selector: string;
    eventType: string;
    metaEventName?: string;
    description?: string;
  }
): Promise<{ success: boolean; eventId?: string; error?: string }> {
  try {
    if (!prisma || !prisma.app || !prisma.customEvent) {
      return { success: false, error: "Database not available" };
    }

    // Find the app
    const app = await prisma.app.findUnique({
      where: { appId },
      select: { id: true },
    });

    if (!app) {
      return { success: false, error: "App not found" };
    }

    // Check if event with this name already exists for this app
    const existingEvent = await prisma.customEvent.findUnique({
      where: {
        appId_name: {
          appId: app.id,
          name: eventConfig.name,
        },
      },
    });

    if (existingEvent) {
      // If event exists and is active, return error
      if (existingEvent.isActive) {
        return {
          success: false,
          error: `Event with name "${eventConfig.name}" already exists for this app`,
        };
      }
      // If event exists but is inactive, reactivate and update it
      const customEvent = await prisma.customEvent.update({
        where: { id: existingEvent.id },
        data: {
          displayName: eventConfig.displayName,
          selector: eventConfig.selector,
          eventType: eventConfig.eventType,
          metaEventName: eventConfig.metaEventName,
          description: eventConfig.description,
          isActive: true,
        },
      });

      return {
        success: true,
        eventId: customEvent.id,
      };
    }

    // Create custom event
    const customEvent = await prisma.customEvent.create({
      data: {
        appId: app.id,
        name: eventConfig.name,
        displayName: eventConfig.displayName,
        selector: eventConfig.selector,
        eventType: eventConfig.eventType,
        metaEventName: eventConfig.metaEventName,
        description: eventConfig.description,
        isActive: true,
      },
    });

    return {
      success: true,
      eventId: customEvent.id,
    };
  } catch (error: any) {
    console.error("Custom event creation failed:", error);
    
    // Handle Prisma unique constraint error
    if (error.code === "P2002" && error.meta?.target?.includes("name")) {
      return {
        success: false,
        error: `Event with name "${eventConfig.name}" already exists for this app`,
      };
    }
    
    return {
      success: false,
      error: error.message || "Failed to create custom event",
    };
  }
}



/**
 * Generate drag-and-drop event builder HTML
 */
export function generateEventBuilderHTML(): string {
  return `
<!-- Pixel Event Builder (Theme Editor Only) -->
<script>
  if (window.Shopify && window.Shopify.designMode) {
    // Event builder functionality for theme editor
    window.PixelEventBuilder = {
      addEvent: function(element, eventName, eventData) {
        element.setAttribute('data-pixel-event', eventName);
        if (eventData.value) element.setAttribute('data-pixel-value', eventData.value);
        if (eventData.currency) element.setAttribute('data-pixel-currency', eventData.currency);
        if (eventData.product) element.setAttribute('data-pixel-product', eventData.product);
        if (eventData.productName) element.setAttribute('data-pixel-product-name', eventData.productName);
        if (eventData.category) element.setAttribute('data-pixel-category', eventData.category);
        
        // Visual feedback
        element.style.outline = '2px dashed #00ff00';
        element.title = 'Pixel Event: ' + eventName;
      },
      
      removeEvent: function(element) {
        element.removeAttribute('data-pixel-event');
        element.removeAttribute('data-pixel-value');
        element.removeAttribute('data-pixel-currency');
        element.removeAttribute('data-pixel-product');
        element.removeAttribute('data-pixel-product-name');
        element.removeAttribute('data-pixel-category');
        element.style.outline = '';
        element.title = '';
      }
    };
  }
</script>`;
}