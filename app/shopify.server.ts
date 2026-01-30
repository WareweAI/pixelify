import "@shopify/shopify-app-react-router/adapters/node";
import {
  ApiVersion,
  AppDistribution,
  shopifyApp,
  BillingInterval,
} from "@shopify/shopify-app-react-router/server";
import { PrismaSessionStorage } from "@shopify/shopify-app-session-storage-prisma";
import { PrismaClient } from "@prisma/client";
import prisma, { ensureDatabaseConnection, withDatabaseRetry } from "./db.server";

// Billing configuration for development
export const BASIC_PLAN = 'Basic Plan';
export const ADVANCED_PLAN = 'Advanced Plan';

// Create resilient session storage with retry logic and fallback
class ResilientPrismaSessionStorage extends PrismaSessionStorage<PrismaClient> {
  private fallbackSessions = new Map<string, any>();
  
  constructor(prisma: PrismaClient) {
    super(prisma);
  }

  async storeSession(session: any) {
    try {
      return await withDatabaseRetry(async () => {
        return super.storeSession(session);
      }, 2); // Reduced retries to prevent long delays
    } catch (error) {
      console.warn(`[Session Storage] Failed to store session in DB, using fallback: ${error instanceof Error ? error.message : 'Unknown error'}`);
      // Fallback to in-memory storage
      this.fallbackSessions.set(session.id, session);
      return true;
    }
  }

  async loadSession(id: string) {
    try {
      return await withDatabaseRetry(async () => {
        return super.loadSession(id);
      }, 2); // Reduced retries
    } catch (error) {
      console.warn(`[Session Storage] Failed to load session from DB, checking fallback: ${error instanceof Error ? error.message : 'Unknown error'}`);
      // Try fallback storage
      const fallbackSession = this.fallbackSessions.get(id);
      if (fallbackSession) {
        console.log(`[Session Storage] Found session in fallback storage: ${id}`);
        return fallbackSession;
      }
      return undefined;
    }
  }

  async deleteSession(id: string) {
    try {
      return await withDatabaseRetry(async () => {
        return super.deleteSession(id);
      }, 2);
    } catch (error) {
      console.warn(`[Session Storage] Failed to delete session from DB: ${error instanceof Error ? error.message : 'Unknown error'}`);
      // Remove from fallback storage
      this.fallbackSessions.delete(id);
      return true;
    }
  }

  async deleteSessions(ids: string[]) {
    try {
      return await withDatabaseRetry(async () => {
        return super.deleteSessions(ids);
      }, 2);
    } catch (error) {
      console.warn(`[Session Storage] Failed to delete sessions from DB: ${error instanceof Error ? error.message : 'Unknown error'}`);
      // Remove from fallback storage
      ids.forEach(id => this.fallbackSessions.delete(id));
      return true;
    }
  }

  async findSessionsByShop(shop: string) {
    try {
      return await withDatabaseRetry(async () => {
        return super.findSessionsByShop(shop);
      }, 2);
    } catch (error) {
      console.warn(`[Session Storage] Failed to find sessions by shop from DB: ${error instanceof Error ? error.message : 'Unknown error'}`);
      // Search fallback storage
      const fallbackSessions = Array.from(this.fallbackSessions.values()).filter(
        session => session.shop === shop
      );
      return fallbackSessions;
    }
  }
}

// Create resilient session storage
const sessionStorage = new ResilientPrismaSessionStorage(prisma);

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

// Enhanced authentication wrapper with better error handling
export async function authenticateAdmin(request: Request) {
  try {
    const result = await shopify.authenticate.admin(request);
    return result;
  } catch (error: any) {
    console.error("[Shopify Auth] Authentication failed:", error.message);
    
    // Check if it's a database connection error
    if (error.message?.includes('Max client connections reached') ||
        error.message?.includes('connection') ||
        error.message?.includes('timeout')) {
      console.error("[Shopify Auth] Database connection issue detected");
      
      // Try to cleanup connections
      try {
        await prisma.$disconnect();
        console.log("[Shopify Auth] Forced database disconnect for cleanup");
      } catch (disconnectError) {
        console.warn("[Shopify Auth] Error during forced disconnect:", disconnectError);
      }
    }
    
    throw error;
  }
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

// Periodic connection cleanup to prevent pool exhaustion
if (typeof global !== 'undefined') {
  // Only run in server environment
  setInterval(async () => {
    try {
      // Force disconnect and reconnect every 5 minutes to prevent stale connections
      await prisma.$disconnect();
      console.log("[Shopify] Periodic database connection cleanup completed");
    } catch (error) {
      console.warn("[Shopify] Periodic cleanup error:", error);
    }
  }, 5 * 60 * 1000); // 5 minutes
}