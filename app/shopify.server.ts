import "@shopify/shopify-app-react-router/adapters/node";
import {
  ApiVersion,
  AppDistribution,
  shopifyApp,
} from "@shopify/shopify-app-react-router/server";
import { PrismaSessionStorage } from "@shopify/shopify-app-session-storage-prisma";
import { PrismaClient } from "@prisma/client";
import { loadEnv } from "./lib/env-loader.server";
import { validateProductionEnvironment, sanitizeUrl } from "./lib/env-validation.server";

// Load environment variables immediately
loadEnv();

// Lazy initialization function
function initializeShopify() {
  loadEnv();

  // Validate production environment
  try {
    validateProductionEnvironment();
  } catch (error) {
    console.error("Environment validation failed:", error);
  }

  const apiKey = process.env.SHOPIFY_API_KEY?.replace(/^["']|["']$/g, '') || '';
  const apiSecret = process.env.SHOPIFY_API_SECRET?.replace(/^["']|["']$/g, '') || '';
  const hasShopifyConfig = Boolean(apiKey && apiSecret);
  const hasDatabase = Boolean(process.env.DATABASE_URL);

  if (!hasShopifyConfig) {
    console.error('❌ Shopify config missing:', {
      hasApiKey: !!apiKey,
      hasApiSecret: !!apiSecret,
      apiKeyLength: apiKey.length,
      apiSecretLength: apiSecret.length,
      cwd: process.cwd(),
    });
    return null;
  }

  console.log('✅ Initializing Shopify app:', {
    hasApiKey: !!apiKey,
    hasApiSecret: !!apiSecret,
    apiKeyLength: apiKey.length,
    apiSecretLength: apiSecret.length,
  });

  try {
    // PRODUCTION SAFETY: Sanitize and validate app URL, fallback to Vercel host if env missing
    const vercelUrl = process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : "";
    const appUrl = sanitizeUrl(process.env.SHOPIFY_APP_URL || vercelUrl);
    process.env.SHOPIFY_APP_URL = appUrl;

    // Only use PrismaSessionStorage if database is available
    // Create a dedicated Prisma client for session storage
    let sessionStorage;
    if (hasDatabase) {
      try {
        // Always use pooled connection for session storage for better reliability
        const dbUrl = process.env.DATABASE_URL;
        console.log("[Shopify] Using pooled connection for session storage (port 6543)");
        
        const sessionPrisma = new PrismaClient({
          datasources: {
            db: { url: dbUrl },
          },
        });
        
        sessionStorage = new PrismaSessionStorage(sessionPrisma);
        console.log("[Shopify] Session storage initialized successfully");
      } catch (error) {
        console.error("[Shopify] Failed to initialize session storage:", error);
        console.log("[Shopify] Falling back to memory session storage");
        sessionStorage = undefined; // Will use default memory storage
      }
    }

    return shopifyApp({
      apiKey: apiKey,
      apiSecretKey: apiSecret,
      apiVersion: ApiVersion.October25,
      scopes: process.env.SCOPES?.split(","),
      appUrl: appUrl,
      authPathPrefix: "/auth",
      ...(sessionStorage ? { sessionStorage } : {}),
      distribution: AppDistribution.AppStore,
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
