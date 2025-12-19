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
  
  const isResourceRoute = url.pathname.startsWith("/apps/proxy/") ||
                         url.pathname.startsWith("/apps/pixel-api/") ||
                         url.pathname.startsWith("/api/");
  
  if (!isResourceRoute) {
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

          // CRITICAL: Check if Content-Type is already set (from route's headers function or loader Response)
          // For resource routes (API routes), React Router v7 should use the Response body directly
          // DO NOT override JSON/JS Content-Type with HTML
          const existingContentType = responseHeaders.get("Content-Type");
          const requestUrl = new URL(request.url);
          const isResourceRouteByPath = requestUrl.pathname.startsWith("/apps/proxy/") ||
                                       requestUrl.pathname.startsWith("/apps/pixel-api/") ||
                                       requestUrl.pathname.startsWith("/api/");
          const isResourceRouteByContentType = existingContentType?.includes("application/json") || 
                                              existingContentType?.includes("application/javascript");
          const isResourceRoute = isResourceRouteByPath || isResourceRouteByContentType;
          
          // Debug logging for all routes
          console.log(`[Entry Server] Processing request: ${requestUrl.pathname}, Content-Type: ${existingContentType || 'not set'}, Status: ${responseStatusCode}, isResourceRoute: ${isResourceRoute}`);
          
          // CRITICAL: For resource routes, React Router v7 should use the Response body from the loader
          // DO NOT set HTML Content-Type - React Router will use the Response body directly
          if (isResourceRoute) {
            // Don't set Content-Type - let the loader's Response headers take precedence
            // React Router v7 should automatically use the Response body when loader returns a Response
            console.log(`[Entry Server] Resource route - React Router should use Response body directly for: ${requestUrl.pathname}`);
          } else if (!existingContentType) {
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

    // Automatically timeout the React renderer after 6 seconds, which ensures
    setTimeout(abort, streamTimeout + 1000);
  });
}
