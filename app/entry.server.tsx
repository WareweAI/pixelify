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
  // Set CSP AFTER Shopify headers to override any conflicting directives
  responseHeaders.delete("X-Frame-Options"); // Remove any existing X-Frame-Options
  
  // Merge CSP to ensure shop.app is allowed
  const existingCSP = responseHeaders.get("Content-Security-Policy");
  let cspValue = "frame-ancestors https://*.myshopify.com https://admin.shopify.com https://shop.app https://*.shop.app;";
  
  if (existingCSP) {
    // Remove any existing frame-ancestors directive (including 'none')
    const cspParts = existingCSP.split(";").filter(part => {
      const trimmed = part.trim();
      return trimmed && !trimmed.toLowerCase().startsWith("frame-ancestors");
    });
    
    // Merge with our frame-ancestors directive
    if (cspParts.length > 0) {
      cspValue = `${cspParts.join("; ")}; ${cspValue}`;
    }
  }
  
  responseHeaders.set("Content-Security-Policy", cspValue);
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

          responseHeaders.set("Content-Type", "text/html");
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
