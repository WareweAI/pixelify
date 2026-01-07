import type { ActionFunctionArgs } from "react-router";
import { getShopifyInstance, apiVersion } from "../shopify.server";
import db from "../db.server";
import { sendGoodbyeEmail } from "../services/email.server";

export const action = async ({ request }: ActionFunctionArgs) => {
  const shopify = getShopifyInstance();
  const { shop, session, topic } = await shopify.authenticate.webhook(request);

  console.log(`Received ${topic} webhook for ${shop}`);

  if (session) {
    try {
      // Find the user by shop domain
      const user = await db.user.findUnique({
        where: { storeUrl: shop },
        include: { apps: true },
      });

      // Get the most recent app for this shop (there is usually only one)
      const app = user?.apps?.[0];

      // 1) Prefer stored shop email, otherwise fall back to session fields
      let shopEmail =
        app?.shopEmail ||
        (session as any).email || 
        (session as any).user?.email ||
        null;

      // 2) If we still don't have an email, ask Shopify Admin GraphQL API for the shop's contact email
      if (!shopEmail && (session as any).accessToken) {
        try {
          const response = await fetch(
            `https://${shop}/admin/api/${apiVersion}/graphql.json`,
            {
              method: "POST",
              headers: {
                "X-Shopify-Access-Token": (session as any).accessToken,
                "Content-Type": "application/json",
                Accept: "application/json",
              },
              body: JSON.stringify({
                query: `
                  query shopEmail {
                    shop {
                      email
                    }
                  }
                `,
              }),
            },
          );

          const result = await response.json();

          if (!result.errors && result.data?.shop?.email) {
            shopEmail = result.data.shop.email;
          } else {
            console.error(
              "Failed to fetch shop email from Shopify Admin GraphQL API:",
              result.errors || result,
            );
          }
        } catch (apiError) {
          console.error(
            "Error calling Shopify Admin GraphQL API for shop email:",
            apiError,
          );
        }
      }

      // 3) If we discovered an email but haven't stored it yet, persist it for future webhooks
      if (app && shopEmail && !app.shopEmail) {
        await db.app.update({
          where: { id: app.id },
          data: { shopEmail },
        });
      }

      // 4) Finally, send the goodbye email if we have an address
      if (shopEmail) {
        await sendGoodbyeEmail(shopEmail, shop);
      } else {
        console.error(
          "No shop email found in database, session, or Shopify API for uninstall webhook",
        );
      }
    } catch (error) {
      console.error("Failed to send goodbye email:", error);
    }

    // Clean up all sessions for this shop
    await db.session.deleteMany({ where: { shop } });
  }

  return new Response();
};

export default function WebhookAppUninstalled() {
    return null;
}
