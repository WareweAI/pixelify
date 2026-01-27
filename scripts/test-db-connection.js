#!/usr/bin/env node

/**
 * Database Connection Test Script
 * Tests both pooled and direct connections to Supabase
 */

import { PrismaClient } from '@prisma/client';

async function testConnection(url, name) {
  console.log(`\n🔍 Testing ${name}...`);
  console.log(`URL: ${url.replace(/:[^:@]+@/, ':****@')}`);
  
  const prisma = new PrismaClient({
    datasources: {
      db: { url }
    },
    log: ['error']
  });

  try {
    const startTime = Date.now();
    await prisma.$queryRaw`SELECT 1 as test`;
    const duration = Date.now() - startTime;
    
    console.log(`✅ ${name} successful (${duration}ms)`);
    
    // Test session table
    const sessionCount = await prisma.session.count();
    console.log(`   Sessions in database: ${sessionCount}`);
    
    await prisma.$disconnect();
    return true;
  } catch (error) {
    console.error(`❌ ${name} failed:`, error.message);
    await prisma.$disconnect();
    return false;
  }
}

async function main() {
  console.log('🚀 Database Connection Test\n');
  console.log('Environment:', process.env.NODE_ENV || 'development');
  
  const DATABASE_URL = process.env.DATABASE_URL;
  const DIRECT_URL = process.env.DIRECT_URL;

  if (!DATABASE_URL) {
    console.error('❌ DATABASE_URL not found in environment');
    process.exit(1);
  }

  // Test pooled connection
  const pooledSuccess = await testConnection(DATABASE_URL, 'Pooled Connection (DATABASE_URL)');
  
  // Test direct connection if available
  let directSuccess = false;
  if (DIRECT_URL && DIRECT_URL !== DATABASE_URL) {
    directSuccess = await testConnection(DIRECT_URL, 'Direct Connection (DIRECT_URL)');
  }

  console.log('\n📊 Summary:');
  console.log(`   Pooled: ${pooledSuccess ? '✅' : '❌'}`);
  if (DIRECT_URL && DIRECT_URL !== DATABASE_URL) {
    console.log(`   Direct: ${directSuccess ? '✅' : '❌'}`);
  }

  if (!pooledSuccess && !directSuccess) {
    console.log('\n⚠️  Recommendations:');
    console.log('   1. Check if Supabase project is paused');
    console.log('   2. Verify connection strings in .env file');
    console.log('   3. Check firewall/network settings');
    console.log('   4. Ensure Supabase pooler is enabled');
    process.exit(1);
  }

  console.log('\n✅ Database connection test completed successfully');
}

main().catch(console.error);
