import { PrismaClient } from "@prisma/client";

declare global {
  var prisma: PrismaClient | undefined;
}

// Create Prisma client with fallback logic
function createPrismaClient() {
  // In production, prefer pooled connection for better reliability
  // In development, use direct connection for better performance
  let databaseUrl;
  
  if (process.env.NODE_ENV === "production") {
    // Use pooled connection in production for better reliability
    databaseUrl = process.env.DATABASE_URL;
    console.log("[DB] Using pooled connection for production");
  } else {
    // Use direct connection in development
    databaseUrl = process.env.DIRECT_URL || process.env.DATABASE_URL;
    console.log("[DB] Using direct connection for development");
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
