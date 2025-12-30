// routes/apps.tools.pixel.tsx - COMPLETE FIXED VERSION
import type { LoaderFunctionArgs } from "react-router";
import prisma from "~/db.server";

// Handle CORS preflight requests
export async function action({ request }: LoaderFunctionArgs) {
  if (request.method === "OPTIONS") {
    return new Response(null, {
      status: 204,
      headers: {
        "Access-Control-Allow-Origin": "*",
        "Access-Control-Allow-Methods": "GET, OPTIONS",
        "Access-Control-Allow-Headers": "Content-Type",
        "Access-Control-Max-Age": "86400",
      },
    });
  }
  return new Response("Method not allowed", { status: 405 });
}

export async function loader({ request }: LoaderFunctionArgs) {
  // Handle OPTIONS preflight
  if (request.method === "OPTIONS") {
    return new Response(null, {
      status: 204,
      headers: {
        "Access-Control-Allow-Origin": "*",
        "Access-Control-Allow-Methods": "GET, OPTIONS",
        "Access-Control-Allow-Headers": "Content-Type",
        "Access-Control-Max-Age": "86400",
      },
    });
  }
  const url = new URL(request.url);
  const id = url.searchParams.get('id');
  const shop = url.searchParams.get('shop');

  console.log(`[Pixel] Request for appId: ${id}, shop: ${shop}`);

  if (!id) {
    return new Response("// Missing app ID", {
      status: 400,
      headers: {
        "Content-Type": "application/javascript; charset=utf-8",
        "Access-Control-Allow-Origin": "*",
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
      console.log(`[Pixel] App not found: ${id}`);
      
      // Try to find available apps for this shop to help debug
      let availableApps: any[] = [];
      try {
        if (shop) {
          // Try to find user by shop domain
          const user = await prisma.user.findUnique({
            where: { storeUrl: shop },
            include: { apps: { select: { appId: true, name: true } } }
          });
          if (user) {
            availableApps = user.apps;
          }
        }
        
        // If no shop-specific apps, get all apps
        if (availableApps.length === 0) {
          availableApps = await prisma.app.findMany({
            select: { appId: true, name: true },
            take: 5,
            orderBy: { createdAt: 'desc' }
          });
        }
        
        if (availableApps.length > 0) {
          console.log(`[Pixel] Available app IDs for shop ${shop || 'all'}:`, 
            availableApps.map(a => `${a.appId} (${a.name})`).join(', '));
        }
      } catch (err) {
        console.error('[Pixel] Error fetching available apps:', err);
      }
      
      const availableAppsList = availableApps.length > 0 
        ? `\n// Available app IDs: ${availableApps.map(a => a.appId).join(', ')}`
        : '';
      
      return new Response(`
console.warn('[PixelAnalytics] App not found: ${id}');
console.warn('[PixelAnalytics] Please check your theme.liquid script tag and use a valid app ID.${availableAppsList}');
window.PixelAnalytics = { track: () => console.warn('Tracking disabled - invalid app ID') };
      `, {
        status: 200,
        headers: {
          "Content-Type": "application/javascript; charset=utf-8",
          "Access-Control-Allow-Origin": "*",
          "Access-Control-Allow-Methods": "GET, OPTIONS",
          "X-Content-Type-Options": "nosniff",
        },
      });
    }

    // Fetch active custom events
    const customEvents = await prisma.customEvent.findMany({
      where: { appId: app.id, isActive: true },
      select: { name: true, displayName: true, selector: true, eventType: true, metaEventName: true, hasProductId: true },
    });

    const settings = app.settings;
    const trackPageviews = settings?.autoTrackPageviews ?? true;
    const trackClicks = settings?.autoTrackClicks ?? true;
    const trackScroll = settings?.autoTrackScroll ?? true;
    const trackViewContent = settings?.autoTrackViewContent ?? true;
    const trackAddToCart = settings?.autoTrackAddToCart ?? true;
    const trackInitiateCheckout = settings?.autoTrackInitiateCheckout ?? true;
    const trackPurchase = settings?.autoTrackPurchase ?? true;

    // Auto-track events config
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
    
    // CORB-PROOF SCRIPT
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
      return session || (sessionStorage.setItem(SESSION_KEY, generateId()), generateId());
    } catch (e) { return generateId(); }
  }

  function getVisitor() {
    try {
      var visitor = localStorage.getItem(VISITOR_KEY);
      return visitor || (localStorage.setItem(VISITOR_KEY, generateId()), generateId());
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

  // TRIPLE FALLBACK TRACKING (CORB-PROOF)
  function track(eventName, properties = {}) {
    var utmParams = getUtmParams();
    var data = {
      appId: APP_ID, eventName, url: window.location.href, referrer: document.referrer,
      pageTitle: document.title, sessionId: getSession(), visitorId: getVisitor(),
      fingerprint: getFingerprint(), timestamp: new Date().toISOString(),
      screenWidth: screen.width, screenHeight: screen.height, language: navigator.language,
      ...utmParams, ...properties, customData: properties
    };

    if (DEBUG) console.log('[PixelAnalytics] Tracking:', eventName, data);

    // PRIORITY 1: sendBeacon (Shopify-recommended, page-unload safe)
    if (navigator.sendBeacon) {
      sendBeacon(data, eventName);
      return data;
    }
    // PRIORITY 2: Image pixel (100% CORB-proof)
    sendImagePixel(eventName, data);
    return data;
  }

  // sendBeacon (Primary - works everywhere on Shopify)
  function sendBeacon(data, eventName) {
    try {
      var blob = new Blob([JSON.stringify({ event: eventName, data })], { type: 'application/json' });
      var success = navigator.sendBeacon(BEACON_ENDPOINT, blob);
      if (DEBUG && !success) console.warn('[PixelAnalytics] sendBeacon failed');
    } catch (e) {
      if (DEBUG) console.error('[PixelAnalytics] sendBeacon error:', e);
      sendImagePixel(eventName, data);
    }
  }

  // Image pixel (Fallback - bulletproof)
  function sendImagePixel(eventName, data) {
    try {
      var params = new URLSearchParams();
      params.append('e', eventName);
      params.append('d', btoa(JSON.stringify(data)));
      params.append('t', Date.now().toString());
      
      var img = new Image(1, 1);
      img.onload = img.onerror = () => { if (DEBUG) console.log('[PixelAnalytics] Image sent:', eventName); };
      img.src = ENDPOINT + '?' + params.toString();
    } catch (e) {
      if (DEBUG) console.error('[PixelAnalytics] Image pixel failed:', e);
    }
  }

  // E-commerce helpers
  window.PixelAnalytics = {
    track,
    trackPurchase: (value, currency, orderId, products) => track('purchase', { value, currency: currency || 'USD', order_id: orderId, products }),
    trackAddToCart: (productId, productName, value, quantity) => track('addToCart', { product_id: productId, product_name: productName, value, quantity: quantity || 1 }),
    trackViewContent: (productId, productName, value, category) => track('viewContent', { product_id: productId, product_name: productName, value, category }),
    trackInitiateCheckout: (value, currency, products) => track('initiateCheckout', { value, currency: currency || 'USD', products }),
    setDebug: v => DEBUG = !!v
  };
  window.pixelTrack = window.px = track;

  // Auto-tracking (pageviews, clicks, scroll, custom events)
  ${trackPageviews ? `track('pageview'); /* SPA support + popstate interception */` : ''}
  ${trackScroll ? `
    var maxScroll = 0, trackedMilestones = {}, milestones = [25, 50, 75, 100];
    window.addEventListener('scroll', e => {
      var scrollPercent = Math.round((window.pageYOffset / (document.documentElement.scrollHeight - window.innerHeight)) * 100);
      if (scrollPercent > maxScroll) {
        maxScroll = scrollPercent;
        milestones.forEach(m => { if (scrollPercent >= m && !trackedMilestones[m]) { trackedMilestones[m] = true; track('scroll', { depth: m }); } });
      }
    }, { passive: true });
  ` : ''}
  ${trackClicks ? `
    document.addEventListener('click', e => {
      var elem = e.target.closest('a, button, [role="button"]');
      if (elem) track('click', { element: elem.tagName.toLowerCase(), text: elem.innerText?.substring(0,100)?.trim(), href: elem.href });
    }, true);
  ` : ''}

  // E-commerce Event Auto-Detection
  ${trackViewContent ? `
    // ViewContent: Auto-detect product page views
    function detectViewContent() {
      // Shopify product page detection
      if (window.location.pathname.includes('/products/') || document.querySelector('[data-product-id]') || window.ShopifyAnalytics?.meta?.product) {
        var productData = {};
        
        // Try to get product data from Shopify Analytics
        if (window.ShopifyAnalytics?.meta?.product) {
          var product = window.ShopifyAnalytics.meta.product;
          productData = {
            product_id: product.id,
            product_name: product.title,
            value: product.price / 100, // Shopify stores price in cents
            currency: window.ShopifyAnalytics.meta.currency || 'USD',
            category: product.type || product.vendor
          };
        } else {
          // Fallback: try to extract from DOM
          var productId = document.querySelector('[data-product-id]')?.getAttribute('data-product-id') ||
                         document.querySelector('meta[property="product:price:amount"]')?.getAttribute('content');
          var productName = document.querySelector('h1')?.textContent?.trim() ||
                           document.querySelector('.product-title, .product__title')?.textContent?.trim();
          var priceElement = document.querySelector('.price, .product-price, [data-price]');
          var price = priceElement ? parseFloat(priceElement.textContent.replace(/[^0-9.]/g, '')) : null;
          
          if (productId || productName) {
            productData = {
              product_id: productId,
              product_name: productName,
              value: price,
              currency: 'USD'
            };
          }
        }
        
        if (Object.keys(productData).length > 0) {
          track('viewContent', productData);
        }
      }
    }
    
    // Run on page load and for SPA navigation
    if (document.readyState === 'loading') {
      document.addEventListener('DOMContentLoaded', detectViewContent);
    } else {
      detectViewContent();
    }
  ` : ''}

  ${trackAddToCart ? `
    // AddToCart: Auto-detect add to cart actions
    document.addEventListener('click', function(e) {
      var addToCartBtn = e.target.closest('[name="add"], .btn-product-form, .product-form__cart-submit, [data-add-to-cart], .add-to-cart, .addtocart');
      if (addToCartBtn) {
        setTimeout(function() {
          var productData = {};
          
          // Try to get product data from the form or page
          var form = addToCartBtn.closest('form') || document.querySelector('form[action*="/cart/add"]');
          if (form) {
            var variantId = form.querySelector('[name="id"]')?.value;
            var quantity = parseInt(form.querySelector('[name="quantity"]')?.value || '1');
            
            // Get product info from Shopify Analytics or DOM
            if (window.ShopifyAnalytics?.meta?.product) {
              var product = window.ShopifyAnalytics.meta.product;
              var variant = product.variants?.find(v => v.id == variantId) || product.variants?.[0];
              productData = {
                product_id: variantId || product.id,
                product_name: product.title + (variant?.title && variant.title !== 'Default Title' ? ' - ' + variant.title : ''),
                value: (variant?.price || product.price) / 100,
                currency: window.ShopifyAnalytics.meta.currency || 'USD',
                quantity: quantity
              };
            } else {
              // Fallback DOM extraction
              var productName = document.querySelector('h1, .product-title, .product__title')?.textContent?.trim();
              var priceElement = document.querySelector('.price, .product-price, [data-price]');
              var price = priceElement ? parseFloat(priceElement.textContent.replace(/[^0-9.]/g, '')) : null;
              
              productData = {
                product_id: variantId,
                product_name: productName,
                value: price,
                currency: 'USD',
                quantity: quantity
              };
            }
            
            if (productData.product_id || productData.product_name) {
              track('addToCart', productData);
            }
          }
        }, 100); // Small delay to ensure form data is processed
      }
    }, true);
  ` : ''}

  ${trackInitiateCheckout ? `
    // InitiateCheckout: Auto-detect checkout initiation
    document.addEventListener('click', function(e) {
      var checkoutBtn = e.target.closest('.checkout-button, [href*="/checkout"], [href*="/cart"], .cart__checkout, .btn--checkout, [data-checkout]');
      if (checkoutBtn && (checkoutBtn.href?.includes('checkout') || checkoutBtn.textContent?.toLowerCase().includes('checkout'))) {
        // Try to get cart data
        var cartData = {};
        
        if (window.ShopifyAnalytics?.meta?.cart) {
          var cart = window.ShopifyAnalytics.meta.cart;
          cartData = {
            value: cart.total_price / 100,
            currency: window.ShopifyAnalytics.meta.currency || 'USD',
            products: cart.items?.map(item => ({
              product_id: item.variant_id,
              product_name: item.product_title + (item.variant_title !== 'Default Title' ? ' - ' + item.variant_title : ''),
              quantity: item.quantity,
              value: item.price / 100
            }))
          };
        } else {
          // Try to fetch cart via AJAX
          fetch('/cart.js')
            .then(res => res.json())
            .then(cart => {
              cartData = {
                value: cart.total_price / 100,
                currency: cart.currency || 'USD',
                products: cart.items?.map(item => ({
                  product_id: item.variant_id,
                  product_name: item.product_title + (item.variant_title !== 'Default Title' ? ' - ' + item.variant_title : ''),
                  quantity: item.quantity,
                  value: item.price / 100
                }))
              };
              track('initiateCheckout', cartData);
            })
            .catch(() => {
              // Fallback without cart details
              track('initiateCheckout', { value: 0, currency: 'USD' });
            });
          return; // Exit early since we're handling async
        }
        
        track('initiateCheckout', cartData);
      }
    }, true);
  ` : ''}

  ${trackPurchase ? `
    // Purchase: Auto-detect on thank you/order confirmation pages
    function detectPurchase() {
      // Shopify thank you page detection
      if (window.location.pathname.includes('/thank_you') || 
          window.location.pathname.includes('/orders/') ||
          document.querySelector('.os-order-number, .order-number, [data-order-id]') ||
          window.Shopify?.checkout) {
        
        var orderData = {};
        
        // Try to get order data from Shopify checkout object
        if (window.Shopify?.checkout) {
          var checkout = window.Shopify.checkout;
          orderData = {
            order_id: checkout.order_id || checkout.id,
            value: checkout.total_price,
            currency: checkout.currency,
            products: checkout.line_items?.map(item => ({
              product_id: item.variant_id,
              product_name: item.title,
              quantity: item.quantity,
              value: item.price
            }))
          };
        } else if (window.ShopifyAnalytics?.meta?.order) {
          // Alternative: ShopifyAnalytics order data
          var order = window.ShopifyAnalytics.meta.order;
          orderData = {
            order_id: order.id,
            value: order.total_price / 100,
            currency: order.currency,
            products: order.line_items?.map(item => ({
              product_id: item.variant_id,
              product_name: item.title,
              quantity: item.quantity,
              value: item.price / 100
            }))
          };
        } else {
          // Fallback: try to extract from DOM
          var orderNumber = document.querySelector('.os-order-number, .order-number')?.textContent?.trim();
          var totalElement = document.querySelector('.total-recap__final-price, .order-summary__emphasis, .total-line__price');
          var total = totalElement ? parseFloat(totalElement.textContent.replace(/[^0-9.]/g, '')) : null;
          
          if (orderNumber || total) {
            orderData = {
              order_id: orderNumber,
              value: total,
              currency: 'USD'
            };
          }
        }
        
        if (Object.keys(orderData).length > 0) {
          track('purchase', orderData);
        }
      }
    }
    
    // Run on page load
    if (document.readyState === 'loading') {
      document.addEventListener('DOMContentLoaded', detectPurchase);
    } else {
      detectPurchase();
    }
  ` : ''}

  // Custom events + data attributes + MutationObserver
  function setupCustomTracking() {
    CUSTOM_EVENTS.forEach(ce => {
      if (!ce.selector) return;
      document.querySelectorAll(ce.selector).forEach(el => {
        if (el._pixelTracked) return;
        el._pixelTracked = true;
        el.addEventListener(ce.eventType || 'click', e => track(ce.name, { selector: ce.selector }));
      });
    });
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', setupCustomTracking);
  else setupCustomTracking();

  if (typeof MutationObserver !== 'undefined') {
    new MutationObserver(() => setupCustomTracking()).observe(document.body, { childList: true, subtree: true });
  }

  ['click', 'submit', 'change'].forEach(evt => {
    document.addEventListener(evt, e => {
      var elem = e.target.closest('[data-pixel-event]');
      if (elem) {
        var eventName = elem.getAttribute('data-pixel-event');
        track(eventName, { element: elem.tagName.toLowerCase(), text: elem.innerText?.substring(0,100)?.trim() });
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
        "Access-Control-Allow-Origin": "*",
        "Access-Control-Allow-Methods": "GET, OPTIONS",
        "Access-Control-Allow-Headers": "Content-Type",
        "Access-Control-Max-Age": "86400",
        "X-Content-Type-Options": "nosniff",
        "Vary": "Origin",
      },
    });
  } catch (error) {
    console.error("[Pixel] Error:", error);
    return new Response(`console.warn('[PixelAnalytics] Service unavailable'); window.PixelAnalytics = { track: () => {} };`, {
      status: 200,
      headers: {
        "Content-Type": "application/javascript; charset=utf-8",
        "Access-Control-Allow-Origin": "*",
        "Access-Control-Allow-Methods": "GET, OPTIONS",
        "X-Content-Type-Options": "nosniff",
      },
    });
  }
}

export default function PixelJsAPI() { return null; }
