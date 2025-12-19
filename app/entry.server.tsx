import { PassThrough } from "stream";
import { renderToPipeableStream } from "react-dom/server";
import { ServerRouter } from "react-router";
import { createReadableStreamFromReadable } from "@react-router/node";
import { type EntryContext } from "react-router";
import { isbot } from "isbot";
import { loadEnv } from "./lib/env-loader.server";

// Load environment variables FIRST, before importing shopify.server
loadEnv();

// Now import shopify.server (which depends on env vars being loaded)
import { addDocumentResponseHeaders } from "./shopify.server";

export const streamTimeout = 5000;

export default async function handleRequest(
  request: Request,
  responseStatusCode: number,
  responseHeaders: Headers,
  reactRouterContext: EntryContext
) {
  const url = new URL(request.url);
  
  // Skip HTML rendering and CSP for App Proxy/API routes (they return JSON/JS directly)
  const isAppProxyRoute = url.pathname.startsWith('/apps/proxy/') || 
                          url.pathname.startsWith('/apps/pixel-api/') ||
                          url.pathname.startsWith('/api/');
  
  // For API routes, React Router will handle the response from loader/action
  // We still need to render through React Router, but it will use the Response from the route
  // The key is that the route loader/action returns a Response directly, which React Router will use

  // Add Shopify headers if available (for regular app routes)
  try {
    addDocumentResponseHeaders(request, responseHeaders);
  } catch (error) {
    // Shopify not configured - this is fine for landing page on Vercel
    console.log("Shopify headers not added - running in standalone mode");
  }

  // Ensure proper headers for Shopify embedding (only for app routes, not App Proxy)
  // Set CSP AFTER Shopify headers to override any 'none' policy Shopify might set
  responseHeaders.delete("X-Frame-Options"); // Remove any existing X-Frame-Options
  
  // Only set CSP for non-API routes (API routes don't need CSP)
  if (!isAppProxyRoute) {
    // Override any CSP that Shopify might have set
    responseHeaders.set("Content-Security-Policy", "frame-ancestors https://*.myshopify.com https://admin.shopify.com;");
  }
  const userAgent = request.headers.get("user-agent");
  const callbackName = isbot(userAgent ?? '')
    ? "onAllReady"
    : "onShellReady";

  return new Promise((resolve, reject) => {
    const { pipe, abort } = renderToPipeableStream(
      <ServerRouter
        context={reactRouterContext}
        url={request.url}
      />,
      {
        [callbackName]: () => {
          const body = new PassThrough();
          const stream = createReadableStreamFromReadable(body);

          // For API routes, don't set Content-Type to HTML
          // React Router will use the Response from loader/action which has the correct Content-Type
          // Only set HTML Content-Type for non-API routes
          if (!isAppProxyRoute) {
            responseHeaders.set("Content-Type", "text/html");
          }
          // For API routes, the loader/action Response headers will take precedence
          
          resolve(
            new Response(stream, {
              headers: responseHeaders,
              status: responseStatusCode,
            })
          );
          pipe(body);
        },
        onShellError(error) {
          reject(error);
        },
        onError(error) {
          responseStatusCode = 500;
          console.error(error);
        },
      }
    );

    // React has enough time to flush down the rejected boundary contents
    setTimeout(abort, streamTimeout + 1000);
  });
}
