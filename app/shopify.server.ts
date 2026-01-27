import "@shopify/shopify-app-react-router/adapters/node";
import {
  ApiVersion,
  AppDistribution,
  shopifyApp,
  BillingInterval,
} from "@shopify/shopify-app-react-router/server";
import { PrismaSessionStorage } from "@shopify/shopify-app-session-storage-prisma";
import prisma, { ensureDatabaseConnection } from "./db.server";

// Billing configuration for development
export const BASIC_PLAN = 'Basic Plan';
export const ADVANCED_PLAN = 'Advanced Plan';

// Create standard Shopify session storage with minimal configuration
const sessionStorage = new PrismaSessionStorage(prisma);

// Create Shopify app instance
const shopify = shopifyApp({
  apiKey: process.env.SHOPIFY_API_KEY!,
  apiSecretKey: process.env.SHOPIFY_API_SECRET!,
  apiVersion: ApiVersion.October25,
  scopes: process.env.SCOPES?.split(","),
  appUrl: process.env.SHOPIFY_APP_URL || (process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : ""),
  authPathPrefix: "/auth",
  sessionStorage,
  distribution: AppDistribution.AppStore,
  ...(process.env.SHOP_CUSTOM_DOMAIN
    ? { customShopDomains: [process.env.SHOP_CUSTOM_DOMAIN] }
    : {}),
});

export default shopify;
export const apiVersion = ApiVersion.October25;
export const addDocumentResponseHeaders = shopify.addDocumentResponseHeaders;
export const authenticate = shopify.authenticate;
export const unauthenticated = shopify.unauthenticated;
export const login = shopify.login;
export const registerWebhooks = shopify.registerWebhooks;
export const sessionStorageInstance = shopify.sessionStorage;

export function getShopifyInstance() {
  return shopify;
}

// Initialize database connection in the background
ensureDatabaseConnection().then(isConnected => {
  if (!isConnected) {
    console.error("[Shopify] Failed to connect to database - app may not function properly");
  } else {
    console.log("[Shopify] Database connection established successfully");
  }
}).catch(error => {
  console.error("[Shopify] Database initialization error:", error);
});