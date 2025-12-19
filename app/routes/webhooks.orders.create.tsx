// Webhook: orders/create - Server-side purchase tracking (adblocker-proof)
import type { ActionFunctionArgs } from "react-router";
import { getShopifyInstance } from "../shopify.server";
import prisma from "../db.server";
import crypto from "crypto";
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
    const order = payload as any;

    console.log(`[Webhook] ${topic} from ${shop}`);
    
    // Find the shop's pixel
    const user = await prisma.user.findUnique({
      where: { storeUrl: shop || "" },
    });

    if (!user) {
      console.log(`[Webhook] Shop not registered: ${shop}`);
      return new Response("OK", { status: 200 });
    }

    const app = await prisma.app.findFirst({
      where: { userId: user.id },
      include: { settings: true },
    });

    if (!app) {
      console.log(`[Webhook] No pixel for shop: ${shop}`);
      return new Response("OK", { status: 200 });
    }

    // Extract order data
    const totalPrice = parseFloat(order.total_price || "0");
    const currency = order.currency || "USD";
    const orderId = order.id?.toString() || order.name;
    const customerEmail = order.email;
    const customerIp = order.browser_ip || order.client_details?.browser_ip;
    const userAgent = order.client_details?.user_agent || "";

    // Extract products
    const products = (order.line_items || []).map((item: any) => ({
      id: item.product_id?.toString(),
      name: item.title,
      price: parseFloat(item.price || "0"),
      quantity: item.quantity,
      sku: item.sku,
    }));

    // Create purchase event (server-side, adblocker-proof!)
    await prisma.event.create({
      data: {
        appId: app.id,
        eventName: "purchase",
        url: order.order_status_url || null,
        ipAddress: app.settings?.recordIp ? customerIp : null,
        userAgent,
        value: totalPrice,
        currency,
        productId: orderId,
        productName: `Order ${order.name}`,
        quantity: products.length,
        customData: {
          order_id: orderId,
          order_name: order.name,
          customer_email: customerEmail,
          products,
          shipping: order.shipping_lines,
          discount_codes: order.discount_codes,
          source: "webhook", // Mark as server-side tracked
        },
      },
    });

    // Update daily stats
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    await prisma.dailyStats.upsert({
      where: { appId_date: { appId: app.id, date: today } },
      update: {
        purchases: { increment: 1 },
        revenue: { increment: totalPrice },
      },
      create: {
        appId: app.id,
        date: today,
        purchases: 1,
        revenue: totalPrice,
      },
    });

    console.log(`[Webhook] Purchase tracked: ${orderId} - $${totalPrice} ${currency}`);

    // Forward to Meta CAPI if enabled
    if (app.settings?.metaPixelEnabled && app.settings?.metaVerified && app.settings?.metaAccessToken) {
      try {
        await forwardToMeta({
          pixelId: app.settings.metaPixelId!,
          accessToken: app.settings.metaAccessToken!,
          testEventCode: app.settings.metaTestEventCode || undefined,
          event: {
            eventName: "Purchase",
            eventTime: Math.floor(Date.now() / 1000),
            eventSourceUrl: order.order_status_url || null,
            actionSource: "website",
            userData: {
              clientIpAddress: customerIp,
              clientUserAgent: userAgent,
              em: customerEmail ? crypto.createHash("sha256").update(customerEmail.toLowerCase()).digest("hex") : undefined,
            },
            customData: {
              currency,
              value: totalPrice,
              content_ids: products.map((p: any) => p.id),
              contents: products.map((p: any) => ({ id: p.id, quantity: p.quantity })),
              order_id: orderId,
            },
          },
        });
        console.log("[Webhook] Forwarded to Meta CAPI");
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

export default function WebhookOrdersCreate() {
  return null;
}

