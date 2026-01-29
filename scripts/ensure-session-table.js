/**
 * Ensure Session table exists in the database
 * This script checks if the session table exists and creates it if missing
 */

import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function ensureSessionTable() {
  try {
    console.log('[Session Table] Checking if session table exists...');
    
    // Try to query the session table
    try {
      await prisma.$queryRaw`SELECT COUNT(*) FROM "session" LIMIT 1`;
      console.log('[Session Table] ✅ Session table exists');
      return true;
    } catch (error) {
      console.log('[Session Table] ⚠️ Session table does not exist, creating...');
      
      // Create the session table
      await prisma.$executeRaw`
        CREATE TABLE IF NOT EXISTS "session" (
          "id" TEXT NOT NULL,
          "shop" TEXT NOT NULL,
          "state" TEXT NOT NULL,
          "isOnline" BOOLEAN NOT NULL DEFAULT false,
          "scope" TEXT,
          "expires" TIMESTAMP(3),
          "accessToken" TEXT NOT NULL,
          "userId" BIGINT,
          "firstName" TEXT,
          "lastName" TEXT,
          "email" TEXT,
          "accountOwner" BOOLEAN NOT NULL DEFAULT false,
          "locale" TEXT,
          "collaborator" BOOLEAN DEFAULT false,
          "emailVerified" BOOLEAN DEFAULT false,
          "refreshToken" TEXT,
          "refreshTokenExpires" TIMESTAMP(3),
          
          CONSTRAINT "session_pkey" PRIMARY KEY ("id")
        )
      `;
      
      console.log('[Session Table] ✅ Session table created successfully');
      return true;
    }
  } catch (error) {
    console.error('[Session Table] ❌ Error ensuring session table:', error);
    throw error;
  } finally {
    await prisma.$disconnect();
  }
}

// Run if called directly
if (import.meta.url === `file://${process.argv[1]}`) {
  ensureSessionTable()
    .then(() => {
      console.log('[Session Table] Done');
      process.exit(0);
    })
    .catch((error) => {
      console.error('[Session Table] Failed:', error);
      process.exit(1);
    });
}

export { ensureSessionTable };
