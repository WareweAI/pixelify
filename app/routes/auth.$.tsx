
import type { HeadersFunction, LoaderFunctionArgs } from "react-router";
import { getShopifyInstance } from "../shopify.server";
import { boundary } from "@shopify/shopify-app-react-router/server";

export const loader = async ({ request }: LoaderFunctionArgs) => {
  const shopify = getShopifyInstance();
  await shopify.authenticate.admin(request);
  return null;
};

export const headers: HeadersFunction = (headersArgs) => {
  return boundary.headers(headersArgs);
};

export default function AuthCatchAll() {
    return null;
}