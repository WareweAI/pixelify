import type { LoaderFunctionArgs } from "react-router";
import prisma from "../db.server";

export async function loader({ request }: LoaderFunctionArgs) {
  const url = new URL(request.url);
  const shopDomain = url.searchParams.get("shop");

  console.log(`[App Proxy] GET get-pixel-id, shop: ${shopDomain}`);

  if (!shopDomain) {
    return Response.json({ error: "Missing shop parameter" }, { status: 400 });
  }

  try {
    const user = await prisma.user.findUnique({
      where: { storeUrl: shopDomain },
    });

    if (!user) {
      console.log(`[App Proxy] User not found for shop: ${shopDomain}`);
      return Response.json({ error: "Shop not found", shop: shopDomain }, { status: 404 });
    }

    const app = await prisma.app.findFirst({
      where: { userId: user.id },
      include: { settings: true },
      orderBy: { createdAt: "desc" },
    });

    if (!app) {
      console.log(`[App Proxy] No pixel configured for shop: ${shopDomain}`);
      return Response.json({ error: "No pixel configured", shop: shopDomain }, { status: 404 });
    }

    const customEvents = await prisma.customEvent.findMany({
      where: { appId: app.id, isActive: true },
      select: { name: true, selector: true, eventType: true, metaEventName: true },
    });

    console.log(`[App Proxy] Returning config for pixel: ${app.appId}`);

    return Response.json({
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
    });
  } catch (error) {
    console.error("[App Proxy get-pixel-id] Error:", error);
    return Response.json({ error: "Internal error" }, { status: 500 });
  }
}
