
import type { HeadersFunction, LoaderFunctionArgs } from "react-router";
import { getShopifyInstance } from "../shopify.server";
import { boundary } from "@shopify/shopify-app-react-router/server";

export const loader = async ({ request }: LoaderFunctionArgs) => {
  const shopify = getShopifyInstance();
  try {
    await shopify.authenticate.admin(request);
    return null;
  } catch (error) {
    if (error instanceof Response && error.status === 302) {
      const location = error.headers.get('location');
      if (location) {
        return new Response(
          `<html><body><script>window.top.location.href = '${location.replace(/'/g, "\\'")}';</script></body></html>`,
          {
            headers: { 'Content-Type': 'text/html' },
          }
        );
      }
    }
    throw error;
  }
};

export const headers: HeadersFunction = (headersArgs) => {
  return boundary.headers(headersArgs);
};

export default function AuthCatchAll() {
    return null;
}