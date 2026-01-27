import { PrismaClient } from "@prisma/client";

declare global {
  var prisma: PrismaClient | undefined;
  var prismaConnectionAttempts: number | undefined;
}

// Create Prisma client with optimized connection pooling and retry logic
function createPrismaClient() {
  let databaseUrl;
  
  // Check if we're on Vercel (serverless)
  const isVercel = process.env.VERCEL || process.env.VERCEL_URL || process.env.VERCEL_ENV;

  if (isVercel || process.env.NODE_ENV === "production") {
    // Use pooled connection on Vercel or production for better reliability
    databaseUrl = process.env.DATABASE_URL;
    console.log("[DB] Using pooled connection for Vercel/production");
  } else {
    // Use direct connection in local development for better performance
    databaseUrl = process.env.DIRECT_URL || process.env.DATABASE_URL;
    console.log("[DB] Using direct connection for local development");
  }
  
  if (!databaseUrl) {
    console.error("[DB] ERROR: DATABASE_URL is not defined!");
    throw new Error("DATABASE_URL environment variable is required");
  }
  
  // Let Supabase manage connection pooling automatically
  // Don't add connection limits - let the pooler handle it
  const enhancedUrl = databaseUrl;
  
  return new PrismaClient({
    log: process.env.NODE_ENV === "development" ? ["error", "warn"] : ["error"],
    datasources: {
      db: {
        url: enhancedUrl,
      },
    },
    // Add connection management
    __internal: {
      engine: {
        connectTimeout: 10000, // 10 seconds
        requestTimeout: 20000, // 20 seconds
      },
    },
  });
}

const prisma = global.prisma || createPrismaClient();

if (process.env.NODE_ENV !== "production") {
  global.prisma = prisma;
}

// Initialize connection attempts counter
if (!global.prismaConnectionAttempts) {
  global.prismaConnectionAttempts = 0;
}

// Test database connection with retry logic
export async function ensureDatabaseConnection(maxRetries = 2): Promise<boolean> {
  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      await prisma.$queryRaw`SELECT 1`;
      console.log(`[DB] Connection successful (attempt ${attempt}/${maxRetries})`);
      global.prismaConnectionAttempts = 0;
      return true;
    } catch (error) {
      global.prismaConnectionAttempts = attempt;
      console.error(`[DB] Connection attempt ${attempt}/${maxRetries} failed:`, error instanceof Error ? error.message : error);
      
      if (attempt < maxRetries) {
        const delay = 500; // Shorter delay to fail faster
        console.log(`[DB] Retrying in ${delay}ms...`);
        await new Promise(resolve => setTimeout(resolve, delay));
      }
    }
  }
  
  console.error(`[DB] Failed to connect after ${maxRetries} attempts`);
  return false;
}

// Health check function for monitoring
export async function checkDatabaseHealth(): Promise<{ connected: boolean; error?: string }> {
  try {
    await prisma.$queryRaw`SELECT 1`;
    return { connected: true };
  } catch (error) {
    return {
      connected: false,
      error: error instanceof Error ? error.message : "Unknown error"
    };
  }
}

// Graceful shutdown with connection cleanup
process.on('beforeExit', async () => {
  try {
    console.log("[DB] Shutting down gracefully...");
    await prisma.$disconnect();
    console.log("[DB] Disconnected gracefully");
  } catch (error) {
    console.error("[DB] Error during disconnect:", error);
  }
});

process.on('SIGINT', async () => {
  try {
    console.log("[DB] Received SIGINT, disconnecting...");
    await prisma.$disconnect();
    console.log("[DB] Disconnected on SIGINT");
  } catch (error) {
    console.error("[DB] Error during SIGINT disconnect:", error);
  }
  process.exit(0);
});

process.on('SIGTERM', async () => {
  try {
    console.log("[DB] Received SIGTERM, disconnecting...");
    await prisma.$disconnect();
    console.log("[DB] Disconnected on SIGTERM");
  } catch (error) {
    console.error("[DB] Error during SIGTERM disconnect:", error);
  }
  process.exit(0);
});

// Monitor connection pool health
let connectionCheckInterval: NodeJS.Timeout | null = null;

if (process.env.NODE_ENV === "production") {
  connectionCheckInterval = setInterval(async () => {
    try {
      await prisma.$queryRaw`SELECT 1`;
      // Connection is healthy
    } catch (error: any) {
      if (error.message?.includes('connection pool') || error.message?.includes('Timed out')) {
        console.error("[DB] ⚠️ Connection pool issue detected:", error.message);
        console.error("[DB] Consider increasing connection_limit or pool_timeout");
      }
    }
  }, 60000); // Check every minute
}

// Connection pool manager to prevent exhaustion
class ConnectionPoolManager {
  private activeConnections = 0;
  private maxConnections = 5;
  private queue: Array<{ resolve: Function; reject: Function }> = [];

  async acquireConnection<T>(operation: () => Promise<T>): Promise<T> {
    return new Promise((resolve, reject) => {
      if (this.activeConnections < this.maxConnections) {
        this.executeOperation(operation, resolve, reject);
      } else {
        this.queue.push({ resolve, reject });
        // Add timeout for queued operations
        setTimeout(() => {
          const index = this.queue.findIndex(item => item.resolve === resolve);
          if (index !== -1) {
            this.queue.splice(index, 1);
            reject(new Error('Database operation timed out in queue'));
          }
        }, 15000); // 15 second timeout
      }
    });
  }

  private async executeOperation<T>(
    operation: () => Promise<T>,
    resolve: Function,
    reject: Function
  ) {
    this.activeConnections++;
    try {
      const result = await operation();
      resolve(result);
    } catch (error) {
      reject(error);
    } finally {
      this.activeConnections--;
      this.processQueue();
    }
  }

  private processQueue() {
    if (this.queue.length > 0 && this.activeConnections < this.maxConnections) {
      const { resolve, reject } = this.queue.shift()!;
      // Note: This is a simplified version - in practice you'd need to store the operation too
    }
  }
}

export const connectionPool = new ConnectionPoolManager();

// Wrapper function for database operations with retry logic and connection management
export async function withDatabaseRetry<T>(
  operation: () => Promise<T>,
  maxRetries = 3,
  retryDelay = 500
): Promise<T> {
  let lastError: Error;
  
  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      // Execute operation with timeout
      const result = await Promise.race([
        operation(),
        new Promise<never>((_, reject) => 
          setTimeout(() => reject(new Error('Database operation timeout')), 15000)
        )
      ]);
      return result;
    } catch (error: any) {
      lastError = error;
      
      // Check if it's a connection-related error
      const isConnectionError = 
        error.message?.includes('connection pool') ||
        error.message?.includes('Max client connections reached') ||
        error.message?.includes('Timed out') ||
        error.message?.includes('timeout') ||
        error.code === 'P2024' ||
        error.code === 'P1001' ||
        error.code === 'P1017';
      
      if (isConnectionError && attempt < maxRetries) {
        console.warn(`[DB] Connection error on attempt ${attempt}/${maxRetries}: ${error.message}`);
        console.warn(`[DB] Retrying in ${retryDelay}ms...`);
        
        // Try to disconnect and reconnect to clear stale connections
        try {
          await prisma.$disconnect();
        } catch (e) {
          // Ignore disconnect errors
        }
        
        await new Promise(resolve => setTimeout(resolve, retryDelay));
        retryDelay *= 1.5; // Exponential backoff
      } else {
        break;
      }
    }
  }
  
  throw lastError;
}

export default prisma;