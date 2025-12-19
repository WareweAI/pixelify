// Webhook: carts/create - Server-side AddToCart tracking (adblocker-proof)
import type { ActionFunctionArgs } from "react-router";
import { getShopifyInstance } from "../shopify.server";
import prisma from "../db.server";
import { forwardToMeta } from "../services/meta-capi.server";

export async function action({ request }: ActionFunctionArgs) {
  const shopify = getShopifyInstance();
  
  if (!shopify?.authenticate) {
    console.error("[Webhook] Shopify not configured");
    return new Response("Service unavailable", { status: 503 });
  }

  try {
    // Use Shopify's built-in webhook authentication
    const { payload, shop, topic } = await shopify.authenticate.webhook(request);
    const cart = payload as any;

    console.log(`[Webhook] ${topic} from ${shop}`);

    const user = await prisma.user.findUnique({
      where: { storeUrl: shop || "" },
    });

    if (!user) return new Response("OK", { status: 200 });

    const app = await prisma.app.findFirst({
      where: { userId: user.id },
      include: { settings: true },
    });

    if (!app) return new Response("OK", { status: 200 });

    const items = cart.line_items || [];
    if (items.length === 0) return new Response("OK", { status: 200 });

    // Track each item added
    for (const item of items) {
      await prisma.event.create({
        data: {
          appId: app.id,
          eventName: "addToCart",
          productId: item.product_id?.toString(),
          productName: item.title,
          value: parseFloat(item.price || "0"),
          quantity: item.quantity,
          customData: {
            variant_id: item.variant_id,
            sku: item.sku,
            source: "webhook",
          },
        },
      });
    }

    console.log(`[Webhook] AddToCart tracked: ${items.length} items`);

    // Forward to Meta CAPI if enabled
    if (app.settings?.metaPixelEnabled && app.settings?.metaVerified && app.settings?.metaAccessToken && items.length > 0) {
      try {
        const firstItem = items[0];
        await forwardToMeta({
          pixelId: app.settings.metaPixelId!,
          accessToken: app.settings.metaAccessToken!,
          testEventCode: app.settings.metaTestEventCode || undefined,
          event: {
            eventName: "AddToCart",
            eventTime: Math.floor(Date.now() / 1000),
            actionSource: "website",
            userData: {
              clientIpAddress: cart.browser_ip || null,
              clientUserAgent: cart.user_agent || null,
            },
            customData: {
              currency: cart.currency || "USD",
              value: parseFloat(firstItem.price || "0"),
              content_ids: [firstItem.product_id?.toString()],
              contents: [{ id: firstItem.product_id?.toString(), quantity: firstItem.quantity }],
            },
          },
        });
        console.log("[Webhook] Forwarded AddToCart to Meta CAPI");
      } catch (metaErr) {
        console.error("[Webhook] Meta CAPI error:", metaErr);
      }
    }

    return new Response("OK", { status: 200 });
  } catch (error) {
    console.error("[Webhook] Error:", error);
    return new Response("Error", { status: 500 });
  }
}

export default function WebhookCartsCreate() {
  return null;
}

