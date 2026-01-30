#!/usr/bin/env node

import { PrismaClient } from '@prisma/client';

async function testSessionTable() {
  const prisma = new PrismaClient({
    log: ['query', 'info', 'warn', 'error'],
  });
  
  try {
    console.log('🔍 Testing session table access...');
    
    // Try to count sessions
    const sessionCount = await prisma.session.count();
    console.log(`✅ Session table accessible! Found ${sessionCount} sessions`);
    
    // Try to find one session
    const firstSession = await prisma.session.findFirst();
    if (firstSession) {
      console.log(`📋 Sample session: ${firstSession.id} for shop: ${firstSession.shop}`);
    } else {
      console.log('📋 No sessions found in table');
    }
    
  } catch (error) {
    console.error('❌ Session table access failed:', error.message);
    console.error('Full error:', error);
    
    if (error.message.includes('does not exist')) {
      console.log('🔧 The session table does not exist. Running migration...');
      
      try {
        // Try to create the session table manually
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
          );
        `;
        
        console.log('✅ Session table created successfully!');
        
        // Test again
        const newCount = await prisma.session.count();
        console.log(`✅ Session table now accessible! Count: ${newCount}`);
        
      } catch (createError) {
        console.error('❌ Failed to create session table:', createError.message);
      }
    }
    
  } finally {
    await prisma.$disconnect();
  }
}

testSessionTable().catch(console.error);