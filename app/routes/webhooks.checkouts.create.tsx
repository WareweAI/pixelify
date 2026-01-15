// Webhook: checkouts/create - Server-side InitiateCheckout tracking
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

  console.log(`[Webhook] checkouts/create from ${shop}`);

  if (process.env.NODE_ENV === "production" && !verifyWebhook(rawBody, hmac)) {
    return new Response("Unauthorized", { status: 401 });
  }

  try {
    const checkout = JSON.parse(rawBody);

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
          console.log(`[Webhook] Found catalog ${catalogId} for InitiateCheckout event`);
        }
      } catch (catalogError) {
        console.error('[Webhook] Error fetching catalog:', catalogError);
      }
    }

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
          ...(catalogId && { catalog_id: catalogId }),
        },
      },
    });

    // Forward to Meta CAPI if enabled
    if (app.settings?.metaPixelEnabled && app.settings?.metaAccessToken) {
      try {
        const metaEvent = {
          event_name: "InitiateCheckout",
          event_time: Math.floor(Date.now() / 1000),
          action_source: "website",
          user_data: {
            em: checkout.email ? crypto.createHash("sha256").update(checkout.email.toLowerCase()).digest("hex") : undefined,
            client_ip_address: checkout.browser_ip || "0.0.0.0",
            client_user_agent: checkout.user_agent || "Shopify Webhook",
          },
          custom_data: {
            currency,
            value: totalPrice,
            content_ids: products.map((p: any) => p.id),
            content_type: "product",
            contents: products.map((p: any) => ({ id: p.id, quantity: p.quantity })),
            num_items: products.length,
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
        console.log(`[Webhook] InitiateCheckout forwarded to Meta CAPI${catalogInfo}`);
      } catch (metaErr) {
        console.error("[Webhook] Meta CAPI error:", metaErr);
      }
    }

    console.log(`[Webhook] InitiateCheckout tracked: ${totalPrice}`);
    return new Response("OK", { status: 200 });
  } catch (error) {
    console.error("[Webhook] Error:", error);
    return new Response("Error", { status: 500 });
  }
}

export default function WebhookCheckoutsCreate() {
  return null;
}
