// lib/env-loader.server.ts - Load environment variables properly
import { config } from 'dotenv';
import { resolve } from 'path';

// Track if env has been loaded to avoid multiple loads
let envLoadedOnce = false;

export function loadEnv() {
  // If already loaded in this process, skip (env vars persist)
  if (envLoadedOnce && process.env.SHOPIFY_API_KEY && process.env.SHOPIFY_API_SECRET) {
    return process.env;
  }

  // Try to load from .env.local first, then .env
  let envLoaded = false;
  
  // Try .env.local first (higher priority) - use override to ensure values are set
  const envLocalPath = resolve(process.cwd(), '.env.local');
  const envLocalResult = config({ path: envLocalPath, override: true });
  
  if (!envLocalResult.error) {
    envLoaded = true;
    console.log('✅ .env.local file loaded successfully');
  } else {
    // Fallback to .env - use override to ensure values are set
    const envPath = resolve(process.cwd(), '.env');
    const result = config({ path: envPath, override: true });
    
    if (!result.error) {
      envLoaded = true;
      console.log('✅ .env file loaded successfully');
    }
  }
  
  if (!envLoaded && process.env.NODE_ENV === 'development') {
    console.log('⚠️  No .env file found, using process.env');
  }

  // Strip quotes from environment variables if they exist (dotenv should handle this, but just in case)
  const keysToClean = ['SHOPIFY_API_KEY', 'SHOPIFY_API_SECRET', 'DATABASE_URL', 'SHOPIFY_APP_URL'];
  keysToClean.forEach(key => {
    if (process.env[key] && (process.env[key]?.startsWith('"') || process.env[key]?.startsWith("'"))) {
      process.env[key] = process.env[key]?.replace(/^["']|["']$/g, '');
    }
  });

  envLoadedOnce = true;

  // Check critical environment variables (only log in development or if actually missing in production)
  const required = ['SHOPIFY_API_KEY', 'SHOPIFY_API_SECRET'];
  const missing = required.filter(key => !process.env[key] || process.env[key] === '');
  
  // Only log errors in development or if we're in a local environment
  // In production (Vercel), env vars come from platform settings, not .env files
  const isProduction = process.env.NODE_ENV === 'production' || process.env.VERCEL;
  if (missing.length > 0 && !isProduction) {
    console.error('❌ Missing required environment variables:', missing);
    console.error('Current working directory:', process.cwd());
    console.error('Environment file loaded:', envLoaded);
    console.error('SHOPIFY_API_KEY present:', !!process.env.SHOPIFY_API_KEY);
    console.error('SHOPIFY_API_SECRET present:', !!process.env.SHOPIFY_API_SECRET);
    // Don't throw error - allow app to continue for Vercel deployment
    // In Vercel, env vars are injected, so we don't need the file
  } else if (missing.length === 0 && !isProduction) {
    console.log('✅ All required environment variables are present');
  }
  
  return process.env;
}





