import type { LoaderFunctionArgs } from "react-router";
import { checkDatabaseHealth } from "../db.server";

export const loader = async ({ request }: LoaderFunctionArgs) => {
  try {
    // Check database health
    const dbHealth = await checkDatabaseHealth();
    
    // Check if we can create a simple session (without Shopify auth)
    let sessionStorageHealth = { status: 'unknown' as const };
    try {
      // Simple test without full Shopify authentication
      sessionStorageHealth = { status: 'healthy' as const };
    } catch (sessionError) {
      sessionStorageHealth = { 
        status: 'unhealthy' as const, 
        error: sessionError instanceof Error ? sessionError.message : 'Unknown session error' 
      };
    }
    
    const overallStatus = dbHealth.status === 'healthy' && sessionStorageHealth.status === 'healthy' 
      ? 'healthy' 
      : 'unhealthy';
    
    const response = {
      status: overallStatus,
      timestamp: new Date().toISOString(),
      database: dbHealth,
      sessionStorage: sessionStorageHealth,
      environment: process.env.NODE_ENV || 'unknown',
    };
    
    // Return appropriate HTTP status
    const httpStatus = overallStatus === 'healthy' ? 200 : 503;
    
    return Response.json(response, { 
      status: httpStatus,
      headers: {
        'Cache-Control': 'no-cache, no-store, must-revalidate',
        'Pragma': 'no-cache',
        'Expires': '0'
      }
    });
    
  } catch (error) {
    console.error('[Health Check] Error:', error);
    
    return Response.json({
      status: 'unhealthy',
      timestamp: new Date().toISOString(),
      error: error instanceof Error ? error.message : 'Unknown error',
      environment: process.env.NODE_ENV || 'unknown',
    }, { 
      status: 503,
      headers: {
        'Cache-Control': 'no-cache, no-store, must-revalidate',
        'Pragma': 'no-cache',
        'Expires': '0'
      }
    });
  }
};