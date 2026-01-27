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

// Custom Prisma Session Storage with better error handling
class ResilientPrismaSessionStorage extends PrismaSessionStorage {
  constructor(prisma: any, options?: any) {
    super(prisma, {
      ...options,
      // Reduce connection retries to fail faster and not exhaust pool
      connectionRetries: 2,
    });
  }

  // Override methods to add retry logic
  async storeSession(session: any): Promise<boolean> {
    try {
      return await super.storeSession(session);
    } catch (error) {
      console.error("[Session Storage] Error storing session:", error instanceof Error ? error.message : error);
      // Don't retry on store - just fail fast
      return false;
    }
  }

  async loadSession(id: string): Promise<any> {
    try {
      return await super.loadSession(id);
    } catch (error) {
      console.error("[Session Storage] Error loading session:", error instanceof Error ? error.message : error);
      // Return undefined instead of throwing to allow auth to continue
      return undefined;
    }
  }

  async deleteSession(id: string): Promise<boolean> {
    try {
      return await super.deleteSession(id);
    } catch (error) {
      console.error("[Session Storage] Error deleting session:", error instanceof Error ? error.message : error);
      return false; // Return false instead of throwing
    }
  }
}

const shopify = shopifyApp({
  apiKey: process.env.SHOPIFY_API_KEY!,
  apiSecretKey: process.env.SHOPIFY_API_SECRET!,
  apiVersion: ApiVersion.October25,
  scopes: process.env.SCOPES?.split(","),
  appUrl: process.env.SHOPIFY_APP_URL || (process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : ""),
  authPathPrefix: "/auth",
  sessionStorage: new ResilientPrismaSessionStorage(prisma),
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
export const sessionStorage = shopify.sessionStorage;

export function getShopifyInstance() {
  return shopify;
}