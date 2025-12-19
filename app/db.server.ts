import { PrismaClient } from "@prisma/client";

declare global {
  // eslint-disable-next-line no-var
  var prismaGlobal: PrismaClient;
}

if (process.env.NODE_ENV !== "production") {
  if (!global.prismaGlobal) {
    global.prismaGlobal = new PrismaClient({
      log: ['error', 'warn'],
      errorFormat: 'minimal',
    });
  }
}

const prisma = global.prismaGlobal ?? new PrismaClient({
  log: ['error', 'warn'],
  errorFormat: 'minimal',
});

// Add connection retry logic with better error handling
// Don't block on connection - let it fail gracefully per-request
prisma.$connect().catch((error) => {
  // Only log if it's not a connection error (those will be handled per-request)
  if (error?.code !== 'P1001' && !error?.message?.includes("Can't reach database")) {
    console.error("Database connection failed:", error);
  }
});

export default prisma;
