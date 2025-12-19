import type { LoaderFunctionArgs } from "react-router";
import prisma from "../db.server";

// Ensure all responses from this route are JSON (resource route)
export const headers = () => {
  return {
    "Content-Type": "application/json; charset=utf-8",
  };
};

// Handle GET requests for get-pixel-id
export async function loader({ request }: LoaderFunctionArgs) {
  try {
    const url = new URL(request.url);
    const shopDomain = url.searchParams.get("shop");

    if (!shopDomain) {
      return new Response(JSON.stringify({ error: "Missing shop parameter" }), {
        status: 400,
        headers: {
          "Content-Type": "application/json; charset=utf-8",
          "X-Content-Type-Options": "nosniff"
        }
      });
    }

    // Check database connection first and wrap all DB operations
    try {
      // Test connection with timeout
      await Promise.race([
        prisma.$queryRaw`SELECT 1`,
        new Promise((_, reject) =>
          setTimeout(() => reject(new Error('Database connection timeout')), 5000)
        )
      ]);
    } catch (dbError: any) {
      console.error("[App Proxy] Database connection error:", dbError);
      // Check for PrismaClientInitializationError or connection errors
      if (dbError?.code === 'P1001' ||
          dbError?.name === 'PrismaClientInitializationError' ||
          dbError?.message?.includes("Can't reach database") ||
          dbError?.message?.includes("connection timeout")) {
        return new Response(JSON.stringify({
          error: "Database temporarily unavailable",
          shop: shopDomain
        }), {
          status: 503,
          headers: {
            "Content-Type": "application/json; charset=utf-8",
            "X-Content-Type-Options": "nosniff"
          }
        });
      }
      // Re-throw if it's not a connection error
      throw dbError;
    }

    try {
      const user = await prisma.user.findUnique({
        where: { storeUrl: shopDomain },
      });

      if (!user) {
        return new Response(JSON.stringify({ error: "Shop not found", shop: shopDomain }), {
          status: 404,
          headers: {
            "Content-Type": "application/json; charset=utf-8",
            "X-Content-Type-Options": "nosniff"
          }
        });
      }

      const app = await prisma.app.findFirst({
        where: { userId: user.id },
        include: { settings: true },
        orderBy: { createdAt: "desc" },
      });

      if (!app) {
        return new Response(JSON.stringify({ error: "No pixel configured", shop: shopDomain }), {
          status: 404,
          headers: {
            "Content-Type": "application/json; charset=utf-8",
            "X-Content-Type-Options": "nosniff"
          }
        });
      }

      // Get custom events
      const customEvents = await prisma.customEvent.findMany({
        where: { appId: app.id, isActive: true },
        select: { name: true, selector: true, eventType: true, metaEventName: true },
      });

      return {
        pixelId: app.appId,
        appName: app.name,
        metaPixelId: app.settings?.metaPixelId || null,
        enabled: app.settings?.metaPixelEnabled ?? true,
        config: {
          autoPageviews: app.settings?.autoTrackPageviews ?? true,
          autoClicks: app.settings?.autoTrackClicks ?? true,
          autoScroll: app.settings?.autoTrackScroll ?? false,
        },
        customEvents,
      };
    } catch (error: any) {
      console.error("[App Proxy] Error:", error);
      // Check if it's a database error
      if (error?.code === 'P1001' || error?.message?.includes('Can\'t reach database')) {
        return new Response(JSON.stringify({
          error: "Database temporarily unavailable",
          shop: shopDomain
        }), {
          status: 503,
          headers: { "Content-Type": "application/json" }
        });
      }
      return new Response(JSON.stringify({ error: "Internal error" }), {
        status: 500,
        headers: { "Content-Type": "application/json" }
      });
    }
  } catch (error: any) {
    // Catch any unhandled errors and return JSON (never HTML)
    console.error("[App Proxy loader] Unhandled error:", error);
    return new Response(JSON.stringify({
      error: "Internal server error",
      message: error?.message || "An unexpected error occurred"
    }), {
      status: 500,
      headers: { "Content-Type": "application/json" }
    });
  }
}

// Resource route - must return null to prevent HTML rendering
export default function GetPixelIdRoute() {
  return null;
}