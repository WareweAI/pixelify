// Webhook: carts/create - Server-side AddToCart tracking
import type { ActionFunctionArgs } from "react-router";
import prisma from "~/db.server";
import crypto from "crypto";

function verifyWebhook(body: string, hmac: string | null): boolean {
  if (!hmac) return false;
  const secret = process.env.SHOPIFY_API_SECRET || "";
  const hash = crypto.createHmac("sha256", secret).update(body, "utf8").digest("base64");
  return crypto.timingSafeEqual(Buffer.from(hash), Buffer.from(hmac));
}

export async function action({ request }: ActionFunctionArgs) {
  const hmac = request.headers.get("x-shopify-hmac-sha256");
  const shop = request.headers.get("x-shopify-shop-domain");
  const rawBody = await request.text();

  console.log(`[Webhook] carts/create from ${shop}`);

  if (process.env.NODE_ENV === "production" && !verifyWebhook(rawBody, hmac)) {
    return new Response("Unauthorized", { status: 401 });
  }

  try {
    const cart = JSON.parse(rawBody);

    const user = await prisma.user.findUnique({
      where: { email: shop || "" },
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
    return new Response("OK", { status: 200 });
  } catch (error) {
    console.error("[Webhook] Error:", error);
    return new Response("Error", { status: 500 });
  }
}

export default function WebhookCartsCreate() {
  return null;
}

