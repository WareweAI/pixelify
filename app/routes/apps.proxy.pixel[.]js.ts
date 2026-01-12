// Direct route for /apps/proxy/pixel.js
import type { LoaderFunctionArgs } from "react-router";
import prisma from "~/db.server";

// Server-only route - no client bundle needed
export const clientLoader = undefined;

export async function loader({ request }: LoaderFunctionArgs) {
  const url = new URL(request.url);
  const id = url.searchParams.get("id");
  const shopDomain = url.searchParams.get("shop");

  console.log(`[App Proxy] GET pixel.js, id: ${id}, shop: ${shopDomain}`);

  if (!id) {
    return new Response("// Missing pixel ID", {
      headers: { "Content-Type": "application/javascript" },
    });
  }

  try {
    const app = await prisma.app.findUnique({
      where: { appId: id },
      include: { settings: true },
    });

    if (!app) {
      return new Response(`console.warn('[PixelTracker] Pixel not found: ${id}');`, {
        headers: { "Content-Type": "application/javascript" },
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
    var currency = (window.Shopify && window.Shopify.currency) ? window.Shopify.currency : 'USD';
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
      currency: currency,
      timestamp: new Date().toISOString()
    };
    for (var k in utm) { if (utm[k]) data[k] = utm[k]; }
    for (var k in props) { data[k] = props[k]; }

    if (DEBUG) console.log('[PixelTracker]', eventName, data);

    fetch(ENDPOINT + '?shop=' + SHOP, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data)
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
    if (el) {
      var text = (el.innerText || el.textContent || '').trim().toLowerCase();
      var eventProps = { element: el.tagName, text: (el.innerText || '').slice(0, 50), href: el.href };

      // Always trigger the click event first
      track('click', eventProps);

      // Check if this is an add to cart action and trigger additional event
      if (text.includes('add to cart') ||
          text.includes('add to bag') ||
          text.includes('buy now') ||
          text.includes('add to basket') ||
          text.includes('add item') ||
          text.includes('افزودن به سبد') || // Persian
          text.includes('إضافة إلى السلة') || // Arabic
          text.includes('加入购物车') || // Chinese
          text.includes('장바구니에 추가') || // Korean
          text.includes('カートに追加') || // Japanese
          el.name === 'add' ||
          el.getAttribute('name') === 'add' ||
          el.closest('form[action*="/cart/add"]') ||
          el.closest('[data-product-form]') ||
          el.closest('.product-form') ||
          el.closest('.add-to-cart-form') ||
          el.getAttribute('data-action') === 'add-to-cart' ||
          el.getAttribute('data-testid') === 'add-to-cart' ||
          el.classList.contains('btn-add-to-cart') ||
          el.classList.contains('add-to-cart') ||
          el.classList.contains('add-to-cart-btn') ||
          el.classList.contains('product-form__submit') ||
          el.classList.contains('shopify-payment-button__button') ||
          el.id === 'AddToCart' ||
          el.getAttribute('id') === 'AddToCart' ||
          el.getAttribute('aria-label')?.includes('add to cart') ||
          el.getAttribute('title')?.includes('add to cart')) {

        // Use requestIdleCallback or setTimeout to ensure we don't block the UI
        var trackAddToCart = function() {
          // Try to extract product information
          var productForm = el.closest('form[action*="/cart/add"]') || el.closest('[data-product-form]') || el.closest('.product-form');
          var productId = null;
          var productName = null;
          var productPrice = null;
          var quantity = 1;

          if (productForm) {
            // Get product ID from form
            var idInput = productForm.querySelector('input[name="id"]') || productForm.querySelector('[name="id"]');
            if (idInput) productId = idInput.value;

            // Get quantity
            var qtyInput = productForm.querySelector('input[name="quantity"]') || productForm.querySelector('[name="quantity"]');
            if (qtyInput) quantity = parseInt(qtyInput.value) || 1;
          }

          // Try to get product name from page title or product title element
          if (document.title && document.title.includes('–')) {
            productName = document.title.split('–')[0].trim();
          } else {
            var titleEl = document.querySelector('.product-title, .product__title, h1.product-title, [data-product-title]');
            if (titleEl) productName = titleEl.textContent.trim();
          }

          // Try to get product price
          var priceEl = document.querySelector('.price, .product-price, .product__price, [data-product-price]');
          if (priceEl) {
            var priceText = priceEl.textContent.replace(/[^0-9.,]/g, '');
            productPrice = parseFloat(priceText.replace(',', '.'));
          }

          var addToCartProps = {
            element: el.tagName,
            text: (el.innerText || '').slice(0, 50),
            href: el.href,
            product_id: productId,
            product_name: productName,
            price: productPrice,
            quantity: quantity,
            currency: currency
          };

          // Trigger the custom add_to_cart event
          track('add_to_cart', addToCartProps);
        };

        // Use setTimeout with a small delay to ensure form submission isn't blocked
        setTimeout(trackAddToCart, 10);
      }
    }
  }, false);` : ""}
  ${trackScroll ? `
  var scrolled = {};
  window.addEventListener('scroll', function() {
    var pct = Math.round(100 * scrollY / (document.body.scrollHeight - innerHeight));
    [25, 50, 75, 100].forEach(function(m) {
      if (pct >= m && !scrolled[m]) { scrolled[m] = 1; track('scroll', { depth: m }); }
    });
  }, { passive: true });` : ""}

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
        "Cache-Control": "no-cache",
      },
    });
  } catch (error) {
    console.error("[App Proxy pixel.js] Error:", error);
    return new Response("// Error loading pixel", {
      headers: { "Content-Type": "application/javascript" },
    });
  }
}

// Catch-all route for /apps/proxy/*