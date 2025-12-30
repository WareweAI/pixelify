import { config } from 'dotenv';
import { resolve } from 'path';

// Track if env has been loaded to avoid multiple loads
let envLoadedOnce = false;

export function loadEnv() {
  if (envLoadedOnce) {
    return process.env;
  }

  // In production (like Vercel), environment variables are injected by the platform
  // so we don't need to load from .env files
  if (process.env.NODE_ENV === 'production' || process.env.VERCEL) {
    console.log('🚀 Running in production/Vercel, using platform environment variables');
    envLoadedOnce = true;
    return process.env;
  }

  // Try to load from .env.local first, then .env (development only)
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
  
  if (!envLoaded) {
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

  // Check critical environment variables
  const required = ['SHOPIFY_API_KEY', 'SHOPIFY_API_SECRET'];
  const missing = required.filter(key => !process.env[key] || process.env[key] === '');
  
  if (missing.length > 0) {
    console.error('❌ Missing required environment variables:', missing);
    console.error('Current working directory:', process.cwd());
    console.error('Environment file loaded:', envLoaded);
    console.error('SHOPIFY_API_KEY present:', !!process.env.SHOPIFY_API_KEY);
    console.error('SHOPIFY_API_SECRET present:', !!process.env.SHOPIFY_API_SECRET);
    
    // In production, log all environment variables that start with SHOPIFY_ for debugging
    if (process.env.NODE_ENV === 'production') {
      console.error('Available SHOPIFY_ environment variables:');
      Object.keys(process.env)
        .filter(key => key.startsWith('SHOPIFY_'))
        .forEach(key => {
          console.error(`  ${key}: ${process.env[key] ? '[SET]' : '[NOT SET]'}`);
        });
    }
  } else {
    console.log('✅ All required environment variables are present');
  }
  
  return process.env;
}

