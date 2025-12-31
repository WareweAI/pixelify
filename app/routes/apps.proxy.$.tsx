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

    // Route: /apps/pixel-api/get-pixel-id
    if (path === "get-pixel-id" || path.startsWith("get-pixel-id")) {
      const shopDomain = url.searchParams.get("shop");
      
      if (!shopDomain) {
        return createErrorResponse("Missing shop parameter", 400);
      }

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

        const app = await prisma.app.findFirst({
          where: { userId: user.id },
          include: { settings: true },
          orderBy: { createdAt: "desc" },
        });

        if (!app) {
          console.log(`[App Proxy] No pixel configured for shop: ${shopDomain}`);
          return createErrorResponse("No pixel configured", 404, { shop: shopDomain });
        }

        // Get custom events
        const customEvents = await prisma.customEvent.findMany({
          where: { appId: app.id, isActive: true },
          select: { name: true, selector: true, eventType: true, metaEventName: true },
        });

        console.log(`[App Proxy] Returning config for pixel: ${app.appId}`);

        return createJsonResponse({
          pixelId: app.appId,
          appName: app.name,
          metaPixelId: app.settings?.metaPixelId || null,
          enabled: app.settings?.metaPixelEnabled ?? true,
          config: {
            autoPageviews: app.settings?.autoTrackPageviews ?? true,
            autoClicks: app.settings?.autoTrackClicks ?? true,
            autoScroll: app.settings?.autoTrackScroll ?? false,
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

        // Forward ALL events to Meta CAPI (both default and custom events)
        if (app.settings?.metaPixelEnabled && app.settings?.metaPixelId && app.settings?.metaAccessToken) {
          try {
            // Check if this is a custom event to get Meta event mapping
            const customEvent = await prisma.customEvent.findFirst({
              where: {
                appId: app.id,
                name: eventName,
                isActive: true,
              },
            });

            // Default event name mapping for standard e-commerce events
            const defaultEventMapping: Record<string, string> = {
              'pageview': 'PageView',
              'page_view': 'PageView',
              'viewContent': 'ViewContent',
              'view_content': 'ViewContent',
              'addToCart': 'AddToCart',
              'add_to_cart': 'AddToCart',
              'initiateCheckout': 'InitiateCheckout',
              'initiate_checkout': 'InitiateCheckout',
              'purchase': 'Purchase',
              'addPaymentInfo': 'AddPaymentInfo',
              'add_payment_info': 'AddPaymentInfo',
              'lead': 'Lead',
              'contact': 'Contact',
              'search': 'Search',
              'click': 'Click',
              'scroll': 'Scroll',
            };

            // Priority: custom event mapping > default mapping > original name
            let metaEventName = eventName;
            if (customEvent?.metaEventName) {
              metaEventName = customEvent.metaEventName;
            } else if (defaultEventMapping[eventName]) {
              metaEventName = defaultEventMapping[eventName];
            }

            // Build event data
            let eventData: Record<string, any> = {};
            
            // Add custom event data if defined
            if (customEvent?.eventData) {
              try {
                eventData = { ...eventData, ...JSON.parse(customEvent.eventData) };
              } catch (e) {
                console.error("[App Proxy] Error parsing custom event data:", e);
              }
            }

            // Add e-commerce data from request
            if (body.customData) eventData = { ...eventData, ...body.customData };
            if (body.properties) eventData = { ...eventData, ...body.properties };
            if (body.product_id) eventData.content_ids = [body.product_id];
            if (body.product_name) eventData.content_name = body.product_name;
            if (body.value || body.price) eventData.value = body.value || body.price;
            if (body.quantity) eventData.num_items = body.quantity;
            if (body.currency) eventData.currency = body.currency;

            const eventType = customEvent ? 'CUSTOM' : 'DEFAULT';
            console.log(`[App Proxy] Sending ${eventType} event "${eventName}" to CAPI as "${metaEventName}"`);

            await forwardToMeta({
              pixelId: app.settings.metaPixelId,
              accessToken: app.settings.metaAccessToken,
              testEventCode: app.settings.metaTestEventCode || undefined,
              event: {
                eventName: metaEventName,
                eventTime: Math.floor(Date.now() / 1000),
                eventSourceUrl: body.url,
                actionSource: "website",
                userData: {
                  clientIpAddress: ip,
                  clientUserAgent: userAgent,
                  externalId: body.visitorId,
                },
                customData: Object.keys(eventData).length > 0 ? eventData : undefined,
              },
            });
            
            console.log(`[App Proxy] ✅ ${eventType} Event "${eventName}" sent to Facebook CAPI as "${metaEventName}"`);
          } catch (metaError) {
            console.error("[App Proxy] ❌ Meta CAPI forwarding error:", metaError);
          }
        } else {
          const reasons = [];
          if (!app.settings?.metaPixelEnabled) reasons.push('Meta Pixel not enabled');
          if (!app.settings?.metaPixelId) reasons.push('No Meta Pixel ID');
          if (!app.settings?.metaAccessToken) reasons.push('No Meta Access Token');
          console.log(`[App Proxy] ⚠️ CAPI skipped for "${eventName}" - ${reasons.join(', ')}`);
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