import type { LoaderFunctionArgs } from "react-router";
import { checkDatabaseHealth } from "../db.server";
import { getShopifyInstance } from "../shopify.server";

export const loader = async ({ request }: LoaderFunctionArgs) => {
  const startTime = Date.now();
  
  try {
    // Check database health
    const dbHealth = await checkDatabaseHealth();
    
    // Check session storage health (standard Shopify implementation)
    let sessionHealthy = true;
    let sessionError = null;
    
    try {
      const shopify = getShopifyInstance();
      const sessionStorage = shopify.sessionStorage;
      
      // Test session storage with a simple operation
      if (sessionStorage) {
        // Try to load a non-existent session to test connectivity
        await sessionStorage.loadSession('health-check-' + Date.now());
        sessionHealthy = true;
      }
    } catch (sessionError) {
      sessionHealthy = false;
      sessionError = sessionError instanceof Error ? sessionError.message : 'Unknown session error';
    }
    
    // Calculate response time
    const responseTime = Date.now() - startTime;
    
    // Overall health status
    const isHealthy = dbHealth.connected && sessionHealthy;
    
    return Response.json({
      status: isHealthy ? "ok" : "degraded",
      timestamp: new Date().toISOString(),
      responseTime: `${responseTime}ms`,
      environment: process.env.NODE_ENV,
      version: "1.0.0",
      services: {
        database: {
          ...dbHealth,
          status: dbHealth.connected ? "healthy" : "unhealthy"
        },
        session: {
          healthy: sessionHealthy,
          status: sessionHealthy ? "healthy" : "degraded",
          error: sessionError
        }
      },
      metrics: {
        responseTime,
        uptime: process.uptime(),
        memoryUsage: process.memoryUsage(),
        sessionStorageType: "shopify-standard"
      }
    }, {
      status: isHealthy ? 200 : 503,
      headers: {
        "Cache-Control": "no-cache, no-store, must-revalidate",
        "Pragma": "no-cache",
        "Expires": "0",
        "X-Response-Time": `${responseTime}ms`
      }
    });
  } catch (error: any) {
    const responseTime = Date.now() - startTime;
    
    return Response.json({
      status: "error",
      timestamp: new Date().toISOString(),
      responseTime: `${responseTime}ms`,
      error: error.message,
      database: { connected: false, error: error.message },
      session: { healthy: false, error: error.message }
    }, { 
      status: 503,
      headers: {
        "Cache-Control": "no-cache, no-store, must-revalidate",
        "Pragma": "no-cache", 
        "Expires": "0",
        "X-Response-Time": `${responseTime}ms`
      }
    });
  }
};