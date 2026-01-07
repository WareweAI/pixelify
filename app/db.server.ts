import { PrismaClient } from "@prisma/client";

declare global {
  var prisma: PrismaClient | undefined;
}

// Create Prisma client with fallback logic
function createPrismaClient() {
  // In production, prefer pooled connection for better reliability
  // In development, use direct connection for better performance
  let databaseUrl;
  
  // Check if we're on Vercel (serverless)
  const isVercel = process.env.VERCEL || process.env.VERCEL_URL || process.env.VERCEL_ENV;

  if (isVercel || process.env.NODE_ENV === "production") {
    // Use direct connection on Vercel or production for migrations to work
    databaseUrl = process.env.DIRECT_URL || process.env.DATABASE_URL;
    console.log("[DB] Using direct connection for Vercel/production");
  } else {
    // Use direct connection in local development
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
  });
}

const prisma = global.prisma || createPrismaClient();

if (process.env.NODE_ENV !== "production") {
  global.prisma = prisma;
}

export default prisma;