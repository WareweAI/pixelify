  import "@shopify/shopify-app-react-router/adapters/node";
  import {
    ApiVersion,
    AppDistribution,
    shopifyApp,
  } from "@shopify/shopify-app-react-router/server";
  import { PrismaSessionStorage } from "@shopify/shopify-app-session-storage-prisma";
  import prisma from "./db.server";
  import { loadEnv } from "./lib/env-loader.server";

  // Load environment variables immediately
  loadEnv();

  // Helper function to get app URL with fallbacks
  function getAppUrl(): string {
    // Try SHOPIFY_APP_URL first
    if (process.env.SHOPIFY_APP_URL) {
      let url = process.env.SHOPIFY_APP_URL.replace(/^["']|["']$/g, '').trim();
      // Remove trailing slash
      url = url.replace(/\/$/, '');
      if (url && url.length > 0) {
        return url;
      }
    }
    
    // Fallback to VERCEL_URL if available
    if (process.env.VERCEL_URL && process.env.VERCEL_URL.length > 0) {
      const vercelUrl = process.env.VERCEL_URL.replace(/^https?:\/\//, '').replace(/\/$/, '');
      return `https://${vercelUrl}`;
    }
    
    // Hardcoded fallback for pixelify-red.vercel.app
    const fallbackUrl = "https://pixelify-red.vercel.app";
    console.warn(`[Shopify] Using fallback app URL: ${fallbackUrl}`);
    return fallbackUrl;
  }

  // Lazy initialization function
  function initializeShopify() {
    loadEnv();

    const apiKey = process.env.SHOPIFY_API_KEY?.replace(/^["']|["']$/g, '') || '';
    const apiSecret = process.env.SHOPIFY_API_SECRET?.replace(/^["']|["']$/g, '') || '';
    const hasShopifyConfig = Boolean(apiKey && apiSecret);

    if (!hasShopifyConfig) {
      // Only log error in development - in production (Vercel), this is expected if Shopify isn't configured
      const isProduction = process.env.NODE_ENV === 'production' || process.env.VERCEL;
      if (!isProduction) {
        console.error('❌ Shopify config missing:', {
          hasApiKey: !!apiKey,
          hasApiSecret: !!apiSecret,
          apiKeyLength: apiKey.length,
          apiSecretLength: apiSecret.length,
          cwd: process.cwd(),
        });
      }
      return null;
    }

    console.log('✅ Initializing Shopify app:', {
      hasApiKey: !!apiKey,
      hasApiSecret: !!apiSecret,
      apiKeyLength: apiKey.length,
      apiSecretLength: apiSecret.length,
    });

    const appUrl = getAppUrl();

    try {
      return shopifyApp({
        apiKey: apiKey,
        apiSecretKey: apiSecret,
        apiVersion: ApiVersion.October25,
        scopes: process.env.SCOPES?.split(","),
        appUrl: appUrl,
        authPathPrefix: "/auth",
        sessionStorage: new PrismaSessionStorage(prisma),
        distribution: AppDistribution.AppStore,
        future: {
          expiringOfflineAccessTokens: true,
        },
        ...(process.env.SHOP_CUSTOM_DOMAIN
          ? { customShopDomains: [process.env.SHOP_CUSTOM_DOMAIN] }
          : {}),
      });
    } catch (error) {
      console.error("Failed to initialize Shopify app:", error);
      return null;
    }
  }

  // Cache the shopify instance
  let shopifyInstance: ReturnType<typeof shopifyApp> | null = null;

  // Lazy getter that initializes on first access
  function getShopify() {
    if (!shopifyInstance) {
      shopifyInstance = initializeShopify();
    }
    return shopifyInstance;
  }

  // Try to initialize immediately (but won't fail if env vars aren't ready)
  try {
    shopifyInstance = initializeShopify();
  } catch (error) {
    console.log("Shopify not initialized at module load, will initialize lazily");
  }

  export default shopifyInstance;
  export const apiVersion = ApiVersion.October25;

  // Lazy exports - these will re-initialize if needed
  export const addDocumentResponseHeaders = (request: Request, headers: Headers) => {
    const instance = getShopify();
    if (instance?.addDocumentResponseHeaders) {
      instance.addDocumentResponseHeaders(request, headers);
    }
  };

  // Export getter function to get fresh instance
  export function getShopifyInstance() {
    return getShopify();
  }

  export const authenticate = getShopify()?.authenticate || null;
  export const unauthenticated = getShopify()?.unauthenticated || null;
  export const login = getShopify()?.login || null;
  export const registerWebhooks = getShopify()?.registerWebhooks || null;
  export const sessionStorage = getShopify()?.sessionStorage || null;

  function reinitializeShopify() {
    shopifyInstance = null; // Clear cache
    return getShopify(); // Reinitialize
  }

  export { reinitializeShopify };
