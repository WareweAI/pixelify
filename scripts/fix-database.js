#!/usr/bin/env node

import { PrismaClient } from '@prisma/client';

async function fixDatabase() {
  const prisma = new PrismaClient();
  
  try {
    console.log('🔍 Checking database connection...');
    
    // Test basic connection
    await prisma.$connect();
    console.log('✅ Database connection successful');
    
    // Check if session table exists
    try {
      const result = await prisma.$queryRaw`
        SELECT EXISTS (
          SELECT FROM information_schema.tables 
          WHERE table_schema = 'public' 
          AND table_name = 'session'
        );
      `;
      
      const tableExists = result[0]?.exists;
      console.log(`📋 Session table exists: ${tableExists}`);
      
      if (!tableExists) {
        console.log('❌ Session table is missing!');
        console.log('🔧 Please run the following commands to fix:');
        console.log('   npx prisma migrate reset --force');
        console.log('   npx prisma migrate deploy');
        console.log('   npx prisma generate');
      } else {
        console.log('✅ Session table exists');
        
        // Test session table access
        try {
          const sessionCount = await prisma.session.count();
          console.log(`📊 Session table accessible, contains ${sessionCount} records`);
        } catch (sessionError) {
          console.log('❌ Session table exists but not accessible:', sessionError.message);
        }
      }
      
    } catch (queryError) {
      console.log('❌ Error checking session table:', queryError.message);
    }
    
    // List all tables
    try {
      const tables = await prisma.$queryRaw`
        SELECT table_name 
        FROM information_schema.tables 
        WHERE table_schema = 'public' 
        ORDER BY table_name;
      `;
      
      console.log('📋 Available tables:');
      tables.forEach(table => {
        console.log(`   - ${table.table_name}`);
      });
      
    } catch (tablesError) {
      console.log('❌ Error listing tables:', tablesError.message);
    }
    
  } catch (error) {
    console.error('❌ Database connection failed:', error.message);
    console.log('🔧 Possible solutions:');
    console.log('   1. Check DATABASE_URL in .env file');
    console.log('   2. Ensure database server is running');
    console.log('   3. Run: npx prisma migrate deploy');
    console.log('   4. Run: npx prisma generate');
  } finally {
    await prisma.$disconnect();
  }
}

fixDatabase().catch(console.error);