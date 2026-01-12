  import type { HeadersFunction, LoaderFunctionArgs } from "react-router";
  import { Outlet, useLoaderData, useRouteError } from "react-router";
  import { boundary } from "@shopify/shopify-app-react-router/server";
  import { AppProvider as ShopifyAppProvider } from "@shopify/shopify-app-react-router/react";
  import { AppProvider as PolarisAppProvider } from "@shopify/polaris";
  import "@shopify/polaris/build/esm/styles.css";
  import enTranslations from "@shopify/polaris/locales/en.json";
  import shopify, { getShopifyInstance } from "../shopify.server";

  export const loader = async ({ request }: LoaderFunctionArgs) => {
    const url = new URL(request.url);
    const chargeId = url.searchParams.get('charge_id');

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

    // Try to authenticate
    try {
      await shopify.authenticate.admin(request);
    } catch (error) {
      // If authentication redirects (OAuth flow) and we have charge_id, preserve it
      if (chargeId && error instanceof Response) {
        const location = error.headers.get('Location');
        if (location && (error.status === 302 || error.status === 307)) {
          try {
            const redirectUrl = new URL(location, request.url);
            redirectUrl.searchParams.set('charge_id', chargeId);
            const { redirect } = await import("react-router");
            throw redirect(redirectUrl.toString());
          } catch (urlError) {
            // If URL parsing fails, continue with original redirect
            console.error('Failed to preserve charge_id in redirect:', urlError);
          }
        }
      }
      // Rethrow the error (could be redirect or other error)
      throw error;
    }

    // If we have charge_id and are on /app, redirect to dashboard with charge_id
    if (chargeId && (url.pathname === '/app' || url.pathname === '/app/')) {
      const { redirect } = await import("react-router");
      throw redirect(`/app/dashboard?charge_id=${chargeId}`);
    }

    if (url.pathname === '/app' || url.pathname === '/app/') {
      const { redirect } = await import("react-router");
      throw redirect("/app/dashboard");
    }

    // Webhook registration removed - app doesn't need protected customer data webhooks

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
            <s-link href="/app/catalog">Catalog</s-link>
            <s-link href="/app/analytics">Analytics</s-link>
            <s-link href="/app/pricing">pricing</s-link>
            <s-link href="/app/settings">Settings</s-link>
            <s-link href="/app/debug-events">Debug Events</s-link>
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
