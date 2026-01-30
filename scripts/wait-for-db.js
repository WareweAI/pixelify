#!/usr/bin/env node

import { PrismaClient } from '@prisma/client';

async function waitForDatabase() {
  console.log('🔄 Waiting for database connections to clear...');
  
  let attempt = 1;
  const maxAttempts = 12; // 2 minutes total (10 seconds * 12)
  
  while (attempt <= maxAttempts) {
    console.log(`⏳ Attempt ${attempt}/${maxAttempts} - Testing database connection...`);
    
    const prisma = new PrismaClient({
      log: ['error'],
    });
    
    try {
      // Test with a simple query
      await prisma.$queryRaw`SELECT 1`;
      console.log('✅ Database connection successful!');
      
      // Test session table specifically
      const sessionCount = await prisma.session.count();
      console.log(`✅ Session table accessible! Found ${sessionCount} sessions`);
      
      await prisma.$disconnect();
      console.log('🎉 Database is ready!');
      return true;
      
    } catch (error) {
      await prisma.$disconnect();
      
      if (error.message.includes('Max client connections reached')) {
        console.log(`❌ Connection pool still full. Waiting 10 seconds...`);
        await new Promise(resolve => setTimeout(resolve, 10000));
        attempt++;
      } else {
        console.error('❌ Different database error:', error.message);
        return false;
      }
    }
  }
  
  console.log('❌ Timeout: Database connections did not clear within 2 minutes');
  console.log('🔧 Possible solutions:');
  console.log('   1. Contact your database provider to restart the database');
  console.log('   2. Wait longer for connections to timeout naturally');
  console.log('   3. Check if there are any long-running queries');
  console.log('   4. Consider upgrading your database plan for more connections');
  
  return false;
}

waitForDatabase().catch(console.error);