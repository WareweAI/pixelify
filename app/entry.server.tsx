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
  
  // Detect resource routes that should return JSON/JS, not HTML
  const isResourceRoute = url.pathname.startsWith("/apps/proxy/") ||
                         url.pathname.startsWith("/apps/pixel-api/") ||
                         url.pathname.startsWith("/api/");
  
  // Check if Content-Type is already set to JSON/JS (from route's headers function or loader Response)
  const existingContentType = responseHeaders.get("Content-Type");
  const isResourceRouteByContentType = existingContentType?.includes("application/json") || 
                                      existingContentType?.includes("application/javascript");
  
  // CRITICAL FIX: For resource routes, React Router v7 should use the Response body from the loader
  // directly. However, renderToPipeableStream still renders React HTML. The solution is to ensure
  // that React Router processes the route and uses the Response body, not React-rendered HTML.
  // 
  // React Router v7 should handle this automatically when a loader returns a Response object,
  // but renderToPipeableStream is still being called. The route's default export returns null
  // to prevent HTML rendering, and the loader returns Response.json() with proper headers.
  // 
  // The Content-Type header is already set by the route's headers function, so we preserve it.
  
  if (!isResourceRoute && !isResourceRouteByContentType) {
    try {
      addDocumentResponseHeaders(request, responseHeaders);
    } catch (error) {
      console.log("Shopify headers not added - running in standalone mode");
    }
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

          const requestUrl = new URL(request.url);
          const isResourceRouteByPath = requestUrl.pathname.startsWith("/apps/proxy/") ||
                                       requestUrl.pathname.startsWith("/apps/pixel-api/") ||
                                       requestUrl.pathname.startsWith("/api/");
          const finalContentType = responseHeaders.get("Content-Type");
          const isResourceRouteFinal = isResourceRouteByPath || 
                                      finalContentType?.includes("application/json") || 
                                      finalContentType?.includes("application/javascript");
          
          console.log(`[Entry Server] Processing request: ${requestUrl.pathname}, Content-Type: ${finalContentType || 'not set'}, Status: ${responseStatusCode}, isResourceRoute: ${isResourceRouteFinal}`);
          
          // CRITICAL: For resource routes, DO NOT override Content-Type
          // React Router v7 should use the Response body from the loader directly
          // The Content-Type is already set by the route's headers function
          if (isResourceRouteFinal) {
            // Preserve the Content-Type set by the route's headers function or loader Response
            // React Router should use the Response body, not React-rendered HTML
            console.log(`[Entry Server] Resource route detected - Content-Type preserved: ${finalContentType} for: ${requestUrl.pathname}`);
          } else if (!finalContentType) {
            // Only set HTML for non-resource routes that don't have Content-Type set
            responseHeaders.set("Content-Type", "text/html");
            console.log(`[Entry Server] Set Content-Type to text/html for: ${requestUrl.pathname}`);
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
    setTimeout(abort, streamTimeout + 1000);
  });
}
