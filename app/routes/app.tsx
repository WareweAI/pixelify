  import type { HeadersFunction, LoaderFunctionArgs } from "react-router";
  import { Outlet, useLoaderData, useRouteError } from "react-router";
  import { boundary } from "@shopify/shopify-app-react-router/server";
  import { AppProvider as ShopifyAppProvider } from "@shopify/shopify-app-react-router/react";
  import { AppProvider as PolarisAppProvider } from "@shopify/polaris";
  import "@shopify/polaris/build/esm/styles.css";
  import enTranslations from "@shopify/polaris/locales/en.json";
  import { getShopifyInstance } from "../shopify.server";
  import { BillingRedirect } from "../components/BillingRedirect";

  export const loader = async ({ request }: LoaderFunctionArgs) => {
    const url = new URL(request.url);
    const chargeId = url.searchParams.get('charge_id');

    const shopifyInstance = getShopifyInstance();

    if (!shopifyInstance?.authenticate) {
      console.error("Shopify not configured. Check environment variables:", {
        hasApiKey: !!process.env.SHOPIFY_API_KEY,
        hasApiSecret: !!process.env.SHOPIFY_API_SECRET,
        hasAppUrl: !!process.env.SHOPIFY_APP_URL,
        hasDatabase: !!process.env.DATABASE_URL,
      });
      throw new Response("Shopify configuration not found. Please check environment variables.", { status: 500 });
    }

    // If we have charge_id, return a flag to show billing redirect component
    // This avoids server-side redirect which causes iframe issues
    if (chargeId && (url.pathname === '/app' || url.pathname === '/app/')) {
      console.log(`[App] Charge approved: ${chargeId}, will redirect client-side`);
      return { 
        apiKey: process.env.SHOPIFY_API_KEY || "",
        showBillingRedirect: true
      };
    }

    // Authenticate for all other requests
    try {
      await shopifyInstance.authenticate.admin(request);
    } catch (error) {
      // If it's a redirect response (302/401), re-throw it for proper redirect handling
      if (error instanceof Response) {
        // Check if it's an HTML response (Shopify bounce page) instead of proper redirect
        const contentType = error.headers.get('content-type');
        if (contentType?.includes('text/html') && error.status === 200) {
          console.error("[App] Session expired - Shopify returned HTML bounce page");
          // This is a session expiry - trigger re-authentication
          throw new Response("Session expired. Please reload the app to re-authenticate.", { status: 401 });
        }
        // Otherwise, it's a proper redirect - re-throw it
        throw error;
      }
      
      console.error("[App] Authentication error:", error);
      // For other errors, throw a 401 to trigger re-authentication
      throw new Response("Session expired. Please reload the app.", { status: 401 });
    }

    // Redirect /app to /app/dashboard
    if (url.pathname === '/app' || url.pathname === '/app/') {
      const { redirect } = await import("react-router");
      throw redirect("/app/dashboard");
    }

    return { 
      apiKey: process.env.SHOPIFY_API_KEY || "",
      showBillingRedirect: false
    };
  };

  export default function App() {
    const { apiKey, showBillingRedirect } = useLoaderData<typeof loader>();

    // If billing redirect is needed, show the redirect component
    if (showBillingRedirect) {
      return (
        <ShopifyAppProvider embedded apiKey={apiKey}>
          <PolarisAppProvider i18n={enTranslations}>
            <BillingRedirect />
          </PolarisAppProvider>
        </ShopifyAppProvider>
      );
    }

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
