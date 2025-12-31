import type { LoaderFunctionArgs, ActionFunctionArgs } from "react-router";
import prisma from "~/db.server";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type",
  "Access-Control-Max-Age": "86400",
  "X-Content-Type-Options": "nosniff",
};

// Handle OPTIONS preflight requests for CORS
export async function action({ request }: ActionFunctionArgs) {
  if (request.method === "OPTIONS") {
    return new Response(null, { status: 204, headers: corsHeaders });
  }
  return new Response("Method not allowed", { status: 405, headers: corsHeaders });
}

export async function loader({ request }: LoaderFunctionArgs) {

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
    
    // Default e-commerce tracking settings
    const trackViewContent = settings?.autoTrackViewContent ?? true;
    const trackAddToCart = settings?.autoTrackAddToCart ?? true;
    const trackInitiateCheckout = settings?.autoTrackInitiateCheckout ?? true;
    const trackPurchase = settings?.autoTrackPurchase ?? true;

    const autoTrackEvents = customEvents
      .filter((ce: any) => ce.selector)
      .map((ce: any) => ({
        name: ce.name,
        selector: ce.selector,
        eventType: ce.eventType,
        meta: ce.metaEventName,
      }));

    // Get the base URL for API calls
    const baseUrl = process.env.SHOPIFY_APP_URL || "https://pixelify-red.vercel.app";
    
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

  // Default E-commerce Event Auto-tracking
  ${trackViewContent ? `
    // Enhanced Auto-track ViewContent on product pages with better debugging
    function setupViewContentTracking() {
      var isProductPage = window.location.pathname.includes('/products/') || 
                         document.querySelector('.product-single, .product-page, [data-product-id], .product-form') ||
                         document.querySelector('meta[property="product:retailer_item_id"]');
      
      if (DEBUG) console.log('[PixelAnalytics] ViewContent check - isProductPage:', isProductPage);
      
      if (isProductPage) {
        var productId = null;
        var productName = null;
        var productPrice = null;
        
        // Try multiple ways to get product ID
        var productIdSources = [
          document.querySelector('[data-product-id]')?.getAttribute('data-product-id'),
          document.querySelector('meta[property="product:retailer_item_id"]')?.getAttribute('content'),
          document.querySelector('[name="id"]')?.value,
          window.location.pathname.split('/products/')[1]?.split('?')[0]?.split('/')[0]
        ];
        
        for (var i = 0; i < productIdSources.length; i++) {
          if (productIdSources[i]) {
            productId = productIdSources[i];
            break;
          }
        }
        
        // Try multiple ways to get product name
        var nameSelectors = [
          'h1.product-title', '.product-name', '.product__title', 'h1', 
          '.product-single__title', '.product-meta__title'
        ];
        
        for (var i = 0; i < nameSelectors.length; i++) {
          var nameEl = document.querySelector(nameSelectors[i]);
          if (nameEl && nameEl.innerText && nameEl.innerText.trim()) {
            productName = nameEl.innerText.trim();
            break;
          }
        }
        
        // Fallback to meta tag or page title
        if (!productName) {
          productName = document.querySelector('meta[property="og:title"]')?.getAttribute('content') ||
                       document.title;
        }
        
        // Try multiple ways to get price
        var priceSources = [
          document.querySelector('.price')?.innerText?.replace(/[^0-9.]/g, ''),
          document.querySelector('.product-price')?.innerText?.replace(/[^0-9.]/g, ''),
          document.querySelector('[data-price]')?.innerText?.replace(/[^0-9.]/g, ''),
          document.querySelector('.price__current')?.innerText?.replace(/[^0-9.]/g, ''),
          document.querySelector('.money')?.innerText?.replace(/[^0-9.]/g, ''),
          document.querySelector('meta[property="product:price:amount"]')?.getAttribute('content')
        ];
        
        for (var i = 0; i < priceSources.length; i++) {
          if (priceSources[i]) {
            productPrice = parseFloat(priceSources[i]);
            break;
          }
        }
        
        var eventData = {
          product_id: productId,
          product_name: productName,
          value: productPrice,
          content_type: 'product',
          currency: 'USD'
        };
        
        if (DEBUG) {
          console.log('[PixelAnalytics] ViewContent event data:', eventData);
          console.log('[PixelAnalytics] Product detection sources:', {
            productIdSources: productIdSources,
            nameSelectors: nameSelectors.map(function(sel) { 
              return { selector: sel, found: !!document.querySelector(sel) }; 
            }),
            priceSources: priceSources
          });
        }
        
        setTimeout(function() {
          track('viewContent', eventData);
        }, 500);
      }
    }
    
    setupViewContentTracking();
  ` : ''}
  
  ${trackAddToCart ? `
    // Enhanced Auto-track AddToCart events with better debugging
    function setupAddToCartTracking() {
      var selectors = [
        '.add-to-cart', '.product-form__cart-submit', '[name="add"]', '.btn-add-to-cart',
        '.product-form button[type="submit"]', '.shopify-product-form button[type="submit"]',
        '.product-add-to-cart', '.add-to-bag', '.buy-now', '.product-form__buttons button',
        '.product-form-submit', '.add-to-cart-button', '.cart-submit', '.product-submit',
        '.btn-product-add', '.btn-cart', '.add-cart', '.addtocart', '.add_to_cart'
      ];
      
      if (DEBUG) console.log('[PixelAnalytics] Setting up AddToCart tracking with selectors:', selectors);
      
      var foundButtons = [];
      selectors.forEach(function(selector) {
        var buttons = document.querySelectorAll(selector);
        if (buttons.length > 0) {
          foundButtons.push({ selector: selector, count: buttons.length });
          if (DEBUG) console.log('[PixelAnalytics] Found', buttons.length, 'buttons for selector:', selector);
        }
        
        buttons.forEach(function(btn) {
          if (btn._addToCartTracked) return;
          btn._addToCartTracked = true;
          
          if (DEBUG) console.log('[PixelAnalytics] Attaching AddToCart listener to button:', btn, 'selector:', selector);
          
          btn.addEventListener('click', function(e) {
            if (DEBUG) console.log('[PixelAnalytics] AddToCart button clicked:', btn);
            
            var form = btn.closest('form') || btn.closest('.product-form') || btn.closest('.shopify-product-form');
            var productId = null;
            var productName = null;
            var quantity = 1;
            var price = null;
            
            // Try multiple ways to get product ID
            if (form) {
              var idInput = form.querySelector('[name="id"]');
              if (idInput) productId = idInput.value;
              
              var quantityInput = form.querySelector('[name="quantity"]');
              if (quantityInput) quantity = parseInt(quantityInput.value) || 1;
            }
            
            // Fallback product ID detection
            if (!productId) {
              var productIdEl = document.querySelector('[data-product-id]');
              if (productIdEl) productId = productIdEl.getAttribute('data-product-id');
            }
            
            // Try multiple ways to get product name
            var nameSelectors = ['h1.product-title', '.product-name', '.product__title', 'h1', '.product-single__title'];
            for (var i = 0; i < nameSelectors.length; i++) {
              var nameEl = document.querySelector(nameSelectors[i]);
              if (nameEl && nameEl.innerText && nameEl.innerText.trim()) {
                productName = nameEl.innerText.trim();
                break;
              }
            }
            
            // Try multiple ways to get price
            var priceSelectors = ['.price', '.product-price', '.price__current', '.product__price', '.money'];
            for (var i = 0; i < priceSelectors.length; i++) {
              var priceEl = document.querySelector(priceSelectors[i]);
              if (priceEl && priceEl.innerText) {
                var priceText = priceEl.innerText.replace(/[^0-9.]/g, '');
                if (priceText) {
                  price = parseFloat(priceText);
                  break;
                }
              }
            }
            
            var eventData = {
              product_id: productId,
              product_name: productName,
              quantity: quantity,
              value: price ? price * quantity : undefined,
              currency: 'USD',
              content_type: 'product',
              selector_used: selector,
              button_text: btn.innerText ? btn.innerText.trim().substring(0, 50) : '',
              form_found: !!form
            };
            
            if (DEBUG) {
              console.log('[PixelAnalytics] AddToCart event data:', eventData);
              console.log('[PixelAnalytics] Form element:', form);
              console.log('[PixelAnalytics] Product ID sources checked:', {
                formInput: form ? form.querySelector('[name="id"]') : null,
                dataAttribute: document.querySelector('[data-product-id]')
              });
            }
            
            track('addToCart', eventData);
          });
        });
      });
      
      if (DEBUG) {
        console.log('[PixelAnalytics] AddToCart setup complete. Found buttons:', foundButtons);
        if (foundButtons.length === 0) {
          console.warn('[PixelAnalytics] WARNING: No AddToCart buttons found! Check your theme selectors.');
          console.log('[PixelAnalytics] Available buttons on page:', document.querySelectorAll('button').length);
          console.log('[PixelAnalytics] Available forms on page:', document.querySelectorAll('form').length);
        }
      }
    }
    
    // Setup with retry mechanism
    function setupAddToCartWithRetry() {
      setupAddToCartTracking();
      
      // Retry after 2 seconds in case elements load dynamically
      setTimeout(function() {
        if (DEBUG) console.log('[PixelAnalytics] Retrying AddToCart setup after 2s...');
        setupAddToCartTracking();
      }, 2000);
      
      // Final retry after 5 seconds
      setTimeout(function() {
        if (DEBUG) console.log('[PixelAnalytics] Final AddToCart setup retry after 5s...');
        setupAddToCartTracking();
      }, 5000);
    }
    
    if (document.readyState === 'loading') {
      document.addEventListener('DOMContentLoaded', setupAddToCartWithRetry);
    } else {
      setupAddToCartWithRetry();
    }
  ` : ''}
  
  ${trackInitiateCheckout ? `
    // Auto-track InitiateCheckout on checkout page
    if (window.location.pathname.includes('/checkout') || window.location.pathname.includes('/cart')) {
      setTimeout(function() {
        var cartValue = document.querySelector('.cart-total, .total-price, [data-cart-total]')?.innerText?.replace(/[^0-9.]/g, '');
        track('initiateCheckout', {
          value: cartValue ? parseFloat(cartValue) : undefined,
          currency: 'USD'
        });
      }, 1000);
    }
  ` : ''}
  
  ${trackPurchase ? `
    // Auto-track Purchase on thank you/order confirmation pages
    if (window.location.pathname.includes('/thank_you') || 
        window.location.pathname.includes('/orders/') ||
        document.querySelector('.order-confirmation, .thank-you')) {
      setTimeout(function() {
        var orderValue = document.querySelector('.order-total, .total-price, [data-order-total]')?.innerText?.replace(/[^0-9.]/g, '') ||
                        window.Shopify?.checkout?.total_price;
        var orderId = window.Shopify?.checkout?.order_id ||
                     document.querySelector('[data-order-id]')?.getAttribute('data-order-id') ||
                     window.location.pathname.match(/orders\/([^\/]+)/)?.[1];
        
        track('purchase', {
          value: orderValue ? parseFloat(orderValue) / 100 : undefined, // Shopify prices are in cents
          currency: window.Shopify?.checkout?.currency || 'USD',
          order_id: orderId,
          transaction_id: orderId
        });
      }, 1000);
    }
  ` : ''}

  // Enhanced Custom events with better debugging
  function setupCustomTracking() {
    if (DEBUG) console.log('[PixelAnalytics] Setting up custom events:', CUSTOM_EVENTS);
    
    CUSTOM_EVENTS.forEach(function(ce) {
      if (!ce.selector) {
        if (DEBUG) console.warn('[PixelAnalytics] Custom event missing selector:', ce);
        return;
      }
      
      var elements = document.querySelectorAll(ce.selector);
      if (DEBUG) console.log('[PixelAnalytics] Custom event "' + ce.name + '" found', elements.length, 'elements for selector:', ce.selector);
      
      if (elements.length === 0) {
        if (DEBUG) console.warn('[PixelAnalytics] No elements found for custom event:', ce.name, 'selector:', ce.selector);
      }
      
      elements.forEach(function(el) {
        if (el._pixelTracked) return;
        el._pixelTracked = true;
        
        var eventType = ce.eventType || 'click';
        if (DEBUG) console.log('[PixelAnalytics] Attaching', eventType, 'listener to element for event:', ce.name);
        
        el.addEventListener(eventType, function(e) {
          if (DEBUG) console.log('[PixelAnalytics] Custom event triggered:', ce.name, 'element:', el);
          
          var eventData = { 
            selector: ce.selector,
            element_type: el.tagName.toLowerCase(),
            element_text: (el.innerText || '').substring(0, 100).trim(),
            custom_event: true
          };
          
          // Add meta event name if specified
          if (ce.meta) {
            eventData.meta_event = ce.meta;
          }
          
          track(ce.name, eventData);
        });
      });
    });
    
    if (DEBUG) {
      var totalCustomEvents = CUSTOM_EVENTS.length;
      var activeCustomEvents = CUSTOM_EVENTS.filter(function(ce) { 
        return ce.selector && document.querySelectorAll(ce.selector).length > 0; 
      }).length;
      console.log('[PixelAnalytics] Custom events setup complete:', activeCustomEvents + '/' + totalCustomEvents, 'events have matching elements');
    }
  }
  
  // Setup custom events with retry mechanism
  function setupCustomTrackingWithRetry() {
    setupCustomTracking();
    
    // Retry after 2 seconds for dynamically loaded content
    setTimeout(function() {
      if (DEBUG) console.log('[PixelAnalytics] Retrying custom events setup after 2s...');
      setupCustomTracking();
    }, 2000);
  }
  
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', setupCustomTrackingWithRetry);
  } else {
    setupCustomTrackingWithRetry();
  }

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

  // Enhanced debugging and diagnostics
  if (DEBUG) {
    console.log('[PixelAnalytics] Initialized:', APP_ID);
    console.log('[PixelAnalytics] Configuration:', {
      trackPageviews: ${trackPageviews},
      trackClicks: ${trackClicks},
      trackScroll: ${trackScroll},
      trackViewContent: ${trackViewContent},
      trackAddToCart: ${trackAddToCart},
      trackInitiateCheckout: ${trackInitiateCheckout},
      trackPurchase: ${trackPurchase},
      customEventsCount: CUSTOM_EVENTS.length
    });
    
    // Page analysis for debugging
    setTimeout(function() {
      console.log('[PixelAnalytics] Page Analysis:');
      console.log('- URL:', window.location.href);
      console.log('- Page type detection:', {
        isProductPage: window.location.pathname.includes('/products/') || !!document.querySelector('.product-single, .product-page, [data-product-id]'),
        isCartPage: window.location.pathname.includes('/cart'),
        isCheckoutPage: window.location.pathname.includes('/checkout'),
        isThankYouPage: window.location.pathname.includes('/thank_you') || window.location.pathname.includes('/orders/')
      });
      console.log('- Available buttons:', document.querySelectorAll('button').length);
      console.log('- Available forms:', document.querySelectorAll('form').length);
      console.log('- Product elements:', {
        productForms: document.querySelectorAll('.product-form, .shopify-product-form').length,
        addToCartButtons: document.querySelectorAll('.add-to-cart, .product-form__cart-submit, [name="add"], .btn-add-to-cart').length,
        productTitles: document.querySelectorAll('h1.product-title, .product-name, .product__title').length,
        priceElements: document.querySelectorAll('.price, .product-price, .money').length
      });
      
      // Test if we can find common e-commerce elements
      var commonSelectors = [
        '.add-to-cart', '.product-form__cart-submit', '[name="add"]', '.btn-add-to-cart',
        '.product-form button[type="submit"]', '.shopify-product-form button[type="submit"]'
      ];
      
      console.log('- Add to Cart selector analysis:');
      commonSelectors.forEach(function(selector) {
        var elements = document.querySelectorAll(selector);
        if (elements.length > 0) {
          console.log('  ✅', selector, '- Found', elements.length, 'element(s)');
        } else {
          console.log('  ❌', selector, '- Not found');
        }
      });
      
      // Custom events analysis
      if (CUSTOM_EVENTS.length > 0) {
        console.log('- Custom events analysis:');
        CUSTOM_EVENTS.forEach(function(ce) {
          var elements = document.querySelectorAll(ce.selector || '');
          console.log('  Event:', ce.name, '| Selector:', ce.selector, '| Found:', elements.length, 'elements');
        });
      }
    }, 1000);
    
    // Expose debugging functions globally
    window.PixelAnalytics.debug = {
      testAddToCart: function() {
        console.log('[PixelAnalytics] Testing AddToCart event...');
        track('addToCart', {
          product_id: 'test-product-123',
          product_name: 'Test Product',
          value: 29.99,
          currency: 'USD',
          quantity: 1,
          test_event: true
        });
        console.log('[PixelAnalytics] AddToCart test event sent!');
      },
      testCustomEvent: function(eventName) {
        console.log('[PixelAnalytics] Testing custom event:', eventName);
        track(eventName || 'test_custom_event', {
          test_event: true,
          timestamp: new Date().toISOString()
        });
        console.log('[PixelAnalytics] Custom event test sent!');
      },
      analyzeSelectors: function() {
        console.log('[PixelAnalytics] Analyzing page selectors...');
        var analysis = {
          buttons: Array.from(document.querySelectorAll('button')).map(function(btn) {
            return {
              text: btn.innerText.trim().substring(0, 50),
              classes: btn.className,
              id: btn.id,
              type: btn.type,
              name: btn.name
            };
          }),
          forms: Array.from(document.querySelectorAll('form')).map(function(form) {
            return {
              action: form.action,
              method: form.method,
              classes: form.className,
              id: form.id,
              inputs: Array.from(form.querySelectorAll('input')).map(function(input) {
                return { name: input.name, type: input.type, value: input.value };
              })
            };
          })
        };
        console.table(analysis.buttons);
        console.table(analysis.forms);
        return analysis;
      }
    };
    
    console.log('[PixelAnalytics] Debug functions available:');
    console.log('- PixelAnalytics.debug.testAddToCart() - Test add to cart tracking');
    console.log('- PixelAnalytics.debug.testCustomEvent("event_name") - Test custom event');
    console.log('- PixelAnalytics.debug.analyzeSelectors() - Analyze page elements');
  }
})();
    `;

    return new Response(script, {
      headers: {
        "Content-Type": "application/javascript; charset=utf-8",
        "Cache-Control": "no-cache, no-store, must-revalidate",
        "Pragma": "no-cache",
        "Expires": "0",
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
