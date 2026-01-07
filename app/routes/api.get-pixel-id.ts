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
  const selectedPixelId = url.searchParams.get("pixelId"); // Optional: specific pixel to use

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
    });

    if (!user) {
      console.log(`[API Get Pixel ID] User not found for shop: ${shop}`);
      return Response.json(
        { error: "No pixel found for this shop", shop },
        { status: 404, headers: corsHeaders }
      );
    }

    let finalApp;

    // If a specific pixel ID is requested, use that
    if (selectedPixelId) {
      finalApp = await prisma.app.findFirst({
        where: { 
          userId: user.id,
          appId: selectedPixelId,
        },
        include: { settings: true },
      });
      
      if (finalApp) {
        console.log(`[API Get Pixel ID] Using selected pixel: ${finalApp.appId} (${finalApp.name})`);
      }
    }

    // If no specific pixel or not found, get the most recent enabled app
    if (!finalApp) {
      finalApp = await prisma.app.findFirst({
        where: { 
          userId: user.id,
          enabled: true,
        },
        include: { settings: true },
        orderBy: { createdAt: "desc" },
      });
    }

    // If still no app, try to get any app
    if (!finalApp) {
      finalApp = await prisma.app.findFirst({
        where: { userId: user.id },
        include: { settings: true },
        orderBy: { createdAt: "desc" },
      });
    }

    if (!finalApp) {
      console.log(`[API Get Pixel ID] No app found for user: ${user.id}`);
      return Response.json(
        { error: "No pixel found for this shop", shop },
        { status: 404, headers: corsHeaders }
      );
    }

    console.log(`[API Get Pixel ID] Returning app: ${finalApp.appId} (${finalApp.name}) for shop: ${shop}`);

    const customEvents = finalApp.settings?.customEventsEnabled !== false ? await prisma.customEvent.findMany({
      where: { appId: finalApp.id, isActive: true },
      select: { name: true, selector: true, eventType: true, metaEventName: true },
    }) : [];

    return Response.json(
      {
        pixelId: finalApp.appId,
        appName: finalApp.name,
        metaPixelId: finalApp.settings?.metaPixelId || null,
        enabled: finalApp.settings?.metaPixelEnabled ?? true,
        config: {
          autoPageviews: finalApp.settings?.autoTrackPageviews ?? true,
          autoClicks: finalApp.settings?.autoTrackClicks ?? true,
          autoScroll: finalApp.settings?.autoTrackScroll ?? false,
          autoViewContent: finalApp.settings?.autoTrackViewContent ?? true,
          autoAddToCart: finalApp.settings?.autoTrackAddToCart ?? true,
          autoInitiateCheckout: finalApp.settings?.autoTrackInitiateCheckout ?? true,
          autoPurchase: finalApp.settings?.autoTrackPurchase ?? true,
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
