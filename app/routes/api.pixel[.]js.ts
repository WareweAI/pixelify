import type { LoaderFunctionArgs } from "react-router";
import prisma from "../db.server";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type",
  "Access-Control-Max-Age": "86400",
  "X-Content-Type-Options": "nosniff",
};

export async function loader({ request }: LoaderFunctionArgs) {
  if (request.method === "OPTIONS") {
    return new Response(null, {
      status: 204,
      headers: corsHeaders,
    });
  }

  const url = new URL(request.url);
  const id = url.searchParams.get('id');
  const shop = url.searchParams.get('shop');

  console.log(`[API Pixel] Request for appId: ${id}, shop: ${shop}`);

  if (!id) {
    return new Response("// Missing app ID", {
      status: 400,
      headers: {
        "Content-Type": "application/javascript; charset=utf-8",
        ...corsHeaders,
      },
    });
  }

  try {
    const app = await prisma.app.findUnique({
      where: { appId: id },
      include: { settings: true },
    });

    if (!app) {
      console.log(`[API Pixel] App not found: ${id}`);
      return new Response(`
console.warn('[PixelAnalytics] App not found: ${id}');
window.PixelAnalytics = { track: () => console.warn('Tracking disabled - invalid app ID') };
      `, {
        status: 200,
        headers: {
          "Content-Type": "application/javascript; charset=utf-8",
          ...corsHeaders,
        },
      });
    }

    // Fetch active custom events
    const customEvents = await prisma.customEvent.findMany({
      where: { appId: app.id, isActive: true },
      select: { name: true, displayName: true, selector: true, eventType: true, metaEventName: true },
    });

    const settings = app.settings;
    const trackPageviews = settings?.autoTrackPageviews ?? true;
    const trackClicks = settings?.autoTrackClicks ?? true;
    const trackScroll = settings?.autoTrackScroll ?? true;

    const autoTrackEvents = customEvents
      .filter(ce => ce.selector)
      .map(ce => ({
        name: ce.name,
        selector: ce.selector,
        eventType: ce.eventType,
        meta: ce.metaEventName,
      }));

    // Get the base URL for API calls
    const baseUrl = process.env.SHOPIFY_APP_URL || "https://pixel-warewe.vercel.app";
    
    const script = `
(function() {
  'use strict';
  var APP_ID = '${id}';
  var SHOP_DOMAIN = '${shop}';
  var BASE_URL = '${baseUrl}';
  var ENDPOINT = BASE_URL + '/api/track';
  var BEACON_ENDPOINT = BASE_URL + '/api/track';
  var SESSION_KEY = 'px_session_${id}';
  var VISITOR_KEY = 'px_visitor_${id}';
  var DEBUG = true;
  var CUSTOM_EVENTS = ${JSON.stringify(autoTrackEvents)};

  function generateId() {
    return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, c => {
      var r = Math.random() * 16 | 0, v = c === 'x' ? r : (r & 0x3 | 0x8);
      return v.toString(16);
    });
  }

  function getSession() {
    try {
      var session = sessionStorage.getItem(SESSION_KEY);
      return session || (sessionStorage.setItem(SESSION_KEY, generateId()), sessionStorage.getItem(SESSION_KEY));
    } catch (e) { return generateId(); }
  }

  function getVisitor() {
    try {
      var visitor = localStorage.getItem(VISITOR_KEY);
      return visitor || (localStorage.setItem(VISITOR_KEY, generateId()), localStorage.getItem(VISITOR_KEY));
    } catch (e) { return generateId(); }
  }

  function getFingerprint() {
    try {
      var canvas = document.createElement('canvas');
      var ctx = canvas.getContext('2d');
      ctx.textBaseline = 'top'; ctx.font = '14px Arial'; ctx.fillText('fingerprint', 2, 2);
      var str = canvas.toDataURL() + navigator.userAgent + screen.width + screen.height;
      var hash = 0;
      for (var i = 0; i < str.length; i++) {
        hash = ((hash << 5) - hash) + str.charCodeAt(i);
        hash = hash & hash;
      }
      return Math.abs(hash).toString(16);
    } catch (e) { return 'unknown'; }
  }

  function getUtmParams() {
    var params = new URLSearchParams(window.location.search);
    return {
      utmSource: params.get('utm_source'), utmMedium: params.get('utm_medium'),
      utmCampaign: params.get('utm_campaign'), utmTerm: params.get('utm_term'),
      utmContent: params.get('utm_content')
    };
  }

  function track(eventName, properties) {
    properties = properties || {};
    var utmParams = getUtmParams();
    var data = {
      appId: APP_ID, eventName: eventName, url: window.location.href, referrer: document.referrer,
      pageTitle: document.title, sessionId: getSession(), visitorId: getVisitor(),
      fingerprint: getFingerprint(), timestamp: new Date().toISOString(),
      screenWidth: screen.width, screenHeight: screen.height, language: navigator.language
    };
    // Merge utm and properties
    for (var k in utmParams) { if (utmParams[k]) data[k] = utmParams[k]; }
    for (var k in properties) { data[k] = properties[k]; }
    data.customData = properties;

    if (DEBUG) console.log('[PixelAnalytics] Tracking:', eventName, data);

    // Use sendBeacon if available, otherwise fetch
    if (navigator.sendBeacon) {
      try {
        var blob = new Blob([JSON.stringify(data)], { type: 'application/json' });
        navigator.sendBeacon(BEACON_ENDPOINT, blob);
      } catch (e) {
        sendFetch(data);
      }
    } else {
      sendFetch(data);
    }
    return data;
  }

  function sendFetch(data) {
    try {
      fetch(ENDPOINT, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data),
        keepalive: true
      }).catch(function(e) { if (DEBUG) console.warn('[PixelAnalytics] Fetch error:', e); });
    } catch (e) {
      if (DEBUG) console.error('[PixelAnalytics] Error:', e);
    }
  }

  // E-commerce helpers
  window.PixelAnalytics = {
    track: track,
    trackPurchase: function(value, currency, orderId, products) { return track('purchase', { value: value, currency: currency || 'USD', order_id: orderId, products: products }); },
    trackAddToCart: function(productId, productName, value, quantity) { return track('addToCart', { product_id: productId, product_name: productName, value: value, quantity: quantity || 1 }); },
    trackViewContent: function(productId, productName, value, category) { return track('viewContent', { product_id: productId, product_name: productName, value: value, category: category }); },
    trackInitiateCheckout: function(value, currency, products) { return track('initiateCheckout', { value: value, currency: currency || 'USD', products: products }); },
    setDebug: function(v) { DEBUG = !!v; }
  };
  window.pixelTrack = window.px = track;

  // Auto-tracking
  ${trackPageviews ? `track('pageview');` : ''}
  ${trackScroll ? `
    var maxScroll = 0, trackedMilestones = {}, milestones = [25, 50, 75, 100];
    window.addEventListener('scroll', function() {
      var scrollPercent = Math.round((window.pageYOffset / (document.documentElement.scrollHeight - window.innerHeight)) * 100);
      if (scrollPercent > maxScroll) {
        maxScroll = scrollPercent;
        milestones.forEach(function(m) { if (scrollPercent >= m && !trackedMilestones[m]) { trackedMilestones[m] = true; track('scroll', { depth: m }); } });
      }
    }, { passive: true });
  ` : ''}
  ${trackClicks ? `
    document.addEventListener('click', function(e) {
      var elem = e.target.closest('a, button, [role="button"]');
      if (elem) track('click', { element: elem.tagName.toLowerCase(), text: (elem.innerText || '').substring(0,100).trim(), href: elem.href });
    }, true);
  ` : ''}

  // Custom events
  function setupCustomTracking() {
    CUSTOM_EVENTS.forEach(function(ce) {
      if (!ce.selector) return;
      document.querySelectorAll(ce.selector).forEach(function(el) {
        if (el._pixelTracked) return;
        el._pixelTracked = true;
        el.addEventListener(ce.eventType || 'click', function() { track(ce.name, { selector: ce.selector }); });
      });
    });
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', setupCustomTracking);
  else setupCustomTracking();

  // Data attribute tracking
  ['click', 'submit', 'change'].forEach(function(evt) {
    document.addEventListener(evt, function(e) {
      var elem = e.target.closest('[data-pixel-event]');
      if (elem) {
        var eventName = elem.getAttribute('data-pixel-event');
        track(eventName, { element: elem.tagName.toLowerCase(), text: (elem.innerText || '').substring(0,100).trim() });
      }
    }, true);
  });

  if (DEBUG) console.log('[PixelAnalytics] Initialized:', APP_ID);
})();
    `;

    return new Response(script, {
      headers: {
        "Content-Type": "application/javascript; charset=utf-8",
        "Cache-Control": "public, max-age=60, must-revalidate",
        "Vary": "Origin",
        ...corsHeaders,
      },
    });
  } catch (error) {
    console.error("[API Pixel] Error:", error);
    return new Response(`console.warn('[PixelAnalytics] Service unavailable'); window.PixelAnalytics = { track: function() {} };`, {
      status: 200,
      headers: {
        "Content-Type": "application/javascript; charset=utf-8",
        ...corsHeaders,
      },
    });
  }
}

export default function ApiPixelJsRoute() {
  return null;
}
