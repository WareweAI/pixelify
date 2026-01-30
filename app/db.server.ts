import { PrismaClient } from "@prisma/client";
import dotenv from "dotenv";

dotenv.config({
  path: "./.env"
});

declare global {
  var __prisma: PrismaClient | undefined;
}

// Shopify recommended database configuration for serverless
function createPrismaClient() {
  const isProduction = process.env.NODE_ENV === "production";
  const isVercel = process.env.VERCEL || process.env.VERCEL_URL;
  
  const databaseUrl = process.env.DATABASE_URL;
  
  if (!databaseUrl) {
    throw new Error("DATABASE_URL environment variable is required");
  }

  console.log(`[DB] Initializing Prisma Client for ${isProduction ? 'production' : 'development'}`);

  return new PrismaClient({
    // Shopify recommended logging configuration
    log: isProduction 
      ? ['error'] 
      : ['error', 'warn'], // Reduced logging to prevent spam
    
    datasources: {
      db: {
        url: databaseUrl,
      },
    },
    
    // Add connection pool configuration to prevent exhaustion
    __internal: {
      engine: {
        // Limit connection pool size for serverless environments
        connectionLimit: isProduction ? 5 : 3,
        // Reduce connection timeout
        connectTimeout: 10000, // 10 seconds
        // Enable connection pooling
        poolTimeout: 10000, // 10 seconds
      },
    } as any,
  });
}

// Shopify recommended singleton pattern for serverless
const prisma = globalThis.__prisma ?? createPrismaClient();

if (process.env.NODE_ENV !== "production") {
  globalThis.__prisma = prisma;
}

// Shopify recommended graceful shutdown
const gracefulShutdown = async () => {
  console.log("[DB] Graceful shutdown initiated");
  try {
    await prisma.$disconnect();
    console.log("[DB] Database disconnected successfully");
  } catch (error) {
    console.error("[DB] Error during shutdown:", error);
  }
};

// Register shutdown handlers (Shopify best practice)
process.on('SIGINT', gracefulShutdown);
process.on('SIGTERM', gracefulShutdown);
process.on('beforeExit', gracefulShutdown);

// Shopify recommended database health check
export async function checkDatabaseHealth(): Promise<{ 
  status: 'healthy' | 'unhealthy'; 
  error?: string;
  latency?: number;
}> {
  const startTime = Date.now();
  
  try {
    await prisma.$queryRaw`SELECT 1`;
    const latency = Date.now() - startTime;
    
    return { 
      status: 'healthy',
      latency 
    };
  } catch (error) {
    return {
      status: 'unhealthy',
      error: error instanceof Error ? error.message : "Unknown database error"
    };
  }
}

// Shopify recommended retry wrapper for database operations with connection cleanup
export async function withDatabaseRetry<T>(
  operation: () => Promise<T>,
  maxRetries = 3
): Promise<T> {
  let lastError: Error;
  
  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      return await operation();
    } catch (error: any) {
      lastError = error;
      
      // Check for retryable errors (Shopify recommended error codes)
      const isRetryable = 
        error.code === 'P1001' || // Connection error
        error.code === 'P2024' || // Timed out
        error.code === 'P1017' || // Server has closed the connection
        error.message?.includes('connection') ||
        error.message?.includes('timeout') ||
        error.message?.includes('ECONNRESET') ||
        error.message?.includes('Max client connections reached') ||
        error.message?.includes('Connection terminated unexpectedly') ||
        error.message?.includes('server closed the connection unexpectedly');
      
      if (isRetryable && attempt < maxRetries) {
        const delay = Math.min(1000 * Math.pow(2, attempt - 1), 5000); // Exponential backoff, max 5s
        console.warn(`[DB] Retryable error on attempt ${attempt}/${maxRetries}: ${error.message}`);
        console.warn(`[DB] Retrying in ${delay}ms...`);
        
        // Force disconnect and reconnect on connection errors
        if (error.message?.includes('Max client connections reached') || 
            error.message?.includes('Connection terminated') ||
            error.code === 'P1017') {
          console.warn(`[DB] Forcing connection cleanup due to connection pool issue...`);
          try {
            await prisma.$disconnect();
            // Small delay to allow cleanup
            await new Promise(resolve => setTimeout(resolve, 500));
          } catch (disconnectError) {
            console.warn(`[DB] Error during forced disconnect:`, disconnectError);
          }
        }
        
        await new Promise(resolve => setTimeout(resolve, delay));
      } else {
        break;
      }
    }
  }
  
  throw lastError!;
}

// Shopify recommended connection test with timeout
export async function ensureDatabaseConnection(timeoutMs = 10000): Promise<boolean> {
  try {
    const result = await Promise.race([
      prisma.$queryRaw`SELECT 1`,
      new Promise((_, reject) => 
        setTimeout(() => reject(new Error('Connection timeout')), timeoutMs)
      )
    ]);
    
    console.log("[DB] Connection verified successfully");
    return true;
  } catch (error) {
    console.error("[DB] Connection verification failed:", error instanceof Error ? error.message : error);
    return false;
  }
}

export default prisma;