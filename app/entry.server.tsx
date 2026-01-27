import { PassThrough } from "stream";
import { renderToPipeableStream } from "react-dom/server";
import { ServerRouter } from "react-router";
import { createReadableStreamFromReadable } from "@react-router/node";
import { type EntryContext } from "react-router";
import { isbot } from "isbot";
import { loadEnv } from "./lib/env-loader.server";

loadEnv();

import { addDocumentResponseHeaders } from "./shopify.server";
import { ensureDatabaseConnection } from "./db.server";

export const streamTimeout = 5000;

// Initialize database connection on startup
let dbInitialized = false;
const initializeDatabase = async () => {
  if (!dbInitialized) {
    console.log("[Server] Initializing database connection...");
    const connected = await ensureDatabaseConnection(3);
    if (connected) {
      console.log("[Server] Database connection established");
      dbInitialized = true;
    } else {
      console.warn("[Server] Database connection failed - app will retry on requests");
    }
  }
};

// Start database initialization (non-blocking)
initializeDatabase().catch(err => {
  console.error("[Server] Database initialization error:", err);
});

export default async function handleRequest(
  request: Request,
  responseStatusCode: number,
  responseHeaders: Headers,
  reactRouterContext: EntryContext
) {
  const url = new URL(request.url);
  const isApiRoute = url.pathname.startsWith("/apps/proxy/") ||
                      url.pathname.startsWith("/apps/pixel-api/") ||
                      url.pathname.startsWith("/api/");

  if (isApiRoute && reactRouterContext.staticHandlerContext) {
    const { loaderData, actionData, statusCode } = reactRouterContext.staticHandlerContext;
    
    if (loaderData && Object.keys(loaderData).length > 0) {
      const matches = reactRouterContext.staticHandlerContext.matches || [];
      for (let i = matches.length - 1; i >= 0; i--) {
        const match = matches[i];
        const routeId = match.route.id;
        if (loaderData[routeId] !== undefined && loaderData[routeId] !== null) {
          const data = loaderData[routeId];
          return Response.json(data, {
            status: statusCode || responseStatusCode || 200,
            headers: {
              "Content-Type": "application/json; charset=utf-8",
              "X-Content-Type-Options": "nosniff",
              "Access-Control-Allow-Origin": "*",
              "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
              "Access-Control-Allow-Headers": "Content-Type, Authorization",
            },
          });
        }
      }
    }
    
    if (actionData && Object.keys(actionData).length > 0) {
      const matches = reactRouterContext.staticHandlerContext.matches || [];
      for (let i = matches.length - 1; i >= 0; i--) {
        const match = matches[i];
        const routeId = match.route.id;
        if (actionData[routeId] !== undefined && actionData[routeId] !== null) {
          const data = actionData[routeId];
          // Found data, return as JSON
          return Response.json(data, {
            status: statusCode || responseStatusCode || 200,
            headers: {
              "Content-Type": "application/json; charset=utf-8",
              "X-Content-Type-Options": "nosniff",
              "Access-Control-Allow-Origin": "*",
              "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
              "Access-Control-Allow-Headers": "Content-Type, Authorization",
            },
          });
        }
      }
    }
  }

  // Add Shopify headers if available
  try {
    addDocumentResponseHeaders(request, responseHeaders);
  } catch (error) {
    // Shopify not configured - this is fine for landing page on Vercel
    console.log("Shopify headers not added - running in standalone mode");
  }

  // Ensure proper headers for Shopify embedding
  responseHeaders.delete("X-Frame-Options"); // Remove any existing X-Frame-Options
  responseHeaders.set("Content-Security-Policy", "frame-ancestors https://*.myshopify.com https://admin.shopify.com;");
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
    setTimeout(abort, streamTimeout + 1000);
  });
}
