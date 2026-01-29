// Debug endpoint to check pixels in database
import type { LoaderFunctionArgs } from "react-router";
import { getShopifyInstance } from "../shopify.server";
import prisma from "../db.server";

export const loader = async ({ request }: LoaderFunctionArgs) => {
  try {
    const shopify = getShopifyInstance();
    const { session } = await shopify.authenticate.admin(request);
    const shop = session.shop;

    // Find user
    const user = await prisma.user.findUnique({
      where: { storeUrl: shop },
    });

    if (!user) {
      return Response.json({
        error: "User not found",
        shop,
      });
    }

    // Get all apps with settings
    const apps = await prisma.app.findMany({
      where: { userId: user.id },
      include: {
        settings: {
          select: {
            metaPixelId: true,
            metaPixelEnabled: true,
            metaAccessToken: true,
          }
        }
      }
    });

    // Get all app settings with pixel IDs
    const appSettings = await prisma.appSettings.findMany({
      where: {
        app: { userId: user.id },
      },
      select: {
        id: true,
        appId: true,
        metaPixelId: true,
        metaPixelEnabled: true,
        app: {
          select: {
            id: true,
            name: true,
            appId: true,
          }
        }
      }
    });

    return Response.json({
      success: true,
      shop,
      userId: user.id,
      totalApps: apps.length,
      apps: apps.map(app => ({
        id: app.id,
        name: app.name,
        appId: app.appId,
        metaPixelId: app.settings?.metaPixelId || null,
        metaPixelEnabled: app.settings?.metaPixelEnabled || false,
        hasAccessToken: !!app.settings?.metaAccessToken,
      })),
      appSettings: appSettings.map(setting => ({
        id: setting.id,
        appId: setting.appId,
        appName: setting.app.name,
        metaPixelId: setting.metaPixelId,
        metaPixelEnabled: setting.metaPixelEnabled,
      })),
      pixelIds: appSettings
        .map(s => s.metaPixelId)
        .filter(Boolean),
    });
  } catch (error: any) {
    return Response.json({
      error: error.message,
      stack: error.stack,
    }, { status: 500 });
  }
};
