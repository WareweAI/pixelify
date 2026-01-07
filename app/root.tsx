import {
  Links,
  Meta,
  Outlet,
  Scripts,
  ScrollRestoration,
} from "react-router";
import type { LinksFunction, HeadersFunction, LoaderFunctionArgs } from "react-router";
import { AppProvider } from "@shopify/polaris";
import { boundary } from "@shopify/shopify-app-react-router/server";

import { getShopifyInstance } from "./shopify.server";
import prisma from "./db.server";

import tailwindStyles from "./styles/tailwind.css?url";

export const links: LinksFunction = () => [
  { rel: "stylesheet", href: tailwindStyles as string },
  { rel: "preconnect", href: "https://cdn.shopify.com/" },
  {
    rel: "stylesheet",
    href: "https://cdn.shopify.com/static/fonts/inter/v4/styles.css",
  },
  {
    rel: "stylesheet",
    href: "https://unpkg.com/@shopify/polaris@13.9.5/build/esm/styles.css",
  },
];

export const headers: HeadersFunction = (headersArgs) => {
  return boundary.headers(headersArgs);
};

// Optional root loader: when an authenticated admin request hits an /app route,
// capture and persist the shop's email for use by webhooks and emails.
export async function loader({ request }: LoaderFunctionArgs) {
  const url = new URL(request.url);

  // Only run for embedded app pages; avoid interfering with public/auth routes
  if (!url.pathname.startsWith("/app")) {
    return null;
  }

  const shopify = getShopifyInstance();

  if (!shopify?.authenticate) {
    return null;
  }

  try {
    const { session, admin } = await shopify.authenticate.admin(request);
    const shop = session.shop;

    // Look up the user so we can associate email with their apps
    const user = await prisma.user.findUnique({
      where: { storeUrl: shop },
      include: { apps: true },
    });

    if (!user || user.apps.length === 0) {
      return null;
    }

    // If any app already has a shopEmail, no need to refetch
    const existingEmail = user.apps.find((a) => a.shopEmail)?.shopEmail;
    if (existingEmail) {
      return null;
    }

    // Fetch shop email via Admin GraphQL (validated query: shop { email })
    let storeEmail: string | null = null;
    try {
      const response = await admin.graphql(
        `#graphql
        query GetShopEmail {
          shop {
            email
            contactEmail
          }
        }`,
      );

      const data = await response.json();
      storeEmail =
        data?.data?.shop?.email || data?.data?.shop?.contactEmail || null;

      if (storeEmail) {
        await prisma.app.updateMany({
          where: { userId: user.id },
          data: { shopEmail: storeEmail },
        });
      }
    } catch (emailError) {
      console.error("Failed to fetch/store shop email in root loader:", emailError);
    }
  } catch {
    // Ignore auth failures here; normal route loaders will handle redirects
    return null;
  }

  return null;
}

export default function App() {
  return (
    <html lang="en">
      <head>
        <meta charSet="utf-8" />
        <meta name="viewport" content="width=device-width,initial-scale=1" />
        <Meta />
        <Links />
      </head>
      <body>
        <AppProvider i18n={{}}>
          <Outlet />
        </AppProvider>
        <ScrollRestoration />
        <Scripts />
      </body>
    </html>
  );
}
