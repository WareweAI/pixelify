import type { LoaderFunctionArgs, ActionFunctionArgs } from "react-router";
import prisma from "~/db.server";
import { parseUserAgent, getDeviceType } from "~/services/device.server";
import { getGeoData } from "~/services/geo.server";
import { forwardToMeta } from "~/services/meta-capi.server";

function createJsonResponse(data: any, status: number = 200, additionalHeaders: Record<string, string> = {}) {
  return Response.json(data, {
    status,
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
      "Access-Control-Allow-Headers": "Content-Type, Authorization",
      ...additionalHeaders,
    },
  });
}

function createErrorResponse(error: string, status: number = 500, details?: any) {
  const errorData: any = { error };
  if (details) {
    errorData.details = details;
  }
  return createJsonResponse(errorData, status);
}

// Handle GET requests (e.g., get-pixel-id)
export async function loader({ request, params }: LoaderFunctionArgs) {
  const url = new URL(request.url);
  const path = params["*"] || "";
  
  // pixel.js requests are now handled by dedicated route: apps.pixel-api.pixel[.]js.ts
  
  try {
    const shop = url.searchParams.get("shop") || url.searchParams.get("logged_in_customer_id")?.split("/")[0];

    console.log(`[App Proxy] GET request:`, {
      url: request.url,
      path: path,
      params: params,
      shop: shop
    });

    // Route: /apps/proxy/get-pixel-id (proxied from /apps/pixel-api/get-pixel-id)
    // STRICT DOMAIN MATCHING - only return pixel if domain matches
    if (path === "get-pixel-id" || path.startsWith("get-pixel-id")) {
      const shopDomain = url.searchParams.get("shop");
      const requestDomain = url.searchParams.get("domain");
      
      if (!shopDomain) {
        return createErrorResponse("Missing shop parameter", 400);
      }

      // Helper function to normalize domain
      const normalizeDomain = (domain: string | null | undefined): string | null => {
        if (!domain) return null;
        return domain
          .toLowerCase()
          .trim()
          .replace(/^https?:\/\//, '')
          .replace(/^www\./, '')
          .replace(/\/+$/, '')
          .trim();
      };

      const normalizedRequestDomain = normalizeDomain(requestDomain);
      console.log(`[App Proxy] get-pixel-id for shop: ${shopDomain}, domain: "${normalizedRequestDomain}"`);

      try {
        // Check if database is available
        if (!prisma) {
          console.error("[App Proxy] Database not available");
          return createErrorResponse("Service temporarily unavailable", 503);
        }

        const user = await prisma.user.findUnique({
          where: { storeUrl: shopDomain },
        });

        if (!user) {
          console.log(`[App Proxy] User not found for shop: ${shopDomain}`);
          return createErrorResponse("Shop not found", 404, { shop: shopDomain });
        }

        // Use raw SQL to get apps with websiteDomain field
        const allApps = await prisma.$queryRaw`
          SELECT 
            a."id",
            a."appId",
            a."name",
            a."enabled",
            a."websiteDomain",
            s."metaPixelId",
            s."metaPixelEnabled",
            s."metaAccessToken",
            s."autoTrackPageviews",
            s."autoTrackClicks",
            s."autoTrackScroll",
            s."autoTrackViewContent",
            s."autoTrackAddToCart",
            s."autoTrackInitiateCheckout",
            s."autoTrackPurchase",
            s."customEventsEnabled"
          FROM "App" a
          LEFT JOIN "AppSettings" s ON s."appId" = a."id"
          WHERE a."userId" = ${user.id}
          ORDER BY a."createdAt" DESC
        ` as any[];

        console.log(`[App Proxy] Found ${allApps.length} pixels for user`);
        console.log(`[App Proxy] Pixels:`, allApps.map((a: any) => `${a.name}: "${a.websiteDomain}"`).join(', '));

        // Find pixel with matching domain (STRICT)
        let matchedApp = null;
        for (const app of allApps) {
          const normalizedStoredDomain = normalizeDomain(app.websiteDomain);
          console.log(`[App Proxy] Checking pixel "${app.name}": stored="${normalizedStoredDomain}", requested="${normalizedRequestDomain}"`);
          
          if (normalizedStoredDomain && normalizedRequestDomain && 
              normalizedStoredDomain === normalizedRequestDomain && app.enabled) {
            matchedApp = app;
            console.log(`[App Proxy] ✅ MATCH FOUND: "${app.name}" for domain "${normalizedRequestDomain}"`);
            break;
          }
        }

        // STRICT MODE: If no domain match found, return error - NO FALLBACK
        if (!matchedApp) {
          console.log(`[App Proxy] ❌ No pixel assigned to domain: "${normalizedRequestDomain}"`);
          
          return createJsonResponse({
            error: "No pixel assigned to this domain",
            domain: normalizedRequestDomain,
            domainMatch: false,
            message: "This domain is not assigned to any pixel. Please assign a pixel to this domain in your dashboard.",
            trackingDisabled: true,
            availableAssignments: allApps.map((a: any) => ({
              name: a.name,
              websiteDomain: a.websiteDomain,
              normalizedDomain: normalizeDomain(a.websiteDomain)
            }))
          }, 404);
        }

        console.log(`[App Proxy] ✅ Using pixel: ${matchedApp.appId} (${matchedApp.name}) for domain: ${normalizedRequestDomain}`);

        // Get custom events if enabled
        let customEvents: any[] = [];
        if (matchedApp.customEventsEnabled !== false) {
          customEvents = await prisma.customEvent.findMany({
            where: { appId: matchedApp.id, isActive: true },
            select: { name: true, selector: true, eventType: true, metaEventName: true },
          });
        }

        return createJsonResponse({
          pixelId: matchedApp.appId,
          appName: matchedApp.name,
          metaPixelId: matchedApp.metaPixelId || null,
          enabled: matchedApp.metaPixelEnabled ?? true,
          websiteDomain: matchedApp.websiteDomain,
          domainMatch: true,
          currentDomain: normalizedRequestDomain,
          config: {
            autoPageviews: matchedApp.autoTrackPageviews ?? true,
            autoClicks: matchedApp.autoTrackClicks ?? true,
            autoScroll: matchedApp.autoTrackScroll ?? false,
            autoViewContent: matchedApp.autoTrackViewContent ?? true,
            autoAddToCart: matchedApp.autoTrackAddToCart ?? true,
            autoInitiateCheckout: matchedApp.autoTrackInitiateCheckout ?? true,
            autoPurchase: matchedApp.autoTrackPurchase ?? true,
          },
          customEvents,
        });
      } catch (dbError) {
        console.error("[App Proxy] Database error:", dbError);
        return createErrorResponse("Database error", 500);
      }
    }

    // NOTE: pixel.js requests are handled by apps.proxy.pixel[.]js.ts
    // DO NOT add pixel.js handling here to avoid routing conflicts

    return createErrorResponse("Unknown endpoint", 404, { path });
  } catch (error) {
    console.error("[App Proxy] Unexpected error:", error);
    
    // Check if this is a pixel.js request
    const path = params["*"] || "";
    if (path === "pixel.js" || path.startsWith("pixel.js")) {
      return new Response(`console.error('[PixelTracker] Server error in catch-all: ${error instanceof Error ? error.message : 'Unknown error'}');`, {
        headers: {
          "Content-Type": "application/javascript; charset=utf-8",
          "Cache-Control": "no-cache",
        },
      });
    }
    
    return createErrorResponse("Internal server error", 500);
  }
}

// Handle POST requests (e.g., track events)
export async function action({ request, params }: ActionFunctionArgs) {
  try {
    const url = new URL(request.url);
    const path = params["*"] || "";
    const shop = url.searchParams.get("shop");

    console.log(`[App Proxy] POST ${path}, shop: ${shop}`);

    // Route: /apps/pixel-api/track
    if (path === "track" || path.startsWith("track")) {
      try {
        const body = await request.json();
        const { appId, eventName } = body;

        if (!appId || !eventName) {
          return createErrorResponse("Missing required fields", 400, { required: ["appId", "eventName"] });
        }

        // Check if database is available
        if (!prisma) {
          console.error("[App Proxy] Database not available");
          return createErrorResponse("Service temporarily unavailable", 503);
        }

        const app = await prisma.app.findUnique({
          where: { appId },
          include: { settings: true },
        });

        if (!app) {
          return createErrorResponse("App not found", 404, { appId });
        }

        const userAgent = request.headers.get("user-agent") || "";
        const ip = request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || "0.0.0.0";
        const deviceInfo = parseUserAgent(userAgent);
        const deviceType = getDeviceType(userAgent, body.screenWidth);
        const geoData = app.settings?.recordLocation ? await getGeoData(ip) : null;

        const event = await prisma.event.create({
          data: {
            appId: app.id,
            eventName,
            url: body.url || null,
            referrer: body.referrer || null,
            sessionId: body.sessionId || null,
            fingerprint: body.visitorId || null,
            ipAddress: app.settings?.recordIp ? ip : null,
            userAgent,
            browser: deviceInfo.browser,
            browserVersion: deviceInfo.browserVersion,
            os: deviceInfo.os,
            osVersion: deviceInfo.osVersion,
            deviceType,
            screenWidth: body.screenWidth || null,
            screenHeight: body.screenHeight || null,
            pageTitle: body.pageTitle || null,
            utmSource: body.utmSource || null,
            utmMedium: body.utmMedium || null,
            utmCampaign: body.utmCampaign || null,
            city: geoData?.city || null,
            region: geoData?.region || null,
            country: geoData?.country || null,
            countryCode: geoData?.countryCode || null,
            timezone: geoData?.timezone || null,
            customData: body.customData || body.properties ? JSON.parse(JSON.stringify(body.customData || body.properties)) : null,
          },
        });

        // Forward to Meta CAPI if enabled
        if (app.settings?.metaPixelEnabled && app.settings?.metaPixelId && app.settings?.metaAccessToken) {
          try {
            await forwardToMeta({
              pixelId: app.settings.metaPixelId,
              accessToken: app.settings.metaAccessToken,
              event: {
                eventName,
                eventTime: Math.floor(Date.now() / 1000),
                eventSourceUrl: body.url,
                actionSource: "website",
                userData: {
                  clientIpAddress: ip,
                  clientUserAgent: userAgent,
                  externalId: body.visitorId,
                },
                customData: {
                  ...body.customData,
                  ...body.properties,
                  ...(body.product_id && { content_ids: [body.product_id] }),
                  ...(body.product_name && { content_name: body.product_name }),
                  ...(body.price && { value: body.price }),
                  ...(body.quantity && { num_items: body.quantity }),
                  ...(body.currency && { currency: body.currency }),
                },
              },
            });
            console.log(`[App Proxy] Event "${eventName}" forwarded to Meta CAPI`);
          } catch (metaError: any) {
            console.error("[App Proxy] Meta CAPI forwarding error:", metaError);

            // Check if token has expired (error code 190)
            if (metaError?.error_code === 190 || metaError?.code === 190) {
              console.warn("[App Proxy] Meta access token expired, disabling Meta integration");
              try {
                await prisma.appSettings.update({
                  where: { appId: app.id },
                  data: {
                    metaPixelEnabled: false,
                    metaVerified: false,
                  },
                });
                console.log("[App Proxy] Meta integration disabled due to expired token");
              } catch (updateError) {
                console.error("[App Proxy] Failed to disable Meta integration:", updateError);
              }
            }
          }
        }

        return createJsonResponse({ success: true, eventId: event.id });
      } catch (trackError) {
        console.error("[App Proxy track] Error:", trackError);
        return createErrorResponse("Failed to track event", 500);
      }
    }

    return createErrorResponse("Unknown endpoint", 404, { path });
  } catch (error) {
    console.error("[App Proxy] Unexpected error:", error);
    return createErrorResponse("Internal server error", 500);
  }
}

export default function AppProxy() {
  return null;
}