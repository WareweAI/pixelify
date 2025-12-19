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
  if (isResourceRoute || isResourceRouteByContentType) {
    console.log(`[Entry Server] Resource route detected: ${url.pathname}, Content-Type: ${existingContentType}`);

    try {
      const ctx = reactRouterContext as any;
      if (ctx.matches && Array.isArray(ctx.matches)) {
        const lastMatch = ctx.matches[ctx.matches.length - 1];
        if (lastMatch && lastMatch.Component) {
          lastMatch.Component = () => null;
          console.log(`[Entry Server] Replaced component for resource route: ${url.pathname}`);
        }
      }
    } catch (error) {
      console.log(`[Entry Server] Could not modify EntryContext component: ${error}`);
    }
  }


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

  const isApiRoute = url.pathname.startsWith("/apps/proxy/") ||
                    url.pathname.startsWith("/apps/pixel-api/") ||
                    url.pathname.startsWith("/api/");

  console.log(`[Entry Server] Checking route: ${url.pathname}, isApiRoute: ${isApiRoute}`);

  if (isApiRoute) {
    console.log(`[Entry Server] API route detected, attempting early return: ${url.pathname}`);
  } else {
    console.log(`[Entry Server] Not an API route, proceeding with normal render: ${url.pathname}`);
  }

  if (isApiRoute) {

    // Debug: Log the entire EntryContext structure
    try {
      console.log(`[Entry Server] EntryContext keys:`, Object.keys(reactRouterContext as any));
      console.log(`[Entry Server] EntryContext structure:`, JSON.stringify(reactRouterContext, null, 2));
    } catch (e) {
      console.log(`[Entry Server] Could not stringify EntryContext: ${e}`);
    }

    // Try to get the Response from React Router's context
    try {
      const ctx = reactRouterContext as any;

      // Check all possible locations for the data
      if (ctx.matches && Array.isArray(ctx.matches)) {
        console.log(`[Entry Server] Found ${ctx.matches.length} matches`);
        for (const match of ctx.matches) {
          console.log(`[Entry Server] Match keys:`, Object.keys(match));
          if (match.response && match.response instanceof Response) {
            console.log(`[Entry Server] Found Response in match for: ${url.pathname}`);
            return match.response;
          }
          if (match.data) {
            console.log(`[Entry Server] Found data in match:`, typeof match.data);
            if (match.data instanceof Response) {
              return match.data;
            }
            if (typeof match.data === 'object') {
              return Response.json(match.data, {
                headers: responseHeaders,
                status: responseStatusCode,
              });
            }
          }
        }
      }

      // Check loaderData (for GET requests)
      if (ctx.loaderData) {
        console.log(`[Entry Server] Found loaderData:`, Object.keys(ctx.loaderData));
        for (const [routeId, data] of Object.entries(ctx.loaderData)) {
          console.log(`[Entry Server] loaderData[${routeId}]:`, typeof data);
          if (data instanceof Response) {
            console.log(`[Entry Server] Found Response in loaderData for: ${url.pathname}`);
            return data;
          }
          if (data && typeof data === 'object') {
            console.log(`[Entry Server] Found object in loaderData, returning as JSON for: ${url.pathname}`);
            return Response.json(data, {
              headers: responseHeaders,
              status: responseStatusCode,
            });
          }
        }
      }

      // Check actionData (for POST/PUT/DELETE requests)
      if (ctx.actionData) {
        console.log(`[Entry Server] Found actionData:`, Object.keys(ctx.actionData));
        for (const [routeId, data] of Object.entries(ctx.actionData)) {
          console.log(`[Entry Server] actionData[${routeId}]:`, typeof data);
          if (data instanceof Response) {
            console.log(`[Entry Server] Found Response in actionData for: ${url.pathname}`);
            return data;
          }
          if (data && typeof data === 'object') {
            console.log(`[Entry Server] Found object in actionData, returning as JSON for: ${url.pathname}`);
            return Response.json(data, {
              headers: responseHeaders,
              status: responseStatusCode,
            });
          }
        }
      }

      // Check other possible locations
      if (ctx.data) {
        console.log(`[Entry Server] Found ctx.data:`, typeof ctx.data);
        if (ctx.data instanceof Response) {
          return ctx.data;
        }
        if (typeof ctx.data === 'object') {
          return Response.json(ctx.data, {
            headers: responseHeaders,
            status: responseStatusCode,
          });
        }
      }

      console.log(`[Entry Server] No Response/data found in context for: ${url.pathname}`);
    } catch (error) {
      console.log(`[Entry Server] Error accessing context: ${error}`);
    }

    // Fallback: return a proper JSON error response
    console.log(`[Entry Server] Returning fallback JSON error for: ${url.pathname}`);
    return Response.json({
      error: "Service temporarily unavailable",
      message: "Please try again later"
    }, {
      status: 503,
      headers: {
        "Content-Type": "application/json; charset=utf-8"
      }
    });
  }

  return new Promise((resolve, reject) => {
    const componentToRender = (
      <ServerRouter
        context={reactRouterContext}
        url={request.url}
      />
    );

    const { pipe, abort } = renderToPipeableStream(
      componentToRender,
      {
        [callbackName]: () => {
          const body = new PassThrough();
          const stream = createReadableStreamFromReadable(body);

          const requestUrl = new URL(request.url);
          const isApiRouteFinal = requestUrl.pathname.startsWith("/apps/proxy/") ||
                                 requestUrl.pathname.startsWith("/apps/pixel-api/") ||
                                 requestUrl.pathname.startsWith("/api/");

          console.log(`[Entry Server] Processing request: ${requestUrl.pathname}, Content-Type: ${responseHeaders.get("Content-Type") || 'not set'}, Status: ${responseStatusCode}, isApiRoute: ${isApiRouteFinal}`);

          if (isApiRouteFinal) {
            console.log(`[Entry Server] Render callback - Checking context for API route: ${requestUrl.pathname}`);
            try {
              const ctx = reactRouterContext as any;

              let responseFound = false;

              // Check matches for Response objects
              if (ctx.matches && Array.isArray(ctx.matches)) {
                console.log(`[Entry Server] Found ${ctx.matches.length} matches`);
                for (const match of ctx.matches) {
                  console.log(`[Entry Server] Match:`, { hasResponse: !!match.response, responseType: typeof match.response, matchKeys: Object.keys(match) });
                  if (match.response && match.response instanceof Response) {
                    console.log(`[Entry Server] Found Response in match, using it directly`);
                    resolve(match.response);
                    responseFound = true;
                    return;
                  }
                }
              }

              // Check loaderData for Response or data
              if (ctx.loaderData) {
                console.log(`[Entry Server] Found loaderData keys:`, Object.keys(ctx.loaderData));
                for (const [routeId, data] of Object.entries(ctx.loaderData)) {
                  console.log(`[Entry Server] loaderData[${routeId}]:`, { type: typeof data, isResponse: data instanceof Response, hasData: !!data });
                  if (data instanceof Response) {
                    console.log(`[Entry Server] Found Response in loaderData`);
                    resolve(data);
                    responseFound = true;
                    return;
                  }
                  if (data && typeof data === 'object') {
                    console.log(`[Entry Server] Found data in loaderData, creating JSON response`);
                    resolve(Response.json(data, {
                      headers: responseHeaders,
                      status: responseStatusCode,
                    }));
                    responseFound = true;
                    return;
                  }
                }
              }

              // Check actionData for Response or data
              if (ctx.actionData) {
                console.log(`[Entry Server] Found actionData keys:`, Object.keys(ctx.actionData));
                for (const [routeId, data] of Object.entries(ctx.actionData)) {
                  console.log(`[Entry Server] actionData[${routeId}]:`, { type: typeof data, isResponse: data instanceof Response, hasData: !!data });
                  if (data instanceof Response) {
                    console.log(`[Entry Server] Found Response in actionData`);
                    resolve(data);
                    responseFound = true;
                    return;
                  }
                  if (data && typeof data === 'object') {
                    console.log(`[Entry Server] Found data in actionData, creating JSON response`);
                    resolve(Response.json(data, {
                      headers: responseHeaders,
                      status: responseStatusCode,
                    }));
                    responseFound = true;
                    return;
                  }
                }
              }

              console.log(`[Entry Server] No data found in context for API route: ${requestUrl.pathname}, falling back to stream`);
            } catch (error) {
              console.log(`[Entry Server] Error checking context: ${error}`);
            }
          }

          if (!isApiRouteFinal && !responseHeaders.get("Content-Type")) {
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