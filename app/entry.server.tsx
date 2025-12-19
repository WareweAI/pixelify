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
  
  // Let Shopify handle all embedding headers - DO NOT override CSP
  if (!isAppProxyRoute) {
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

          // Check if Content-Type is already set (from route's headers function or loader Response)
          const contentType = responseHeaders.get("Content-Type");
          const isJsonResponse = contentType?.includes("application/json");
          const isJsResponse = contentType?.includes("application/javascript");
          
          if (!isAppProxyRoute && !isJsonResponse && !isJsResponse && !responseHeaders.has("Content-Type")) {
            responseHeaders.set("Content-Type", "text/html");
          }
          
          // Log for debugging API routes
          if (isAppProxyRoute) {
            console.log(`[Entry Server] API route: ${url.pathname}, Content-Type: ${contentType || 'not set'}, Status: ${responseStatusCode}`);
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
