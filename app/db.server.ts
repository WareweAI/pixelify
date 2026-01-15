import { PrismaClient } from "@prisma/client";

declare global {
  var prisma: PrismaClient | undefined;
}

// Create Prisma client with optimized connection pooling
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
  
  return new PrismaClient({
    log: process.env.NODE_ENV === "development" ? ["query", "error", "warn"] : ["error"],
    datasources: {
      db: {
        url: databaseUrl,
      },
    },
    // Configure connection pool for serverless environments
    __internal: {
      engine: {
        connectionTimeout: 20000, // 20 seconds
        maxWait: 20000, // 20 seconds
        pool_timeout: 20000, // 20 seconds
      },
    },
  });
}

const prisma = global.prisma || createPrismaClient();

if (process.env.NODE_ENV !== "production") {
  global.prisma = prisma;
}

// Graceful shutdown
process.on('beforeExit', async () => {
  await prisma.$disconnect();
});

process.on('SIGINT', async () => {
  await prisma.$disconnect();
  process.exit(0);
});

process.on('SIGTERM', async () => {
  await prisma.$disconnect();
  process.exit(0);
});

export default prisma;