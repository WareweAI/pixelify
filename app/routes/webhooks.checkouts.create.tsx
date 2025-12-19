// Webhook: checkouts/create - Server-side InitiateCheckout tracking (adblocker-proof)
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
    const checkout = payload as any;

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

    const totalPrice = parseFloat(checkout.total_price || "0");
    const currency = checkout.currency || "USD";

    const products = (checkout.line_items || []).map((item: any) => ({
      id: item.product_id?.toString(),
      name: item.title,
      price: parseFloat(item.price || "0"),
      quantity: item.quantity,
    }));

    await prisma.event.create({
      data: {
        appId: app.id,
        eventName: "initiateCheckout",
        url: checkout.abandoned_checkout_url || null,
        value: totalPrice,
        currency,
        quantity: products.length,
        customData: {
          checkout_token: checkout.token,
          products,
          source: "webhook",
        },
      },
    });

    console.log(`[Webhook] InitiateCheckout tracked: $${totalPrice}`);

    // Forward to Meta CAPI if enabled
    if (app.settings?.metaPixelEnabled && app.settings?.metaVerified && app.settings?.metaAccessToken) {
      try {
        await forwardToMeta({
          pixelId: app.settings.metaPixelId!,
          accessToken: app.settings.metaAccessToken!,
          testEventCode: app.settings.metaTestEventCode || undefined,
          event: {
            eventName: "InitiateCheckout",
            eventTime: Math.floor(Date.now() / 1000),
            eventSourceUrl: checkout.abandoned_checkout_url || null,
            actionSource: "website",
            userData: {
              clientIpAddress: checkout.browser_ip || null,
              clientUserAgent: checkout.user_agent || null,
            },
            customData: {
              currency,
              value: totalPrice,
              content_ids: products.map((p: any) => p.id),
              contents: products.map((p: any) => ({ id: p.id, quantity: p.quantity })),
              num_items: products.length,
            },
          },
        });
        console.log("[Webhook] Forwarded InitiateCheckout to Meta CAPI");
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

export default function WebhookCheckoutsCreate() {
  return null;
}

