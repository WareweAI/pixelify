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

    // Find the user's active catalog for product attribution
    let catalogId: string | undefined;
    if (app.settings?.metaPixelEnabled && app.settings?.metaAccessToken) {
      try {
        const catalog = await prisma.facebookCatalog.findFirst({
          where: {
            userId: user.id,
            pixelId: app.settings.metaPixelId,
            pixelEnabled: true,
          },
          orderBy: { createdAt: 'desc' },
        });
        
        if (catalog) {
          catalogId = catalog.catalogId;
          console.log(`[Webhook] Found catalog ${catalogId} for AddToCart event`);
        }
      } catch (catalogError) {
        console.error('[Webhook] Error fetching catalog:', catalogError);
      }
    }

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
            ...(catalogId && { catalog_id: catalogId }),
          },
        },
      });
      
      // Forward to Meta CAPI if enabled
      if (app.settings?.metaPixelEnabled && app.settings?.metaAccessToken) {
        try {
          const metaEvent = {
            event_name: "AddToCart",
            event_time: Math.floor(Date.now() / 1000),
            action_source: "website",
            user_data: {
              client_ip_address: "0.0.0.0",
              client_user_agent: "Shopify Webhook",
            },
            custom_data: {
              content_ids: [item.product_id?.toString()],
              content_type: "product",
              content_name: item.title,
              value: parseFloat(item.price || "0"),
              currency: cart.currency || "USD",
              num_items: item.quantity,
              // Link to catalog for better ad optimization
              ...(catalogId && { catalog_id: catalogId }),
            },
          };

          await fetch(`https://graph.facebook.com/v24.0/${app.settings.metaPixelId}/events`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              data: [metaEvent],
              access_token: app.settings.metaAccessToken,
              test_event_code: app.settings.metaTestEventCode || undefined,
            }),
          });
          
          const catalogInfo = catalogId ? ` (linked to catalog ${catalogId})` : '';
          console.log(`[Webhook] AddToCart forwarded to Meta CAPI${catalogInfo}`);
        } catch (metaErr) {
          console.error("[Webhook] Meta CAPI error:", metaErr);
        }
      }
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