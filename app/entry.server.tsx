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
  const isAppProxyRoute = url.pathname.startsWith('/apps/proxy/') || 
                          url.pathname.startsWith('/apps/pixel-api/') ||
                          url.pathname.startsWith('/api/');
  
  // Check if this is a resource route (API route that returns JSON)
  // If Content-Type is already set to JSON, React Router has processed the loader Response
  // and we should NOT render HTML - React Router will handle the Response directly
  const isResourceRoute = isAppProxyRoute || 
                          responseHeaders.get("Content-Type")?.includes("application/json") ||
                          responseHeaders.get("Content-Type")?.includes("application/javascript");
  
  // Add Shopify headers if available (for app routes only)
  // For API routes, we skip Shopify headers to avoid CSP conflicts
  if (!isAppProxyRoute) {
    try {
      addDocumentResponseHeaders(request, responseHeaders);
    } catch (error) {
      // Shopify not configured - this is fine for landing page on Vercel
      console.log("Shopify headers not added - running in standalone mode");
    }
  }

  // Ensure proper headers for Shopify embedding
  // Set CSP AFTER Shopify headers to override any 'none' policies Shopify might set
  if (!isAppProxyRoute) {
    responseHeaders.delete("X-Frame-Options"); // Remove any existing X-Frame-Options
    // Override any CSP that Shopify might have set (including 'none' policies)
    // Set AFTER addDocumentResponseHeaders to ensure our CSP takes precedence
    responseHeaders.set("Content-Security-Policy", "frame-ancestors https://*.myshopify.com https://admin.shopify.com https://shop.app;");
  }
  
  // For resource routes (API routes that return JSON/JS), React Router should use the Response directly
  // We still need to go through the rendering pipeline, but React Router will use the loader's Response body
  // The key is that we DON'T set Content-Type to HTML for these routes
  if (isResourceRoute) {
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
            // For resource routes, React Router should have already set the Response body
            // from the loader. We just need to ensure we don't override the Content-Type
            // The Response body from the loader will be used, not the rendered HTML
            const body = new PassThrough();
            const stream = createReadableStreamFromReadable(body);
            
            // DO NOT set Content-Type to HTML for resource routes
            // The route's headers function or loader Response already set it
            
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

      setTimeout(abort, streamTimeout + 1000);
    });
  }
  
  // For regular app routes, render HTML normally
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

          // Only set HTML Content-Type for non-resource routes
          if (!responseHeaders.has("Content-Type")) {
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
