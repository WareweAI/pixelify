import "@shopify/shopify-app-react-router/adapters/node";
import {
  ApiVersion,
  AppDistribution,
  shopifyApp,
} from "@shopify/shopify-app-react-router/server";
import { PrismaSessionStorage } from "@shopify/shopify-app-session-storage-prisma";
import { loadEnv } from "./lib/env-loader.server";
import { validateProductionEnvironment, sanitizeUrl } from "./lib/env-validation.server";
import prisma from "./db.server";

loadEnv();

function initializeShopify() {
  loadEnv();

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
    const vercelUrl = process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : "";
    const appUrl = sanitizeUrl(process.env.SHOPIFY_APP_URL || vercelUrl);
    process.env.SHOPIFY_APP_URL = appUrl;

    if (!hasDatabase) {
      throw new Error("DATABASE_URL environment variable is required for session storage");
    }

    if (!prisma) {
      throw new Error("Prisma client is not initialized. Check database connection.");
    }

    let sessionStorage;
    try {
      sessionStorage = new PrismaSessionStorage(prisma);
      console.log("[Shopify] Using PrismaSessionStorage for session management");
    } catch (storageError) {
      console.error("[Shopify] Failed to create PrismaSessionStorage:", storageError);
      throw new Error(`Failed to create session storage: ${storageError instanceof Error ? storageError.message : String(storageError)}`);
    }

    if (!sessionStorage) {
      throw new Error("Session storage is undefined after initialization");
    }

    return shopifyApp({
      apiKey: apiKey,
      apiSecretKey: apiSecret,
      apiVersion: ApiVersion.October25,
      scopes: process.env.SCOPES?.split(","),
      appUrl: appUrl,
      authPathPrefix: "/auth",
      sessionStorage: sessionStorage,
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

let shopifyInstance: ReturnType<typeof shopifyApp> | null = null;

function getShopify() {
  if (!shopifyInstance) {
    shopifyInstance = initializeShopify();
  }
  return shopifyInstance;
}

try {
  shopifyInstance = initializeShopify();
} catch (error) {
  console.log("Shopify not initialized at module load, will initialize lazily");
}

export default shopifyInstance;
export const apiVersion = ApiVersion.October25;

export const addDocumentResponseHeaders = (request: Request, headers: Headers) => {
  const instance = getShopify();
  if (instance?.addDocumentResponseHeaders) {
    instance.addDocumentResponseHeaders(request, headers);
  }
};

export function getShopifyInstance() {
  return getShopify();
}

export const authenticate = getShopify()?.authenticate || null;
export const unauthenticated = getShopify()?.unauthenticated || null;
export const login = getShopify()?.login || null;
export const registerWebhooks = getShopify()?.registerWebhooks || null;
export const sessionStorage = getShopify()?.sessionStorage || null;

function reinitializeShopify() {
  shopifyInstance = null;
  return getShopify();
}

export { reinitializeShopify };
