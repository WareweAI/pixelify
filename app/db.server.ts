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

// Add connection retry logic
prisma.$connect().catch((error) => {
  console.error("Database connection failed:", error);
});

export default prisma;
