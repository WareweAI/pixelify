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
  await shopify.authenticate.admin(request);

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
          <s-link href="/app/help">Help</s-link>
          <s-link href="/app/debug-events">🔍 Debug</s-link>
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
