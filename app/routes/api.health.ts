import type { LoaderFunctionArgs } from "react-router";
import { checkDatabaseHealth } from "../db.server";

export const loader = async ({ request }: LoaderFunctionArgs) => {
  try {
    const dbHealth = await checkDatabaseHealth();
    
    return Response.json({
      status: "ok",
      timestamp: new Date().toISOString(),
      database: dbHealth,
      environment: process.env.NODE_ENV,
      version: "1.0.0"
    }, {
      status: dbHealth.connected ? 200 : 503,
      headers: {
        "Cache-Control": "no-cache, no-store, must-revalidate",
        "Pragma": "no-cache",
        "Expires": "0"
      }
    });
  } catch (error: any) {
    return Response.json({
      status: "error",
      timestamp: new Date().toISOString(),
      error: error.message,
      database: { connected: false, error: error.message }
    }, { 
      status: 503,
      headers: {
        "Cache-Control": "no-cache, no-store, must-revalidate",
        "Pragma": "no-cache", 
        "Expires": "0"
      }
    });
  }
};