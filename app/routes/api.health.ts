// Health check API endpoint
import type { LoaderFunctionArgs } from "react-router";
import { getShopifyInstance } from "../shopify.server";
import prisma from "../db.server";

export async function loader({ request }: LoaderFunctionArgs) {
  const corsHeaders = {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Methods": "GET, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type",
    "Content-Type": "application/json",
  };

  try {
    // Check environment variables
    const hasShopifyApiKey = !!process.env.SHOPIFY_API_KEY;
    const hasShopifyApiSecret = !!process.env.SHOPIFY_API_SECRET;
    const hasDatabase = !!process.env.DATABASE_URL;
    const hasAppUrl = !!process.env.SHOPIFY_APP_URL;

    // Check if Shopify is initialized
    let shopifyStatus = "not_initialized";
    try {
      const shopify = getShopifyInstance();
      if (shopify?.authenticate) {
        shopifyStatus = "initialized";
      } else {
        shopifyStatus = "failed_to_initialize";
      }
    } catch (error) {
      shopifyStatus = `error: ${error instanceof Error ? error.message : String(error)}`;
    }

    // Check database connection
    let databaseStatus = "not_available";
    if (hasDatabase) {
      try {
        if (prisma && typeof prisma.user !== "undefined") {
          // Try a simple query
          await prisma.user.findFirst();
          databaseStatus = "connected";
        } else {
          databaseStatus = "not_initialized";
        }
      } catch (error) {
        databaseStatus = `error: ${error instanceof Error ? error.message : String(error)}`;
      }
    }

    const health = {
      status: "ok",
      timestamp: new Date().toISOString(),
      environment: {
        nodeEnv: process.env.NODE_ENV,
        hasShopifyApiKey,
        hasShopifyApiSecret,
        hasDatabase,
        hasAppUrl,
        shopifyAppUrl: process.env.SHOPIFY_APP_URL,
        vercelUrl: process.env.VERCEL_URL,
      },
      services: {
        shopify: shopifyStatus,
        database: databaseStatus,
      },
    };

    return Response.json(health, { headers: corsHeaders });
  } catch (error) {
    console.error("Health check error:", error);
    return Response.json(
      {
        status: "error",
        timestamp: new Date().toISOString(),
        error: error instanceof Error ? error.message : String(error),
      },
      { status: 500, headers: corsHeaders }
    );
  }
}

export async function action({ request }: LoaderFunctionArgs) {
  if (request.method === "OPTIONS") {
    return new Response(null, {
      status: 204,
      headers: {
        "Access-Control-Allow-Origin": "*",
        "Access-Control-Allow-Methods": "GET, OPTIONS",
        "Access-Control-Allow-Headers": "Content-Type",
      },
    });
  }

  return Response.json({ error: "Method not allowed" }, { status: 405 });
}

export default function ApiHealthRoute() {
  return null;
}