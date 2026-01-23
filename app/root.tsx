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
import { GlobalLayout } from "./components/GlobalLayout";

import "./styles/tailwind.css";
import "./styles/top-navigation.css";
import "./styles/app-layout.css";

const polarisStyles = "https://unpkg.com/@shopify/polaris@13.9.5/build/esm/styles.css";
const interFontStyles = "https://cdn.shopify.com/static/fonts/inter/v4/styles.css";

export const links: LinksFunction = () => [
  // Preconnect to CDN for faster resource loading
  { rel: "preconnect", href: "https://cdn.shopify.com/" },
  { rel: "dns-prefetch", href: "https://unpkg.com" },

  // Load Polaris CSS
  { rel: "stylesheet", href: polarisStyles },

  // Load Inter font
  { rel: "stylesheet", href: interFontStyles },

  // App CSS is imported directly - no need to link
];

export const headers: HeadersFunction = (headersArgs) => {
  return boundary.headers(headersArgs);
};

export async function loader({ request }: LoaderFunctionArgs) {
  const url = new URL(request.url);

  // Skip loader entirely for non-app routes (faster)
  if (!url.pathname.startsWith("/app")) {
    return null;
  }

  const shopify = getShopifyInstance();

  if (!shopify?.authenticate) {
    return null;
  }

  try {
    const { session } = await shopify.authenticate.admin(request);
    
    // Minimal data return - defer everything else
    return { shop: session.shop };
  } catch {
    return null;
  }
}

export default function App() {
  return (
    <html lang="en">
      <head>
        <meta charSet="utf-8" />
        <meta name="viewport" content="width=device-width,initial-scale=1" />
        <Meta />
        <Links />
        
        {/* Inline critical CSS for instant render */}
        <style
          dangerouslySetInnerHTML={{
            __html: `
              /* Critical layout CSS */
              body {
                margin: 0;
                font-family: -apple-system, BlinkMacSystemFont, 'San Francisco', 'Segoe UI', Roboto, 'Helvetica Neue', sans-serif;
                -webkit-font-smoothing: antialiased;
                -moz-osx-font-smoothing: grayscale;
              }
              
              /* Polaris Frame critical styles */
              .Polaris-Frame {
                min-height: 100vh;
                display: flex;
                flex-direction: column;
              }
              
              .Polaris-Frame__Content {
                background: #f6f6f7;
                flex: 1;
              }
              
              /* Prevent layout shift */
              nav {
                background-color: #ffffff;
                border-bottom: 1px solid #e1e3e5;
                position: sticky;
                top: 0;
                z-index: 100;
                height: 56px;
              }
              
              /* Loading state */
              .app-layout-container {
                min-height: 100vh;
                background: #f6f6f7;
              }
            `,
          }}
        />
        
        {/* Fallback for no-JS */}
        <noscript>
          <link rel="stylesheet" href={polarisStyles} />
          <link rel="stylesheet" href={interFontStyles} />
        </noscript>
      </head>
      <body>
        <AppProvider i18n={{}}>
          <GlobalLayout>
            <Outlet />
          </GlobalLayout>
        </AppProvider>
        <ScrollRestoration />
        <Scripts />
        
        {/* Defer non-critical JavaScript */}
        <script
          dangerouslySetInnerHTML={{
            __html: `
              const captureNavigationTiming = () => {
                const navEntries = performance.getEntriesByType('navigation');
                if (navEntries.length > 0) {
                  const nav = navEntries[0];
                  console.log(' FULL NAVIGATION TIMING:', {
                    'Redirect Time': nav.redirectEnd - nav.redirectStart,
                    'DNS Time': nav.domainLookupEnd - nav.domainLookupStart,
                    'TCP Time': nav.connectEnd - nav.connectStart,
                    'Request Time': nav.responseStart - nav.requestStart,
                    'Response Time': nav.responseEnd - nav.responseStart,
                    'Processing Time': nav.domComplete - nav.domInteractive,
                    'Load Complete': nav.loadEventEnd - nav.fetchStart,
                    'Total Time': nav.loadEventEnd - nav.startTime
                  });
                }
              };

              // Defer heavy operations
              if ('requestIdleCallback' in window) {
                requestIdleCallback(() => {
                  // Initialize non-critical features here
                  console.log('Non-critical JS loaded');
                  captureNavigationTiming();
                });
              } else {
                setTimeout(() => {
                  // Fallback for browsers without requestIdleCallback
                  console.log('Non-critical JS loaded (fallback)');
                  captureNavigationTiming();
                }, 2000);
              }
            `,
          }}
        />
      </body>
    </html>
  );
}
