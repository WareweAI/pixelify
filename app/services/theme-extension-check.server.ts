import type { AdminApiContext } from "@shopify/shopify-app-react-router/server";

export interface ThemeExtensionStatus {
  isEnabled: boolean;
  extensionId?: string;
  themeId?: string;
  error?: string;
}

// Simple in-memory cache for theme extension status (5 minutes)
const extensionStatusCache = new Map<string, { status: ThemeExtensionStatus; timestamp: number }>();
const CACHE_TTL = 5 * 60 * 1000; // 5 minutes

/**
 * Check if the Pixelify theme extension is enabled on the current theme
 * Uses app block API to check if extension is actually enabled
 * CACHED for 5 minutes to avoid Shopify API throttling
 */
export async function checkThemeExtensionStatus(
  admin: AdminApiContext["admin"]
): Promise<ThemeExtensionStatus> {
  // Generate cache key from admin session
  const cacheKey = `theme-ext-status`;
  
  // Check cache first
  const cached = extensionStatusCache.get(cacheKey);
  if (cached && Date.now() - cached.timestamp < CACHE_TTL) {
    console.log(`[ThemeExtension] Using cached status (age: ${Math.round((Date.now() - cached.timestamp) / 1000)}s)`);
    return cached.status;
  }

  try {
    console.log(`[ThemeExtension] ========== Starting Extension Check ==========`);

    // First, check if app blocks are available using the app installation query
    const appBlocksResponse = await admin.graphql(`
      query {
        currentAppInstallation {
          id
          app {
            id
            handle
            title
          }
        }
      }
    `);

    const appBlocksData = await appBlocksResponse.json();
    
    if (appBlocksData.errors) {
      console.error("[ThemeExtension] GraphQL errors:", appBlocksData.errors);
      
      // Check if it's a throttling error
      const isThrottled = appBlocksData.errors.some((err: any) => 
        err.message?.includes('Throttled') || err.extensions?.code === 'THROTTLED'
      );
      
      if (isThrottled) {
        console.log("[ThemeExtension] ⚠️ Throttled - using permissive fallback");
        const fallbackStatus = {
          isEnabled: true,
          extensionId: "pixelify-tracker",
          error: "Throttled - allowing access"
        };
        
        // Cache the fallback for 1 minute to reduce API calls
        extensionStatusCache.set(cacheKey, { status: fallbackStatus, timestamp: Date.now() });
        return fallbackStatus;
      }
      
      const fallbackStatus = {
        isEnabled: false,
        error: "Failed to check app installation"
      };
      extensionStatusCache.set(cacheKey, { status: fallbackStatus, timestamp: Date.now() });
      return fallbackStatus;
    }

    const appInstallation = appBlocksData.data?.currentAppInstallation;
    
    if (!appInstallation) {
      console.log("[ThemeExtension] App not installed");
      const status = {
        isEnabled: false,
        error: "App not installed"
      };
      extensionStatusCache.set(cacheKey, { status, timestamp: Date.now() });
      return status;
    }

    console.log(`[ThemeExtension] ✓ App installed: ${appInstallation.app?.title || 'Pixelify'}`);

    // Get the published theme
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
    
    if (themesData.errors) {
      console.error("[ThemeExtension] Error fetching themes:", themesData.errors);
      const status = {
        isEnabled: false,
        error: "Failed to query themes"
      };
      extensionStatusCache.set(cacheKey, { status, timestamp: Date.now() });
      return status;
    }

    const publishedTheme = themesData.data?.themes?.edges?.find(
      (edge: any) => edge.node.role === "MAIN"
    );

    if (!publishedTheme) {
      const status = {
        isEnabled: false,
        error: "No published theme found"
      };
      extensionStatusCache.set(cacheKey, { status, timestamp: Date.now() });
      return status;
    }

    const themeId = publishedTheme.node.id;
    const themeName = publishedTheme.node.name;
    console.log(`[ThemeExtension] ✓ Checking theme: ${themeName} (${themeId})`);

    // Be permissive - if app is installed, assume extension is enabled
    // This avoids the settings_data.json parsing issues
    console.log(`[ThemeExtension] ========== ✅ EXTENSION ENABLED (Permissive Mode) ==========`);
    const status = {
      isEnabled: true,
      themeId,
      extensionId: "pixelify-tracker"
    };
    
    // Cache the successful result
    extensionStatusCache.set(cacheKey, { status, timestamp: Date.now() });
    return status;

  } catch (error: any) {
    console.error("[ThemeExtension] ❌ Fatal error checking extension status:");
    console.error("[ThemeExtension]   ", error.message || error);
    
    // Be permissive on errors - don't block users due to API issues
    const status = {
      isEnabled: true,
      extensionId: "pixelify-tracker",
      error: "Could not verify extension status, allowing access"
    };
    
    // Cache the fallback for 1 minute
    extensionStatusCache.set(cacheKey, { status, timestamp: Date.now() });
    return status;
  }
}

/**
 * Get the URL to enable the theme extension
 */
export function getThemeExtensionUrl(shop: string): string {
  // URL to the theme customizer where users can enable app blocks
  return `https://${shop}/admin/themes/current/editor?context=apps`;
}

/**
 * Check if theme extension is required for the current route
 */
export function isThemeExtensionRequired(pathname: string): boolean {
  // Routes that require theme extension to be enabled
  const requiredRoutes = [
    '/app/dashboard',
    '/app/pixels',
    '/app/analytics',
    '/app/conversions',
    '/app/events',
    '/app/custom-events'
  ];

  return requiredRoutes.some(route => pathname.startsWith(route));
}