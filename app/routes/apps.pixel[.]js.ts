// Dedicated route for /apps/pixel-api/pixel.js
import type { LoaderFunctionArgs } from "react-router";
import prisma from "~/db.server";

export async function loader({ request }: LoaderFunctionArgs) {
  const url = new URL(request.url);
  const id = url.searchParams.get('id');
  const shop = url.searchParams.get('shop');

  console.log(`[Apps Proxy Pixel.js] Request for appId: ${id}, shop: ${shop}`);

  if (!id) {
    return new Response("console.error('[PixelTracker] Missing pixel ID');", {
      status: 400,
      headers: {
        "Content-Type": "application/javascript; charset=utf-8",
        "Cache-Control": "no-cache, no-store, must-revalidate",
        "X-Content-Type-Options": "nosniff",
      },
    });
  }

  try {
    const app = await prisma.app.findUnique({
      where: { appId: id },
      include: { settings: true },
    });

    if (!app) {
      console.log(`[Apps Proxy Pixel.js] App not found: ${id}`);
      return new Response(`
console.warn('[PixelTracker] App not found: ${id}');
window.PixelAnalytics = { track: () => console.warn('Tracking disabled - invalid app ID') };
      `, {
        status: 200,
        headers: {
          "Content-Type": "application/javascript; charset=utf-8",
          "Cache-Control": "no-cache, no-store, must-revalidate",
          "X-Content-Type-Options": "nosniff",
        },
      });
    }

    // Fetch active custom events
    const customEvents = await prisma.customEvent.findMany({
      where: { appId: app.id, isActive: true },
      select: { name: true, selector: true, eventType: true },
    });

    const settings = app.settings;
    const trackPageviews = settings?.autoTrackPageviews ?? true;
    const trackClicks = settings?.autoTrackClicks ?? true;
    const trackScroll = settings?.autoTrackScroll ?? false;

    const script = `
(function() {
  'use strict';
  var APP_ID = '${id}';
  var SHOP = '${shop || ""}';
  var ENDPOINT = '/apps/pixel-api/track';
  var DEBUG = true;
  var CUSTOM_EVENTS = window.PIXEL_TRACKER_CUSTOM_EVENTS || ${JSON.stringify(customEvents.map((e : any) => ({ name: e.name, selector: e.selector, eventType: e.eventType })))};

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

  // Setup custom events after DOM is ready
  function setupCustomEvents() {
    CUSTOM_EVENTS.forEach(function(ce) {
      if (!ce.selector) return;
      try {
        document.querySelectorAll(ce.selector).forEach(function(el) {
          if (el._pxTracked) return;
          el._pxTracked = true;
          el.addEventListener(ce.eventType || 'click', function() {
            track(ce.name);
            if (DEBUG) console.log('[PixelTracker] Custom event triggered:', ce.name, 'via selector:', ce.selector);
          });
        });
        if (DEBUG) console.log('[PixelTracker] Set up custom event:', ce.name, 'for selector:', ce.selector);
      } catch (error) {
        if (DEBUG) console.warn('[PixelTracker] Error setting up custom event:', ce.name, error);
      }
    });
  }

  // Setup immediately for static content
  setupCustomEvents();

  // Also setup after a short delay for dynamic content
  setTimeout(setupCustomEvents, 1000);

  // Setup on DOM changes (if MutationObserver is available)
  if (window.MutationObserver) {
    var observer = new MutationObserver(function(mutations) {
      var shouldRecheck = false;
      mutations.forEach(function(mutation) {
        if (mutation.type === 'childList' && mutation.addedNodes.length > 0) {
          shouldRecheck = true;
        }
      });
      if (shouldRecheck) {
        setTimeout(setupCustomEvents, 100);
      }
    });
    observer.observe(document.body, { childList: true, subtree: true });
  }

  if (DEBUG) console.log('[PixelTracker] Ready:', APP_ID);
})();
    `;

    return new Response(script, {
      headers: {
        "Content-Type": "application/javascript; charset=utf-8",
        "Cache-Control": "no-cache, no-store, must-revalidate",
        "X-Content-Type-Options": "nosniff",
      },
    });
  } catch (error: any) {
    console.error("[Apps Proxy Pixel.js] Error:", error);
    return new Response(`console.error('[PixelTracker] Error loading pixel: ${error.message}');`, {
      status: 500,
      headers: {
        "Content-Type": "application/javascript; charset=utf-8",
        "Cache-Control": "no-cache, no-store, must-revalidate",
        "X-Content-Type-Options": "nosniff",
      },
    });
  }
}

export default function AppsProxyPixelJs() {
  return null;
}