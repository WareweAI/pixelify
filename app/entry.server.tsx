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
  // Add Shopify headers if available
  try {
    addDocumentResponseHeaders(request, responseHeaders);
  } catch (error) {
    // Shopify not configured - this is fine for landing page on Vercel
    console.log("Shopify headers not added - running in standalone mode");
  }

  // Ensure proper headers for Shopify embedding
  // Only set CSP for non-API routes - React Router will handle API route responses
  const url = new URL(request.url);
  const isAppProxyRoute = url.pathname.startsWith('/apps/proxy/') || 
                          url.pathname.startsWith('/apps/pixel-api/') ||
                          url.pathname.startsWith('/api/');
  
  if (!isAppProxyRoute) {
    responseHeaders.delete("X-Frame-Options"); // Remove any existing X-Frame-Options
    // Override any CSP that Shopify might have set (including 'none' policies)
    responseHeaders.set("Content-Security-Policy", "frame-ancestors https://*.myshopify.com https://admin.shopify.com https://shop.app;");
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

          // React Router v7 automatically uses Response objects from loaders/actions
          // For API routes, the Response from loader will have the correct Content-Type
          // Only set HTML Content-Type if this is not an API route
          if (!isAppProxyRoute) {
            responseHeaders.set("Content-Type", "text/html");
          }
          
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

    // Automatically timeout the React renderer after 6 seconds, which ensures
    // React has enough time to flush down the rejected boundary contents
    setTimeout(abort, streamTimeout + 1000);
  });
}
