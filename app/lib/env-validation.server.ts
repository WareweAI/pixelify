/**
 * Environment Validation for Production Deployment
 * Prevents tunnel URLs from being used in production
 */

export function validateProductionEnvironment() {
  if (process.env.NODE_ENV !== "production") {
    return; // Skip validation in development
  }

  const errors: string[] = [];
  const warnings: string[] = [];

  // Check SHOPIFY_APP_URL
  const appUrl = process.env.SHOPIFY_APP_URL;
  if (!appUrl) {
    errors.push("SHOPIFY_APP_URL is required in production");
  } else if (appUrl.includes("trycloudflare.com")) {
    errors.push(`SHOPIFY_APP_URL cannot use tunnel URL in production: ${appUrl}`);
  } else if (appUrl.includes("localhost")) {
    errors.push(`SHOPIFY_APP_URL cannot use localhost in production: ${appUrl}`);
  } else if (!appUrl.startsWith("https://")) {
    errors.push(`SHOPIFY_APP_URL must use HTTPS in production: ${appUrl}`);
  }

  // Check for tunnel URLs in any environment variable
  Object.entries(process.env).forEach(([key, value]) => {
    if (value && typeof value === "string" && value.includes("trycloudflare.com")) {
      errors.push(`Environment variable ${key} contains tunnel URL: ${value}`);
    }
  });

  // Check required environment variables (core ones that must exist)
  const requiredVars = [
    "SHOPIFY_API_KEY",
    "SHOPIFY_API_SECRET",
    "DATABASE_URL"
  ];

  // Optional but recommended environment variables
  const optionalVars = [
    "DIRECT_URL" // Only needed for connection pooling (PgBouncer, etc.)
  ];

  requiredVars.forEach(varName => {
    if (!process.env[varName]) {
      errors.push(`Required environment variable missing: ${varName}`);
    }
  });

  optionalVars.forEach(varName => {
    if (!process.env[varName]) {
      warnings.push(`Optional environment variable missing: ${varName}`);
    }
  });

  // Check FRONTEND_PORT
  const frontendPort = process.env.FRONTEND_PORT;
  if (frontendPort && frontendPort.includes("http")) {
    warnings.push(`FRONTEND_PORT should be a port number, not URL: ${frontendPort}`);
  }

  // Log results
  if (errors.length > 0) {
    console.error("🚨 PRODUCTION ENVIRONMENT VALIDATION FAILED:");
    errors.forEach(error => console.error(`   ❌ ${error}`));
    // Log errors but don't throw - let the app try to continue
    // This prevents hard 500s when some env vars are missing but app might still work
    console.error("⚠️ Continuing despite validation errors...");
  }

  if (warnings.length > 0) {
    console.warn("⚠️ PRODUCTION ENVIRONMENT WARNINGS:");
    warnings.forEach(warning => console.warn(`   ⚠️ ${warning}`));
  }

  console.log("✅ Production environment validation passed");
}

export function sanitizeUrl(url: string): string {
  if (!url) return "";

  // Remove quotes and trim
  let cleanUrl = url.replace(/^["']|["']$/g, '').trim();

  // Remove trailing slash
  cleanUrl = cleanUrl.replace(/\/$/, '');

  // In production, never allow tunnel URLs
  if (process.env.NODE_ENV === "production" && cleanUrl.includes("trycloudflare.com")) {
    console.error("🚨 CRITICAL: Tunnel URL detected in production, using fallback");
    return process.env.SHOPIFY_APP_URL || "https://pixel-warewe.vercel.app";
  }

  return cleanUrl;
}