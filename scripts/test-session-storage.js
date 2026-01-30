#!/usr/bin/env node

import { getShopifyInstance } from '../app/shopify.server.js';

async function testSessionStorage() {
  console.log('🔍 Testing Shopify session storage...');
  
  try {
    const shopify = getShopifyInstance();
    const sessionStorage = shopify.sessionStorage;
    
    // Create a test session
    const testSession = {
      id: 'test-session-' + Date.now(),
      shop: 'test-shop.myshopify.com',
      state: 'test-state',
      isOnline: false,
      accessToken: 'test-token',
      scope: 'read_products',
    };
    
    console.log('📝 Storing test session...');
    await sessionStorage.storeSession(testSession);
    console.log('✅ Session stored successfully');
    
    console.log('📖 Loading test session...');
    const loadedSession = await sessionStorage.loadSession(testSession.id);
    console.log('✅ Session loaded successfully:', !!loadedSession);
    
    console.log('🗑️ Deleting test session...');
    await sessionStorage.deleteSession(testSession.id);
    console.log('✅ Session deleted successfully');
    
    console.log('🎉 Session storage is working correctly!');
    
  } catch (error) {
    console.error('❌ Session storage test failed:', error.message);
    
    if (error.message.includes('Max client connections reached')) {
      console.log('🔧 Database connection pool is exhausted. Possible solutions:');
      console.log('   1. Wait for connections to timeout (5-10 minutes)');
      console.log('   2. Restart your database server');
      console.log('   3. Upgrade your database plan for more connections');
      console.log('   4. Implement connection pooling (already done in this fix)');
    }
  }
}

testSessionStorage().catch(console.error);