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
    const trackViewContent = settings?.autoTrackViewContent ?? true;
    const trackAddToCart = settings?.autoTrackAddToCart ?? true;
    const trackInitiateCheckout = settings?.autoTrackInitiateCheckout ?? true;
    const trackPurchase = settings?.autoTrackPurchase ?? true;
    const trackingPages = settings?.trackingPages ?? "all";
    const selectedPages = settings?.selectedPages ? JSON.parse(settings.selectedPages) : [];

    const script = `
(function() {
  'use strict';
  var APP_ID = '${id}';
  var SHOP = '${shopDomain || ""}';
  var ENDPOINT = '/apps/pixel-api/track';
  var DEBUG = true;
  var CUSTOM_EVENTS = ${JSON.stringify(customEvents.map(e => ({ name: e.name, selector: e.selector, eventType: e.eventType })))};
  var TRACKING_PAGES = '${trackingPages}';
  var SELECTED_PAGES = ${JSON.stringify(selectedPages)};

  // Check if current page should be tracked
  function shouldTrackPage() {
    if (TRACKING_PAGES === 'all') {
      return true;
    }
    
    var currentPath = location.pathname;
    var isMatch = false;
    
    for (var i = 0; i < SELECTED_PAGES.length; i++) {
      var pagePath = SELECTED_PAGES[i];
      
      // Handle wildcard patterns
      if (pagePath.includes('*')) {
        var pattern = pagePath.replace(/\*/g, '.*');
        var regex = new RegExp('^' + pattern + '$');
        if (regex.test(currentPath)) {
          isMatch = true;
          break;
        }
      } else if (currentPath === pagePath) {
        isMatch = true;
        break;
      }
    }
    
    // If tracking mode is "selected", fire only on matched pages
    // If tracking mode is "excluded", fire on all pages except matched ones
    if (TRACKING_PAGES === 'selected') {
      return isMatch;
    } else if (TRACKING_PAGES === 'excluded') {
      return !isMatch;
    }
    
    return true;
  }

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
    // Check if page should be tracked
    if (!shouldTrackPage()) {
      if (DEBUG) console.log('[PixelTracker] Page not tracked due to page selection rules');
      return;
    }
    
    props = props || {};
    var utm = getUtm();
    var currency = (window.Shopify && window.Shopify.currency && window.Shopify.currency.active) || 'USD';
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
    data.customData = props;

    if (DEBUG) console.log('[PixelTracker] Tracking:', eventName, data);

    fetch(ENDPOINT + '?shop=' + SHOP, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data)
    })
    .then(function(r) { 
      if (DEBUG) console.log('[PixelTracker] ✅ Track response:', r.status); 
    })
    .catch(function(e) { 
      if (DEBUG) console.error('[PixelTracker] ❌ Track error:', e); 
    });
  }

  window.PixelAnalytics = {
    track: track,
    trackPurchase: function(v, c, o, p) { track('Purchase', { value: v, currency: c || 'USD', order_id: o, products: p }); },
    trackAddToCart: function(id, n, v, q) { track('AddToCart', { product_id: id, product_name: n, value: v, quantity: q || 1 }); },
    trackViewContent: function(id, n, v, c) { track('ViewContent', { product_id: id, product_name: n, value: v, category: c }); },
    trackInitiateCheckout: function(v, c, p) { track('InitiateCheckout', { value: v, currency: c || 'USD', products: p }); }
  };
  window.px = track;

  // Auto-track PageView
  ${trackPageviews ? "track('PageView');" : ""}

  // Auto-track ViewContent on product pages
  ${trackViewContent ? `
  (function() {
    var isProductPage = location.pathname.includes('/products/') || 
                       document.querySelector('.product-single, .product-page, [data-product-id], .product-form, [data-product]');
    
    if (isProductPage) {
      if (DEBUG) console.log('[PixelTracker] Product page detected, tracking ViewContent');
      
      setTimeout(function() {
        var productId = null;
        var productName = null;
        var productPrice = null;
        
        // Get product ID
        var idSources = [
          document.querySelector('[data-product-id]'),
          document.querySelector('input[name="id"]'),
          document.querySelector('[data-product]')
        ];
        for (var i = 0; i < idSources.length; i++) {
          if (idSources[i]) {
            productId = idSources[i].getAttribute('data-product-id') || 
                       idSources[i].value || 
                       idSources[i].getAttribute('data-product');
            if (productId) break;
          }
        }
        if (!productId) {
          var pathMatch = location.pathname.match(/\\/products\\/([^\\/\\?]+)/);
          if (pathMatch) productId = pathMatch[1];
        }
        
        // Get product name
        var nameSelectors = ['h1.product-title', '.product__title', '.product-single__title', 'h1', '.product-name'];
        for (var i = 0; i < nameSelectors.length; i++) {
          var el = document.querySelector(nameSelectors[i]);
          if (el && el.innerText && el.innerText.trim()) {
            productName = el.innerText.trim();
            break;
          }
        }
        if (!productName) {
          var ogTitle = document.querySelector('meta[property="og:title"]');
          if (ogTitle) productName = ogTitle.getAttribute('content');
        }
        
        // Get product price
        var priceSelectors = ['.price', '.product-price', '.product__price', '.money', '[data-product-price]'];
        for (var i = 0; i < priceSelectors.length; i++) {
          var el = document.querySelector(priceSelectors[i]);
          if (el && el.innerText) {
            var priceText = el.innerText.replace(/[^0-9.]/g, '');
            if (priceText) {
              productPrice = parseFloat(priceText);
              break;
            }
          }
        }
        
        track('ViewContent', {
          product_id: productId,
          product_name: productName,
          value: productPrice,
          content_type: 'product'
        });
      }, 500);
    }
  })();
  ` : ""}

  // Auto-track AddToCart
  ${trackAddToCart ? `
  (function() {
    var addToCartSelectors = [
      'form[action*="/cart/add"] button[type="submit"]',
      'form[action*="/cart/add"] input[type="submit"]',
      '.product-form button[type="submit"]',
      '.product-form__submit',
      '.add-to-cart',
      '.btn-add-to-cart',
      '[name="add"]',
      '.shopify-payment-button__button',
      '[data-add-to-cart]',
      '.product-form__cart-submit',
      '#AddToCart',
      '.add-to-cart-button'
    ];
    
    function setupAddToCartTracking() {
      if (DEBUG) console.log('[PixelTracker] Setting up AddToCart tracking...');
      
      addToCartSelectors.forEach(function(selector) {
        var buttons = document.querySelectorAll(selector);
        buttons.forEach(function(btn) {
          if (btn._pxAddToCart) return;
          btn._pxAddToCart = true;
          
          if (DEBUG && buttons.length > 0) console.log('[PixelTracker] Found AddToCart button:', selector);
          
          btn.addEventListener('click', function(e) {
            if (DEBUG) console.log('[PixelTracker] AddToCart button clicked');
            
            var form = btn.closest('form');
            var productId = null;
            var productName = null;
            var productPrice = null;
            var quantity = 1;
            
            if (form) {
              var idInput = form.querySelector('[name="id"]');
              if (idInput) productId = idInput.value;
              
              var qtyInput = form.querySelector('[name="quantity"]');
              if (qtyInput) quantity = parseInt(qtyInput.value) || 1;
            }
            
            // Get product name
            var nameSelectors = ['h1.product-title', '.product__title', '.product-single__title', 'h1'];
            for (var i = 0; i < nameSelectors.length; i++) {
              var el = document.querySelector(nameSelectors[i]);
              if (el && el.innerText && el.innerText.trim()) {
                productName = el.innerText.trim();
                break;
              }
            }
            
            // Get product price
            var priceSelectors = ['.price', '.product-price', '.product__price', '.money'];
            for (var i = 0; i < priceSelectors.length; i++) {
              var el = document.querySelector(priceSelectors[i]);
              if (el && el.innerText) {
                var priceText = el.innerText.replace(/[^0-9.]/g, '');
                if (priceText) {
                  productPrice = parseFloat(priceText);
                  break;
                }
              }
            }
            
            track('AddToCart', {
              product_id: productId,
              product_name: productName,
              value: productPrice ? productPrice * quantity : undefined,
              quantity: quantity,
              content_type: 'product'
            });
          });
        });
      });
    }
    
    // Setup immediately and retry for dynamic content
    setupAddToCartTracking();
    setTimeout(setupAddToCartTracking, 2000);
    setTimeout(setupAddToCartTracking, 5000);
    
    // Also listen for form submissions to /cart/add
    document.addEventListener('submit', function(e) {
      var form = e.target;
      if (form.action && form.action.includes('/cart/add')) {
        if (DEBUG) console.log('[PixelTracker] Cart form submitted');
        
        var productId = null;
        var quantity = 1;
        
        var idInput = form.querySelector('[name="id"]');
        if (idInput) productId = idInput.value;
        
        var qtyInput = form.querySelector('[name="quantity"]');
        if (qtyInput) quantity = parseInt(qtyInput.value) || 1;
        
        var productName = document.querySelector('h1')?.innerText?.trim();
        var priceEl = document.querySelector('.price, .product-price, .money');
        var productPrice = priceEl ? parseFloat(priceEl.innerText.replace(/[^0-9.]/g, '')) : null;
        
        track('AddToCart', {
          product_id: productId,
          product_name: productName,
          value: productPrice ? productPrice * quantity : undefined,
          quantity: quantity,
          content_type: 'product',
          trigger: 'form_submit'
        });
      }
    }, true);
  })();
  ` : ""}

  // Auto-track InitiateCheckout
  ${trackInitiateCheckout ? `
  (function() {
    if (location.pathname.includes('/cart') || location.pathname.includes('/checkout')) {
      if (DEBUG) console.log('[PixelTracker] Cart/Checkout page detected');
      
      setTimeout(function() {
        var cartValue = null;
        var valueSelectors = ['.cart-total', '.total-price', '[data-cart-total]', '.cart__total', '.totals__total-value'];
        for (var i = 0; i < valueSelectors.length; i++) {
          var el = document.querySelector(valueSelectors[i]);
          if (el && el.innerText) {
            var priceText = el.innerText.replace(/[^0-9.]/g, '');
            if (priceText) {
              cartValue = parseFloat(priceText);
              break;
            }
          }
        }
        
        track('InitiateCheckout', {
          value: cartValue,
          content_type: 'product'
        });
      }, 1000);
    }
    
    // Track checkout button clicks
    var checkoutSelectors = [
      '[name="checkout"]',
      '.cart__checkout-button',
      '.checkout-button',
      'button[name="checkout"]',
      'input[name="checkout"]',
      '[data-checkout]',
      '.cart__checkout',
      '#checkout'
    ];
    
    checkoutSelectors.forEach(function(selector) {
      var buttons = document.querySelectorAll(selector);
      buttons.forEach(function(btn) {
        if (btn._pxCheckout) return;
        btn._pxCheckout = true;
        
        btn.addEventListener('click', function() {
          if (DEBUG) console.log('[PixelTracker] Checkout button clicked');
          
          var cartValue = null;
          var valueEl = document.querySelector('.cart-total, .total-price, [data-cart-total]');
          if (valueEl) {
            cartValue = parseFloat(valueEl.innerText.replace(/[^0-9.]/g, ''));
          }
          
          track('InitiateCheckout', {
            value: cartValue,
            content_type: 'product',
            trigger: 'button_click'
          });
        });
      });
    });
  })();
  ` : ""}

  // Auto-track Purchase
  ${trackPurchase ? `
  (function() {
    var isThankYouPage = location.pathname.includes('/thank_you') || 
                        location.pathname.includes('/orders/') ||
                        document.querySelector('.order-confirmation, .thank-you, [data-order-confirmation]');
    
    if (isThankYouPage) {
      if (DEBUG) console.log('[PixelTracker] Thank you page detected, tracking Purchase');
      
      setTimeout(function() {
        var orderValue = null;
        var orderId = null;
        
        // Try Shopify checkout object first
        if (window.Shopify && window.Shopify.checkout) {
          orderValue = window.Shopify.checkout.total_price ? parseFloat(window.Shopify.checkout.total_price) / 100 : null;
          orderId = window.Shopify.checkout.order_id;
        }
        
        // Fallback to DOM
        if (!orderValue) {
          var valueEl = document.querySelector('.order-total, .total-price, [data-order-total]');
          if (valueEl) {
            orderValue = parseFloat(valueEl.innerText.replace(/[^0-9.]/g, ''));
          }
        }
        
        if (!orderId) {
          var orderIdEl = document.querySelector('[data-order-id]');
          if (orderIdEl) orderId = orderIdEl.getAttribute('data-order-id');
          
          if (!orderId) {
            var pathMatch = location.pathname.match(/orders\\/([^\\/\\?]+)/);
            if (pathMatch) orderId = pathMatch[1];
          }
        }
        
        track('Purchase', {
          value: orderValue,
          order_id: orderId,
          transaction_id: orderId,
          content_type: 'product'
        });
      }, 1000);
    }
  })();
  ` : ""}

  // Scroll tracking
  ${trackScroll ? `
  var scrolled = {};
  window.addEventListener('scroll', function() {
    var pct = Math.round(100 * scrollY / (document.body.scrollHeight - innerHeight));
    [25, 50, 75, 100].forEach(function(m) {
      if (pct >= m && !scrolled[m]) { scrolled[m] = 1; track('scroll', { depth: m }); }
    });
  }, { passive: true });
  ` : ""}

  // Click tracking
  ${trackClicks ? `
  document.addEventListener('click', function(e) {
    var el = e.target.closest('a,button,[role=button]');
    if (el) {
      track('click', { 
        element: el.tagName, 
        text: (el.innerText || '').slice(0, 50), 
        href: el.href 
      });
    }
  }, false);
  ` : ""}

  // Custom events
  CUSTOM_EVENTS.forEach(function(ce) {
    if (!ce.selector) return;
    document.querySelectorAll(ce.selector).forEach(function(el) {
      if (el._pxTracked) return;
      el._pxTracked = true;
      el.addEventListener(ce.eventType || 'click', function() { 
        if (DEBUG) console.log('[PixelTracker] Custom event:', ce.name);
        track(ce.name); 
      });
    });
  });

  if (DEBUG) {
    console.log('[PixelTracker] ✅ Ready:', APP_ID);
    console.log('[PixelTracker] Config:', {
      trackPageviews: ${trackPageviews},
      trackViewContent: ${trackViewContent},
      trackAddToCart: ${trackAddToCart},
      trackInitiateCheckout: ${trackInitiateCheckout},
      trackPurchase: ${trackPurchase},
      trackClicks: ${trackClicks},
      trackScroll: ${trackScroll},
      customEvents: CUSTOM_EVENTS.length
    });
  }
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