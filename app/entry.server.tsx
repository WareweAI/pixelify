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
  
  // CRITICAL: Detect resource routes early - React Router v7 should use Response body directly
  // but renderToPipeableStream still renders React HTML. We need to ensure the Response body
  // from the loader is used instead of React-rendered HTML.
  const isResourceRoute = url.pathname.startsWith("/apps/proxy/") ||
                         url.pathname.startsWith("/apps/pixel-api/") ||
                         url.pathname.startsWith("/api/");
  
  // Check if Content-Type is already set (from route's headers function or loader Response)
  // If it's JSON/JS, React Router should use the Response body directly
  const existingContentType = responseHeaders.get("Content-Type");
  const isResourceRouteByContentType = existingContentType?.includes("application/json") || 
                                      existingContentType?.includes("application/javascript");
  
  // For resource routes that return JSON/JS, React Router v7 should use the Response body
  // However, renderToPipeableStream still renders React HTML. The issue is that React Router
  // processes routes and sets headers, but then renderToPipeableStream renders React HTML
  // into the stream, overwriting the Response body.
  //
  // SOLUTION: React Router v7 should handle this automatically, but if it doesn't, we need
  // to ensure the Response body is preserved. Since we can't access the loader Response
  // directly from EntryContext, we rely on React Router to use it automatically.
  // The route's headers function and loader Response should ensure correct Content-Type.
  
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
          
          // CRITICAL: For resource routes, DO NOT set Content-Type to HTML
          // React Router v7 should use the Response body from the loader directly
          // The Content-Type is already set by the route's headers function or loader Response
          if (isResourceRouteFinal) {
            // Don't override Content-Type - let the loader's Response headers take precedence
            // React Router v7 should automatically use the Response body when loader returns a Response
            console.log(`[Entry Server] Resource route - preserving Content-Type: ${finalContentType} for: ${requestUrl.pathname}`);
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
