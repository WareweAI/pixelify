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
  
  // CRITICAL: For resource routes, React Router v7 should use the Response body from the loader
  // directly. However, renderToPipeableStream still renders React HTML. The issue is that React
  // Router processes routes BEFORE calling handleRequest, so the Response body should already be
  // in the stream. But renderToPipeableStream is still rendering React HTML into the stream.
  //
  // The solution: For resource routes with JSON/JS Content-Type, we need to ensure React Router
  // uses the Response body directly. Since we can't access the Response body from EntryContext,
  // we rely on React Router v7's built-in handling. The route's default export returns null to
  // prevent HTML rendering, and the loader returns Response.json() with proper headers.
  //
  // However, renderToPipeableStream still renders the root HTML structure. The real fix is that
  // React Router v7 should intercept and use the Response body before calling renderToPipeableStream,
  // but it seems like it's not doing that.
  
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
          
          if (isResourceRouteFinal) {
            console.log(`[Entry Server] Resource route detected - Content-Type preserved: ${finalContentType} for: ${requestUrl.pathname}`);
          } else if (!finalContentType) {
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
