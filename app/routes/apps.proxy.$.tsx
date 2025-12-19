// App Proxy handler - receives requests from /apps/pixel-api/* on the shop domain
// This avoids CORS issues because requests come from the same origin (shop domain)
import type { LoaderFunctionArgs, ActionFunctionArgs } from "react-router";
import prisma from "~/db.server";
import { parseUserAgent, getDeviceType } from "~/services/device.server";
import { getGeoData } from "~/services/geo.server";

// Helper function to create consistent JSON responses with proper headers
function createJsonResponse(data: any, status: number = 200, additionalHeaders: Record<string, string> = {}) {
  return new Response(JSON.stringify(data), {
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

// Helper function to create consistent error responses
function createErrorResponse(error: string, status: number = 500, details?: any) {
  const errorData: any = { error };
  if (details) {
    errorData.details = details;
  }
  return createJsonResponse(errorData, status);
}

// Handle GET requests (e.g., get-pixel-id)
export async function loader({ request, params }: LoaderFunctionArgs) {
  try {
    const url = new URL(request.url);
    const path = params["*"] || "";
    const shop = url.searchParams.get("shop") || url.searchParams.get("logged_in_customer_id")?.split("/")[0];
    
    console.log(`[App Proxy] GET ${path}, shop: ${shop}`);

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
          where: { email: shopDomain },
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

    // Route: /apps/pixel-api/pixel.js
    if (path === "pixel.js" || path.startsWith("pixel.js")) {
      const id = url.searchParams.get("id");
      const shopDomain = url.searchParams.get("shop");
      
      if (!id) {
        return new Response("// Missing pixel ID", {
          headers: { 
            "Content-Type": "application/javascript; charset=utf-8",
            "Cache-Control": "public, max-age=60",
          },
        });
      }

      try {
        // Check if database is available
        if (!prisma) {
          return new Response("console.error('[PixelTracker] Service unavailable');", {
            headers: { 
              "Content-Type": "application/javascript; charset=utf-8",
              "Cache-Control": "no-cache",
            },
          });
        }

        const app = await prisma.app.findUnique({
          where: { appId: id },
          include: { settings: true },
        });

        if (!app) {
          return new Response(`console.warn('[PixelTracker] Pixel not found: ${id}');`, {
            headers: { 
              "Content-Type": "application/javascript; charset=utf-8",
              "Cache-Control": "public, max-age=60",
            },
          });
        }

        const customEvents = await prisma.customEvent.findMany({
          where: { appId: app.id, isActive: true },
          select: { name: true, selector: true, eventType: true },
        });

        const settings = app.settings;
        const trackPageviews = settings?.autoTrackPageviews ?? true;
        const trackClicks = settings?.autoTrackClicks ?? true;
        const trackScroll = settings?.autoTrackScroll ?? false;

      // Script uses same-origin /apps/pixel-api/track endpoint (no CORS needed!)
      const script = `
(function() {
  'use strict';
  var APP_ID = '${id}';
  var SHOP = '${shopDomain || ""}';
  var ENDPOINT = '/apps/pixel-api/track';
  var DEBUG = true;
  var CUSTOM_EVENTS = ${JSON.stringify(customEvents.map(e => ({ name: e.name, selector: e.selector, eventType: e.eventType })))};

  function generateId() {
    return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function(c) {
      var r = Math.random() * 16 | 0;
      return (c === 'x' ? r : (r & 0x3 | 0x8)).toString(16);
    });
  }

  function getSession() {
    try {
      var k = 'px_s_' + APP_ID;
      var s = sessionStorage.getItem(k);
      if (!s) { s = generateId(); sessionStorage.setItem(k, s); }
      return s;
    } catch (e) { return generateId(); }
  }

  function getVisitor() {
    try {
      var k = 'px_v_' + APP_ID;
      var v = localStorage.getItem(k);
      if (!v) { v = generateId(); localStorage.setItem(k, v); }
      return v;
    } catch (e) { return generateId(); }
  }

  function getUtm() {
    var p = new URLSearchParams(location.search);
    return {
      utmSource: p.get('utm_source'),
      utmMedium: p.get('utm_medium'),
      utmCampaign: p.get('utm_campaign')
    };
  }

  function track(eventName, props) {
    props = props || {};
    var utm = getUtm();
    var data = {
      appId: APP_ID,
      eventName: eventName,
      url: location.href,
      referrer: document.referrer,
      pageTitle: document.title,
      sessionId: getSession(),
      visitorId: getVisitor(),
      screenWidth: screen.width,
      screenHeight: screen.height,
      language: navigator.language,
      timestamp: new Date().toISOString()
    };
    for (var k in utm) { if (utm[k]) data[k] = utm[k]; }
    for (var k in props) { data[k] = props[k]; }

    if (DEBUG) console.log('[PixelTracker]', eventName, data);

    // Use fetch for App Proxy compatibility
    fetch(ENDPOINT + '?shop=' + SHOP, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data),
      keepalive: true
    })
    .then(function(r) { if (DEBUG) console.log('[PixelTracker] Track response:', r.status); })
    .catch(function(e) { if (DEBUG) console.error('[PixelTracker] Track error:', e); });
  }

  window.PixelAnalytics = {
    track: track,
    trackPurchase: function(v, c, o, p) { track('purchase', { value: v, currency: c || 'USD', order_id: o, products: p }); },
    trackAddToCart: function(id, n, v, q) { track('addToCart', { product_id: id, product_name: n, value: v, quantity: q || 1 }); },
    trackViewContent: function(id, n, v, c) { track('viewContent', { product_id: id, product_name: n, value: v, category: c }); }
  };
  window.px = track;

  ${trackPageviews ? "track('pageview');" : ""}
  ${trackClicks ? `
  document.addEventListener('click', function(e) {
    var el = e.target.closest('a,button,[role=button]');
    if (el) track('click', { element: el.tagName, text: (el.innerText || '').slice(0, 50), href: el.href });
  }, true);` : ""}
  ${trackScroll ? `
  var scrolled = {};
  window.addEventListener('scroll', function() {
    var pct = Math.round(100 * scrollY / (document.body.scrollHeight - innerHeight));
    [25, 50, 75, 100].forEach(function(m) {
      if (pct >= m && !scrolled[m]) { scrolled[m] = 1; track('scroll', { depth: m }); }
    });
  }, { passive: true });` : ""}

  // Custom events
  CUSTOM_EVENTS.forEach(function(ce) {
    if (!ce.selector) return;
    document.querySelectorAll(ce.selector).forEach(function(el) {
      if (el._pxTracked) return;
      el._pxTracked = true;
      el.addEventListener(ce.eventType || 'click', function() { track(ce.name); });
    });
  });

  if (DEBUG) console.log('[PixelTracker] Ready:', APP_ID);
})();
`;

        return new Response(script, {
          headers: {
            "Content-Type": "application/javascript; charset=utf-8",
            "Cache-Control": "public, max-age=60",
            "Access-Control-Allow-Origin": "*",
          },
        });
      } catch (jsError) {
        console.error("[App Proxy pixel.js] Error:", jsError);
        return new Response("console.error('[PixelTracker] Error loading pixel');", {
          headers: { 
            "Content-Type": "application/javascript; charset=utf-8",
            "Cache-Control": "no-cache",
          },
        });
      }
    }

    return createErrorResponse("Unknown endpoint", 404, { path });
  } catch (error) {
    console.error("[App Proxy] Unexpected error:", error);
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
            country: geoData?.country || null,
            customData: body.customData || null,
          },
        });

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

export default function AppProxyRoute() {
  return null;
}

