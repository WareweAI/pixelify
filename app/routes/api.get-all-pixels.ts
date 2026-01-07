// API endpoint to get all pixels for a shop (for theme extension dropdown)
import type { LoaderFunctionArgs } from "react-router";
import prisma from "~/db.server";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type",
  "Content-Type": "application/json",
};

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
    const user = await prisma.user.findUnique({
      where: { storeUrl: shop },
    });

    if (!user) {
      return Response.json(
        { error: "Shop not found", pixels: [] },
        { status: 404, headers: corsHeaders }
      );
    }

    // Get all pixels for this user
    const apps = await prisma.app.findMany({
      where: { userId: user.id },
      include: { settings: true },
      orderBy: { createdAt: "desc" },
    });

    const pixels = apps.map(app => ({
      id: app.id,
      appId: app.appId,
      name: app.name,
      enabled: app.enabled,
      metaPixelId: app.settings?.metaPixelId || null,
      metaPixelEnabled: app.settings?.metaPixelEnabled || false,
      createdAt: app.createdAt,
    }));

    console.log(`[API Get All Pixels] Returning ${pixels.length} pixels for shop: ${shop}`);

    return Response.json(
      { 
        success: true, 
        pixels,
        shop,
      },
      { headers: corsHeaders }
    );
  } catch (error) {
    console.error("[API Get All Pixels] Error:", error);
    return Response.json(
      { error: "Internal error", pixels: [] },
      { status: 500, headers: corsHeaders }
    );
  }
}

export default function GetAllPixelsRoute() {
  return null;
}
