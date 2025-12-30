// API endpoint to get pixel ID for a shop
import type { LoaderFunctionArgs, ActionFunctionArgs } from "react-router";
import prisma from "~/db.server";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type",
  "X-Content-Type-Options": "nosniff",
};

// Handle OPTIONS preflight requests for CORS
export async function action({ request }: ActionFunctionArgs) {
  if (request.method === "OPTIONS") {
    return new Response(null, { status: 204, headers: corsHeaders });
  }
  // Forward non-OPTIONS to loader logic
  return new Response("Method not allowed", { status: 405, headers: corsHeaders });
}

export async function loader({ request }: LoaderFunctionArgs) {

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
      where: { storeUrl: shop },
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
      const anyApp = await prisma.app.findFirst({
        where: {
          user: { storeUrl: shop },
        },
        include: { settings: true },
        orderBy: { createdAt: "desc" },
      });

      if (anyApp) {
        const customEvents = anyApp.settings?.customEventsEnabled !== false ? await prisma.customEvent.findMany({
          where: { appId: anyApp.id, isActive: true },
          select: { name: true, selector: true, eventType: true, metaEventName: true },
        }) : [];

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
              autoViewContent: anyApp.settings?.autoTrackViewContent ?? true,
              autoAddToCart: anyApp.settings?.autoTrackAddToCart ?? true,
              autoInitiateCheckout: anyApp.settings?.autoTrackInitiateCheckout ?? true,
              autoPurchase: anyApp.settings?.autoTrackPurchase ?? true,
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
    
    const customEvents = app.settings?.customEventsEnabled !== false ? await prisma.customEvent.findMany({
      where: { appId: app.id, isActive: true },
      select: { name: true, selector: true, eventType: true, metaEventName: true },
    }) : [];

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
          autoViewContent: app.settings?.autoTrackViewContent ?? true,
          autoAddToCart: app.settings?.autoTrackAddToCart ?? true,
          autoInitiateCheckout: app.settings?.autoTrackInitiateCheckout ?? true,
          autoPurchase: app.settings?.autoTrackPurchase ?? true,
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
