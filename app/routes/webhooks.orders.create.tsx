// Webhook: orders/create - Server-side purchase tracking (adblocker-proof)
import type { ActionFunctionArgs } from "react-router";
import prisma from "~/db.server";
import crypto from "crypto";

// Verify Shopify webhook signature
function verifyWebhook(body: string, hmac: string | null): boolean {
  if (!hmac) return false;
  const secret = process.env.SHOPIFY_API_SECRET || "";
  const hash = crypto.createHmac("sha256", secret).update(body, "utf8").digest("base64");
  return crypto.timingSafeEqual(Buffer.from(hash), Buffer.from(hmac));
}

export async function action({ request }: ActionFunctionArgs) {
  const hmac = request.headers.get("x-shopify-hmac-sha256");
  const shop = request.headers.get("x-shopify-shop-domain");
  const topic = request.headers.get("x-shopify-topic");
  const rawBody = await request.text();

  console.log(`[Webhook] ${topic} from ${shop}`);

  // Verify signature in production
  if (process.env.NODE_ENV === "production" && !verifyWebhook(rawBody, hmac)) {
    console.error("[Webhook] Invalid signature");
    return new Response("Unauthorized", { status: 401 });
  }

  try {
    const order = JSON.parse(rawBody);
    
    // Find the shop's pixel
    const user = await prisma.user.findUnique({
      where: { email: shop || "" },
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
    if (app.settings?.metaPixelEnabled && app.settings?.metaAccessToken) {
      try {
        const metaEvent = {
          event_name: "Purchase",
          event_time: Math.floor(Date.now() / 1000),
          action_source: "website",
          user_data: {
            em: customerEmail ? crypto.createHash("sha256").update(customerEmail.toLowerCase()).digest("hex") : undefined,
            client_ip_address: customerIp,
            client_user_agent: userAgent,
          },
          custom_data: {
            currency,
            value: totalPrice,
            content_ids: products.map((p: any) => p.id),
            contents: products.map((p: any) => ({ id: p.id, quantity: p.quantity })),
          },
        };

        await fetch(`https://graph.facebook.com/v18.0/${app.settings.metaPixelId}/events`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            data: [metaEvent],
            access_token: app.settings.metaAccessToken,
            test_event_code: app.settings.metaTestEventCode || undefined,
          }),
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

