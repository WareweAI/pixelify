/**
 * Startup script to ensure database is ready
 * Run this before starting the application
 */

import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function startup() {
  console.log('[Startup] Initializing application...');
  
  try {
    // 1. Test database connection
    console.log('[Startup] Testing database connection...');
    await prisma.$queryRaw`SELECT 1`;
    console.log('[Startup] ✅ Database connection successful');
    
    // 2. Ensure Session table exists
    console.log('[Startup] Checking Session table...');
    try {
      await prisma.$queryRaw`SELECT COUNT(*) FROM "session" LIMIT 1`;
      console.log('[Startup] ✅ Session table exists');
    } catch (error) {
      console.log('[Startup] ⚠️ Session table missing, creating...');
      
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
      
      console.log('[Startup] ✅ Session table created');
    }
    
    // 3. Verify all critical tables exist
    const tables = ['User', 'App', 'AppSettings', 'Event', 'session'];
    console.log('[Startup] Verifying critical tables...');
    
    for (const table of tables) {
      try {
        await prisma.$queryRaw`SELECT COUNT(*) FROM ${prisma.$queryRawUnsafe(`"${table}"`)} LIMIT 1`;
        console.log(`[Startup] ✅ Table "${table}" exists`);
      } catch (error) {
        console.error(`[Startup] ❌ Table "${table}" is missing!`);
        throw new Error(`Critical table "${table}" is missing. Please run: npx prisma migrate deploy`);
      }
    }
    
    console.log('[Startup] ✅ All critical tables verified');
    console.log('[Startup] 🚀 Application is ready to start');
    
  } catch (error) {
    console.error('[Startup] ❌ Startup failed:', error);
    throw error;
  } finally {
    await prisma.$disconnect();
  }
}

startup()
  .then(() => {
    process.exit(0);
  })
  .catch((error) => {
    console.error('[Startup] Fatal error:', error);
    process.exit(1);
  });
