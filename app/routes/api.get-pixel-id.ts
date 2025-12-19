// API endpoint to get pixel ID for a shop
import type { LoaderFunctionArgs } from "react-router";
import prisma from "~/db.server";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type",
  "X-Content-Type-Options": "nosniff",
};

export async function loader({ request }: LoaderFunctionArgs) {
  // Handle OPTIONS preflight
  if (request.method === "OPTIONS") {
    return new Response(null, { status: 204, headers: corsHeaders });
  }

  const url = new URL(request.url);
  const shop = url.searchParams.get("shop");

  if (!shop) {
    return Response.json(
      { error: "Missing shop parameter" },
      { status: 400, headers: corsHeaders }
    );
  }

  try {
    // Find user by shop domain
    const user = await prisma.user.findUnique({
      where: { email: shop },
      include: {
        apps: {
          where: {
            settings: {
              metaPixelEnabled: true,
            },
          },
          include: {
            settings: true,
          },
          orderBy: { createdAt: "desc" },
          take: 1,
        },
      },
    });

    if (!user || user.apps.length === 0) {
      // Try to find any app for this shop
      const anyApp = await prisma.app.findFirst({
        where: {
          user: { email: shop },
        },
        include: { settings: true },
        orderBy: { createdAt: "desc" },
      });

      if (anyApp) {
        // Fetch custom events for this app
        const customEvents = await prisma.customEvent.findMany({
          where: { appId: anyApp.id, isActive: true },
          select: { name: true, selector: true, eventType: true, metaEventName: true },
        });

        return Response.json(
          {
            pixelId: anyApp.appId,
            appName: anyApp.name,
            metaPixelId: anyApp.settings?.metaPixelId || null,
            enabled: anyApp.settings?.metaPixelEnabled ?? true,
            config: {
              autoPageviews: anyApp.settings?.autoTrackPageviews ?? true,
              autoClicks: anyApp.settings?.autoTrackClicks ?? true,
              autoScroll: anyApp.settings?.autoTrackScroll ?? false,
            },
            customEvents: customEvents,
          },
          { headers: corsHeaders }
        );
      }

      return Response.json(
        { error: "No pixel found for this shop", shop },
        { status: 404, headers: corsHeaders }
      );
    }

    const app = user.apps[0];
    
    // Fetch custom events for this app
    const customEvents = await prisma.customEvent.findMany({
      where: { appId: app.id, isActive: true },
      select: { name: true, selector: true, eventType: true, metaEventName: true },
    });

    return Response.json(
      {
        pixelId: app.appId,
        appName: app.name,
        metaPixelId: app.settings?.metaPixelId || null,
        enabled: app.settings?.metaPixelEnabled ?? true,
        config: {
          autoPageviews: app.settings?.autoTrackPageviews ?? true,
          autoClicks: app.settings?.autoTrackClicks ?? true,
          autoScroll: app.settings?.autoTrackScroll ?? false,
        },
        customEvents: customEvents,
      },
      { headers: corsHeaders }
    );
  } catch (error) {
    console.error("[API Get Pixel ID] Error:", error);
    return Response.json(
      { error: "Internal error" },
      { status: 500, headers: corsHeaders }
    );
  }
}

export default function GetPixelIdRoute() {
  return null;
}
