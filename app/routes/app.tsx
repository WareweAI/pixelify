  import type { HeadersFunction, LoaderFunctionArgs } from "react-router";
  import { Outlet, useLoaderData, useRouteError } from "react-router";
  import { boundary } from "@shopify/shopify-app-react-router/server";
  import { AppProvider as ShopifyAppProvider } from "@shopify/shopify-app-react-router/react";
  import { AppProvider as PolarisAppProvider } from "@shopify/polaris";
  import "@shopify/polaris/build/esm/styles.css";
  import enTranslations from "@shopify/polaris/locales/en.json";
  import { getShopifyInstance } from "../shopify.server";

  export const loader = async ({ request }: LoaderFunctionArgs) => {
    const url = new URL(request.url);

    if (url.pathname === '/app' || url.pathname === '/app/') {
      const { redirect } = await import("react-router");
      throw redirect("/app/dashboard");
    }

    const shopify = getShopifyInstance();

    if (!shopify?.authenticate) {
      console.error("Shopify not configured. Check environment variables:", {
        hasApiKey: !!process.env.SHOPIFY_API_KEY,
        hasApiSecret: !!process.env.SHOPIFY_API_SECRET,
        hasAppUrl: !!process.env.SHOPIFY_APP_URL,
        hasDatabase: !!process.env.DATABASE_URL,
      });
      throw new Response("Shopify configuration not found. Please check environment variables.", { status: 500 });
    }

    try {
      const { session } = await shopify.authenticate.admin(request);

      // Register webhooks after authentication
      try {
        const webhookTopics = [
          { topic: "orders/create", path: "/webhooks/orders/create" },
          { topic: "checkouts/create", path: "/webhooks/checkouts/create" },
          { topic: "carts/create", path: "/webhooks/carts/create" },
        ];

        for (const { topic, path } of webhookTopics) {
          try {
            const webhookAddress = `${process.env.SHOPIFY_APP_URL}${path}`;

            // First, check if webhook already exists and delete it
            const existingWebhooksResponse = await fetch(
              `https://${session.shop}/admin/api/2024-10/webhooks.json?topic=${topic}`,
              {
                method: "GET",
                headers: {
                  "Content-Type": "application/json",
                  "X-Shopify-Access-Token": session.accessToken || "",
                },
              }
            );

            if (existingWebhooksResponse.ok) {
              const existingWebhooks = await existingWebhooksResponse.json();

              // Delete existing webhooks for this topic and address
              for (const webhook of existingWebhooks.webhooks || []) {
                if (webhook.address === webhookAddress) {
                  console.log(`🗑️ Deleting existing webhook for ${topic}`);
                  await fetch(
                    `https://${session.shop}/admin/api/2024-10/webhooks/${webhook.id}.json`,
                    {
                      method: "DELETE",
                      headers: {
                        "X-Shopify-Access-Token": session.accessToken || "",
                      },
                    }
                  );
                }
              }
            }

            // Now register the new webhook
            const response = await fetch(`https://${session.shop}/admin/api/2024-10/webhooks.json`, {
              method: "POST",
              headers: {
                "Content-Type": "application/json",
                "X-Shopify-Access-Token": session.accessToken || "",
              },
              body: JSON.stringify({
                webhook: {
                  topic,
                  address: webhookAddress,
                  format: "json",
                },
              }),
            });

            if (response.ok) {
              console.log(`✅ Webhook registered: ${topic}`);
            } else {
              const errorData = await response.json();
              console.warn(`⚠️ Failed to register webhook ${topic}:`, errorData);
            }
          } catch (webhookError) {
            console.error(`❌ Error registering webhook ${topic}:`, webhookError);
          }
        }
      } catch (webhookRegistrationError) {
        console.error("Webhook registration failed:", webhookRegistrationError);
      }
    } catch (error) {
      console.error("Authentication failed:", error);
      throw error;
    }

    return { apiKey: process.env.SHOPIFY_API_KEY || "" };
  };

  export default function App() {
    const { apiKey } = useLoaderData<typeof loader>();

    return (
      <ShopifyAppProvider embedded apiKey={apiKey}>
        <PolarisAppProvider i18n={enTranslations}>
          <s-app-nav>
            <s-link href="/app/dashboard">Dashboard</s-link>
            <s-link href="/app/pixels">Facebook Pixels Manager</s-link>
            <s-link href="/app/custom-events">Custom Events</s-link>
            <s-link href="/app/conversions">Conversions</s-link>
            <s-link href="/app/events">Events</s-link>
            <s-link href="/app/analytics">Analytics</s-link>
            <s-link href="/app/pricing">pricing</s-link>
            <s-link href="/app/settings">Settings</s-link>
          </s-app-nav>
          <Outlet />
        </PolarisAppProvider>
      </ShopifyAppProvider>
    );
  }

  export function ErrorBoundary() {
    return boundary.error(useRouteError());
  }

  export const headers: HeadersFunction = (headersArgs) => {
    return boundary.headers(headersArgs);
  };
