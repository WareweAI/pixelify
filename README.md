# Pixelify Custom Events Documentation

A comprehensive guide to creating, managing, and implementing custom events in Pixelify - the ultimate Shopify app for server-side Facebook pixel tracking that bypasses adblockers.

## 📋 Table of Contents

1. [Current Status Analysis](#current-status-analysis)
2. [Complete Setup Guide](#complete-setup-guide)
3. [Usage Examples](#usage-examples)
4. [Field Reference](#field-reference)
5. [Troubleshooting](#troubleshooting)
6. [API Reference](#api-reference)
7. [Advanced Configuration](#advanced-configuration)
8. [Best Practices](#best-practices)

---

## 🎯 Current Status Analysis

### ✅ What's Working Well

**Core Functionality (100% Complete)**
- ✅ **Custom Event Creation**: Full dashboard interface for creating and managing custom events
- ✅ **Dual Triggering**: Both manual (`PixelAnalytics.track()`) and automatic (CSS selector) triggering
- ✅ **Server-Side Tracking**: All events sent via Facebook CAPI, completely bypassing adblockers
- ✅ **Meta Event Mapping**: Automatic mapping to Facebook standard events (Purchase, AddToCart, ViewContent, etc.)
- ✅ **Theme Integration**: Seamless integration via Shopify theme app extensions
- ✅ **Real-Time Analytics**: Comprehensive event logging with user data, location, and session tracking
- ✅ **Database Storage**: Complete PostgreSQL schema for event configuration and tracking data
- ✅ **Error Handling**: Robust error handling with retry logic and graceful degradation

**Technical Implementation**
- ✅ **Database Schema**: Well-structured `CustomEvent` model with all necessary fields
- ✅ **API Endpoints**: RESTful API for custom events management (`/api/custom-events`)
- ✅ **Tracking Service**: Server-side tracking via `/apps/proxy/track` endpoint
- ✅ **JavaScript SDK**: Client-side `PixelAnalytics` object with full tracking capabilities
- ✅ **Facebook Integration**: Complete CAPI implementation with proper authentication
- ✅ **Theme Extension**: Liquid template extension for automatic script injection

### 🔧 Minor Improvements Needed

**Performance Optimizations**
- 🟡 **CSS Selector Efficiency**: Could optimize selector matching for large DOMs
- 🟡 **Event Debouncing**: Add debouncing for high-frequency events like scroll
- 🟡 **Caching**: Implement client-side caching for custom events configuration

**Enhanced Features**
- 🟡 **Event Validation**: Add client-side validation for event data format
- 🟡 **Bulk Operations**: Add bulk enable/disable functionality for multiple events
- 🟡 **Event Templates**: Pre-built templates for common use cases
- 🟡 **Advanced Filtering**: Filter events by date range, conversion rate, etc.

**Documentation & Testing**
- 🟡 **Comprehensive Testing**: More unit and integration tests
- 🟡 **Performance Benchmarks**: Add performance monitoring and benchmarks
- 🟡 **Migration Guide**: Guide for migrating from other tracking solutions

---

## 🚀 Complete Setup Guide

### Prerequisites

Before setting up custom events, ensure you have:

1. **Pixelify App Installed**: The Pixelify app must be installed and configured in your Shopify store
2. **Facebook Pixel Connected**: A Facebook Pixel must be connected and verified in the Pixels section
3. **Theme Access**: Access to your Shopify theme code (for manual events)
4. **App Embed Enabled**: The "Pixel Tracker" app embed must be enabled in your theme

### Step 1: Enable Theme App Embed

1. Go to your Shopify Admin → **Online Store** → **Themes**
2. Click **Customize** on your active theme
3. Click **App embeds** in the left sidebar
4. Find **Pixel Tracker** and toggle it **ON**
5. Configure the settings:
   - ✅ **Enable Tracking**: ON
   - ✅ **Enable Custom Events**: ON
   - **Enabled Custom Events**: Leave empty to enable all, or comma-separated list
6. Click **Save**

### Step 2: Create Custom Events

1. **Access Custom Events Dashboard**
   - Go to your Shopify Admin → **Apps** → **Pixelify**
   - Navigate to the **Custom Events** section

2. **Create a New Event**
   - Click **Create Event** button
   - Fill out the event configuration (see [Field Reference](#field-reference) for details)
   - Click **Create Event** to save

3. **Configure Theme Integration** (Optional)
   - In the theme customizer, you can specify which events to enable
   - Leave "Enabled Custom Events" empty to enable all active events
   - Or specify comma-separated event names: `wishlist_add, newsletter_signup`

### Step 3: Test Your Events

1. **Enable Debug Mode**
   - In theme customizer → App embeds → Pixel Tracker
   - Toggle **Debug Mode** ON

2. **Test in Browser**
   - Open your store in a new tab
   - Open Developer Console (F12)
   - Look for `[PixelTracker]` log messages
   - Trigger your custom events and verify they appear in console

3. **Verify Facebook Events**
   - Go to Facebook Events Manager
   - Use **Test Events** tool
   - Look for your custom events appearing as mapped Meta events

---

## 💡 Usage Examples

### Manual Event Triggering

#### Basic Event Tracking

```javascript
// Track a simple event when user clicks a button
document.addEventListener('DOMContentLoaded', function() {
  const wishlistButton = document.querySelector('.wishlist-btn');
  if (wishlistButton) {
    wishlistButton.addEventListener('click', function() {
      PixelAnalytics.track('wishlist_add');
    });
  }
});
```

#### Event with Product Data

```javascript
// Track add to wishlist with product information
function trackWishlistAdd(product) {
  PixelAnalytics.track('wishlist_add', {
    value: parseFloat(product.price),
    currency: Shopify.currency.active,
    content_name: product.title,
    content_ids: [product.id.toString()],
    content_type: 'product'
  });
}
```

#### Newsletter Signup Tracking

```javascript
// Track newsletter form submissions
function trackNewsletterSignup(email) {
  // Your existing newsletter logic here
  
  // Then track the event
  PixelAnalytics.track('newsletter_signup', {
    content_name: 'Newsletter Signup',
    content_category: 'engagement',
    value: 1, // Representing a lead
    currency: 'USD'
  });
}
```

#### Dynamic Content Tracking

```javascript
// Track when users view quick view modals
function openQuickView(productId, productName, productPrice) {
  // Your existing modal logic
  
  PixelAnalytics.track('product_quick_view', {
    content_ids: [productId],
    content_name: productName,
    content_type: 'product',
    value: parseFloat(productPrice),
    currency: Shopify.currency.active
  });
}
```

### Automatic Event Triggering

#### CSS Selector Configuration

In the Custom Events dashboard, configure automatic triggering:

**Example 1: Add to Cart Button**
- **Event Name**: `add_to_cart_auto`
- **Trigger Type**: Automatic
- **Event Type**: Click
- **CSS Selector**: `.add-to-cart-btn, [name="add"]`
- **Meta Event Mapping**: AddToCart
- **Event Data**:
```json
{
  "content_type": "product",
  "content_ids": ["{{ product.id }}"],
  "value": {{ product.price | money_without_currency }},
  "currency": "{{ shop.currency }}"
}
```

**Example 2: Form Submission**
- **Event Name**: `contact_form_submit`
- **Trigger Type**: Automatic
- **Event Type**: Submit
- **CSS Selector**: `#contact-form`
- **Meta Event Mapping**: Contact
- **Page Type**: Custom URL
- **Page URL**: `/pages/contact`

**Example 3: Scroll Engagement**
- **Event Name**: `content_engagement`
- **Trigger Type**: Automatic
- **Event Type**: Scroll
- **CSS Selector**: `.blog-content, .article-content`
- **Meta Event Mapping**: ViewContent

### Advanced Usage Patterns

#### Conditional Tracking

```javascript
// Only track for logged-in users
if (Shopify && Shopify.customer && Shopify.customer.id) {
  PixelAnalytics.track('premium_feature_access', {
    content_category: 'premium',
    user_type: 'logged_in'
  });
}

// Track only on specific pages
if (window.location.pathname.includes('/products/')) {
  PixelAnalytics.track('product_interaction', {
    page_type: 'product',
    interaction_type: 'view'
  });
}
```

#### Event Chaining

```javascript
// Track multi-step processes
function trackCheckoutStep(step, data) {
  PixelAnalytics.track('checkout_step_' + step, data);
  
  if (step === 'completed') {
    PixelAnalytics.track('checkout_completed', data);
  }
}

// Usage
trackCheckoutStep(1, { step_name: 'shipping' });
trackCheckoutStep(2, { step_name: 'payment' });
trackCheckoutStep('completed', { total_value: 99.99 });
```

#### Error Event Tracking

```javascript
// Track errors and issues
function trackError(errorType, errorMessage) {
  PixelAnalytics.track('error_occurred', {
    error_type: errorType,
    error_message: errorMessage,
    page_url: window.location.href,
    user_agent: navigator.userAgent
  });
}
```

---

## 📋 Field Reference

### Custom Event Configuration Fields

#### Required Fields

| Field | Type | Description | Example |
|-------|------|-------------|---------|
| **Display Name** | String | Human-readable name for the event | "Add to Wishlist" |
| **Event Name** | String | Unique identifier (lowercase with underscores) | `wishlist_add` |
| **Meta Event Mapping** | String | Facebook standard event to map to | "AddToCart" |

#### Optional Configuration Fields

| Field | Type | Description | Options/Example |
|-------|------|-------------|-----------------|
| **Description** | String | Optional description of what the event tracks | "Tracks when users add items to wishlist" |
| **Page Type** | String | Page restriction for reference | `all`, `index`, `product`, `collection`, `cart`, `checkout`, `search`, `custom` |
| **Page URL** | String | Specific URL for custom page type | `/pages/about-us` |
| **Trigger Type** | String | How the event should be triggered | `manual`, `auto` |
| **Event Type** | String | DOM event type for automatic triggering | `click`, `submit`, `change`, `focus`, `scroll`, `load` |
| **CSS Selector** | String | CSS selector for automatic triggering | `.add-to-cart-btn, #wishlist-button` |
| **Event Data** | JSON | Default data to send with event | `{"content_type": "product", "value": 99.99}` |

### Meta Event Mapping Options

| Meta Event | Description | Use Case | Required Parameters |
|------------|-------------|----------|-------------------|
| **Purchase** | Completed transaction | Order completion | `value`, `currency` |
| **AddToCart** | Item added to cart | Add to cart buttons | `content_ids`, `content_type` |
| **ViewContent** | Content viewed | Product views, article reads | `content_ids`, `content_type` |
| **InitiateCheckout** | Checkout started | Checkout button clicks | `value`, `currency` |
| **AddPaymentInfo** | Payment info added | Payment form completion | `value`, `currency` |
| **Lead** | Potential customer | Newsletter signups, contact forms | Optional parameters |
| **CompleteRegistration** | Account created | User registration | Optional parameters |
| **Contact** | Contact initiated | Contact form submissions | Optional parameters |
| **Search** | Search performed | Search form usage | `search_string` |
| **CustomEventName** | Custom event | Any unmapped interaction | None |

### Event Data Parameters

#### Standard E-commerce Parameters

| Parameter | Type | Description | Example |
|-----------|------|-------------|---------|
| `value` | Number | Monetary value | `99.99` |
| `currency` | String | Currency code | `"USD"` |
| `content_name` | String | Product/content name | `"Premium Widget"` |
| `content_ids` | Array | Product IDs | `["12345", "67890"]` |
| `content_type` | String | Content type | `"product"` |
| `contents` | Array | Detailed content items | `[{id: "123", quantity: 1}]` |
| `num_items` | Number | Number of items | `3` |
| `order_id` | String | Order identifier | `"ORDER-12345"` |
| `search_string` | String | Search query | `"wireless headphones"` |
| `status` | String | Status of the event | `"completed"` |

#### Custom Parameters

You can include any custom parameters in your event data:

```json
{
  "custom_parameter_1": "value",
  "custom_parameter_2": 123,
  "user_segment": "premium",
  "feature_used": "quick_view"
}
```

---

## 🔧 Troubleshooting

### Common Issues and Solutions

#### Events Not Firing

**Symptoms:**
- Custom events don't appear in browser console
- No events being sent to server
- Facebook events missing

**Solutions:**
1. **Check Event Configuration**
   - Verify event is enabled (Active status)
   - Ensure event name is correct and matches exactly
   - Check trigger type is set correctly

2. **Verify Theme Integration**
   - Confirm "Pixel Tracker" app embed is enabled
   - Check "Enable Custom Events" is toggled ON
   - Verify enabled custom events list (if specified)

3. **Browser Console Debug**
   ```javascript
   // Check if PixelAnalytics is loaded
   console.log(window.PixelAnalytics);
   
   // Manually trigger test event
   PixelAnalytics.track('test_event', { debug: true });
   
   // Check custom events configuration
   console.log(window.PIXEL_TRACKER_CUSTOM_EVENTS);
   ```

#### Facebook Events Missing

**Symptoms:**
- Events fire locally but don't appear in Facebook
- Facebook Events Manager shows no custom events
- Test events not working

**Solutions:**
1. **Check Facebook Pixel Connection**
   - Verify pixel ID is correct in Pixels section
   - Ensure access token is valid and not expired
   - Check pixel is verified and active

2. **Validate Meta Event Mapping**
   - Ensure custom event is mapped to a valid Meta event
   - Check if test event code is being used
   - Allow 15+ minutes for event processing

3. **Facebook Test Events Tool**
   - Use Facebook Events Manager → Test Events
   - Enable test mode in theme settings
   - Monitor real-time event delivery

#### Automatic Triggers Not Working

**Symptoms:**
- CSS selector events don't fire
- Events fire manually but not automatically
- Elements not being detected

**Solutions:**
1. **Validate CSS Selectors**
   ```javascript
   // Test selectors in browser console
   document.querySelectorAll('.add-to-cart-btn');
   document.querySelectorAll('#wishlist-button');
   
   // Check if elements exist
   console.log('Found elements:', document.querySelectorAll('.your-selector').length);
   ```

2. **Check Event Type**
   - Use `click` for button clicks
   - Use `submit` for form submissions (not click on submit button)
   - Use `change` for input changes
   - Use `scroll` for scroll events

3. **Dynamic Content Issues**
   - Events set up after DOM ready
   - MutationObserver handles dynamically added content
   - Check console for setup confirmation messages

#### Performance Issues

**Symptoms:**
- Slow page loading
- High memory usage
- Event tracking delays

**Solutions:**
1. **Optimize CSS Selectors**
   - Use specific selectors (`.product-card .add-to-cart` instead of `.add-to-cart`)
   - Avoid universal selectors (`*`)
   - Limit number of automatic events

2. **Reduce Event Frequency**
   - Add debouncing for scroll events
   - Avoid tracking every single click
   - Use conditional tracking

3. **Monitor Performance**
   ```javascript
   // Check tracking performance
   console.time('event-tracking');
   PixelAnalytics.track('performance_test');
   console.timeEnd('event-tracking');
   ```

### Debug Tools

#### Browser Developer Console

```javascript
// Enable detailed logging
localStorage.setItem('pixel_debug', 'true');

// Check configuration
console.log('Pixel Config:', window.PIXEL_TRACKER_CONFIG);
console.log('Custom Events:', window.PIXEL_TRACKER_CUSTOM_EVENTS);

// Test tracking
PixelAnalytics.track('debug_test', {
  timestamp: new Date().toISOString(),
  page_url: window.location.href,
  debug: true
});
```

#### Facebook Test Events

1. **Enable Test Mode**
   - In theme customizer → App embeds → Pixel Tracker
   - Toggle Debug Mode ON

2. **Use Facebook Test Events**
   - Go to Facebook Events Manager
   - Select your pixel → Test Events
   - Look for events with "TEST" prefix
   - Monitor real-time delivery

#### Server Logs

Check application logs for:
- API request errors
- Database connection issues
- Facebook CAPI response errors
- Authentication failures

---

## 🔌 API Reference

### REST API Endpoints

#### Get Custom Events

```http
GET /api/custom-events?appId={appId}&shop={shopDomain}
```

**Parameters:**
- `appId` (string, required): Application ID
- `shop` (string, required): Shop domain

**Response:**
```json
{
  "success": true,
  "events": [
    {
      "id": "uuid",
      "name": "wishlist_add",
      "displayName": "Add to Wishlist",
      "selector": ".wishlist-btn",
      "eventType": "click",
      "pageType": "product",
      "data": {
        "content_type": "product",
        "value": 99.99
      }
    }
  ],
  "appId": "app_uuid"
}
```

#### Track Event

```http
POST /apps/proxy/track?shop={shopDomain}
```

**Headers:**
```json
{
  "Content-Type": "application/json"
}
```

**Body:**
```json
{
  "appId": "your_app_id",
  "eventName": "wishlist_add",
  "url": "https://example.com/products/widget",
  "referrer": "https://example.com/",
  "sessionId": "session_uuid",
  "visitorId": "visitor_uuid",
  "customData": {
    "value": 99.99,
    "currency": "USD",
    "content_name": "Premium Widget",
    "content_ids": ["12345"],
    "content_type": "product"
  },
  "screenWidth": 1920,
  "screenHeight": 1080,
  "utmSource": "google",
  "utmMedium": "cpc"
}
```

**Response:**
```json
{
  "success": true,
  "eventId": "event_uuid"
}
```

### JavaScript SDK

#### PixelAnalytics Object

```javascript
window.PixelAnalytics = {
  // Track a custom event
  track: function(eventName, data) {
    // Implementation
  },
  
  // Track purchase
  trackPurchase: function(value, currency, orderId, products) {
    // Implementation  
  },
  
  // Track add to cart
  trackAddToCart: function(id, name, value, quantity) {
    // Implementation
  },
  
  // Track content view
  trackViewContent: function(id, name, value, category) {
    // Implementation
  }
};

// Aliases
window.px = PixelAnalytics.track;
```

#### Usage Examples

```javascript
// Basic tracking
PixelAnalytics.track('event_name');

// With data
PixelAnalytics.track('purchase', {
  value: 99.99,
  currency: 'USD',
  content_ids: ['12345'],
  content_type: 'product'
});

// Using aliases
px('wishlist_add', { product_id: '12345' });
```

### Database Schema

#### CustomEvent Model

```typescript
interface CustomEvent {
  id: string;                    // UUID
  appId: string;                 // Reference to App
  name: string;                  // Unique event name
  displayName: string;           // Human-readable name
  description?: string;          // Optional description
  metaEventName?: string;        // Facebook standard event mapping
  isActive: boolean;             // Enable/disable flag
  createdAt: DateTime;
  updatedAt: DateTime;
  
  // Configuration
  pageType: string;              // Page restriction
  pageUrl?: string;              // Custom URL pattern
  eventType: string;             // DOM event type
  selector?: string;             // CSS selector
  eventData?: string;            // JSON default data
  
  // Relations
  app: App;                      // Parent app
}
```

#### Event Model

```typescript
interface Event {
  id: string;                    // UUID
  appId: string;                 // Reference to App
  eventName: string;             // Event name
  url?: string;                  // Page URL
  referrer?: string;             // Referrer URL
  sessionId?: string;            // Session identifier
  fingerprint?: string;          // User fingerprint
  ipAddress?: string;            // User IP
  userAgent?: string;            // Browser user agent
  
  // Device information
  browser?: string;
  browserVersion?: string;
  os?: string;
  osVersion?: string;
  device?: string;
  deviceType?: string;
  screenWidth?: number;
  screenHeight?: number;
  
  // Location data
  country?: string;
  countryCode?: string;
  region?: string;
  city?: string;
  zip?: string;
  lat?: number;
  lon?: number;
  timezone?: string;
  isp?: string;
  
  // UTM parameters
  utmSource?: string;
  utmMedium?: string;
  utmCampaign?: string;
  utmTerm?: string;
  utmContent?: string;
  
  // E-commerce data
  value?: number;
  currency?: string;
  productId?: string;
  productName?: string;
  quantity?: number;
  
  // Engagement data
  pageTitle?: string;
  scrollDepth?: number;
  clickX?: number;
  clickY?: number;
  
  // Custom data
  customData?: Record<string, any>;
  
  createdAt: DateTime;
  app: App;                      // Parent app
}
```

### Facebook CAPI Integration

#### Event Mapping

Custom events are automatically mapped to Facebook standard events:

```typescript
const EVENT_NAME_MAP: Record<string, string> = {
  // Built-in events
  'pageview': 'PageView',
  'view_content': 'ViewContent',
  'add_to_cart': 'AddToCart',
  'initiate_checkout': 'InitiateCheckout',
  'add_payment_info': 'AddPaymentInfo',
  'purchase': 'Purchase',
  
  // Custom mappings
  'wishlist_add': 'AddToCart',
  'newsletter_signup': 'Lead',
  'contact_form_submit': 'Contact',
  'product_quick_view': 'ViewContent'
};
```

#### CAPI Event Structure

```typescript
interface MetaEventData {
  event_name: string;                    // Mapped event name
  event_time: number;                    // Unix timestamp
  event_id?: string;                     // Unique event ID
  event_source_url?: string;             // Source URL
  action_source: "website";              // Always "website" for web events
  
  user_data: {
    client_ip_address?: string;          // IP address
    client_user_agent?: string;          // User agent
    external_id?: string;                // Hashed fingerprint
    em?: string;                         // Hashed email
    ph?: string;                         // Hashed phone
    fn?: string;                         // Hashed first name
    ln?: string;                         // Hashed last name
    fbc?: string;                        // Facebook click ID
    fbp?: string;                        // Facebook browser ID
  };
  
  custom_data?: {
    value?: number;                      // Monetary value
    currency?: string;                   // Currency code
    content_name?: string;               // Content name
    content_ids?: string[];              // Content IDs
    content_type?: string;               // Content type
    contents?: Array<{                   // Detailed contents
      id: string;
      quantity: number;
      item_price?: number;
    }>;
    search_string?: string;              // Search query
    [key: string]: unknown;              // Additional custom data
  };
}
```

---

## ⚙️ Advanced Configuration

### Environment Variables

```env
# Database
DATABASE_URL=postgresql://user:password@host:port/database
DIRECT_URL=postgresql://user:password@host:port/database

# Shopify
SHOPIFY_API_KEY=your_shopify_api_key
SHOPIFY_API_SECRET=your_shopify_api_secret

# Facebook
FACEBOOK_APP_ID=your_facebook_app_id
FACEBOOK_APP_SECRET=your_facebook_app_secret

# Application
NODE_ENV=production
PORT=3000
```

### Theme Customization

#### App Embed Settings

```json
{
  "enable_tracking": true,
  "debug_mode": false,
  "track_pageviews": true,
  "track_clicks": true,
  "track_scroll": false,
  "track_forms": true,
  "track_ecommerce": true,
  "enable_custom_events": true,
  "enabled_custom_events": "wishlist_add,newsletter_signup"
}
```

#### Custom JavaScript Integration

```javascript
// Initialize custom tracking
document.addEventListener('DOMContentLoaded', function() {
  // Wait for PixelAnalytics to be available
  function waitForPixelAnalytics() {
    if (window.PixelAnalytics) {
      setupCustomTracking();
    } else {
      setTimeout(waitForPixelAnalytics, 100);
    }
  }
  waitForPixelAnalytics();
});

function setupCustomTracking() {
  // Your custom tracking logic
  PixelAnalytics.track('custom_initialized', {
    timestamp: new Date().toISOString(),
    theme: '{{ theme.name }}',
    template: '{{ template.name }}'
  });
}
```

### Performance Optimization

#### Event Debouncing

```javascript
// Debounce scroll events
let scrollTimeout;
function trackScrollDepth(depth) {
  clearTimeout(scrollTimeout);
  scrollTimeout = setTimeout(() => {
    PixelAnalytics.track('scroll_depth', { depth: depth });
  }, 500); // 500ms debounce
}
```

#### Conditional Loading

```javascript
// Load tracking only when needed
function loadTrackingWhenNeeded() {
  if (document.querySelector('.trackable-element')) {
    import('./tracking.js').then(module => {
      module.initTracking();
    });
  }
}
```

---

## 📈 Best Practices

### Event Naming Conventions

```javascript
// ✅ Good naming
'add_to_wishlist'
'newsletter_signup'
'product_quick_view'
'contact_form_submit'
'size_guide_view'

// ❌ Avoid these
'WishlistAdd'          // No camelCase
'add-to-wishlist'      // No dashes
'wishlist'             // Too vague
'track_this'           // Not descriptive
```

### Meta Event Mapping Guidelines

| Custom Event | Meta Event | When to Use |
|--------------|------------|-------------|
| `wishlist_add` | AddToCart | Intent to purchase |
| `newsletter_signup` | Lead | Lead generation |
| `contact_form_submit` | Contact | Customer inquiry |
| `product_quick_view` | ViewContent | Product engagement |
| `size_guide_view` | ViewContent | Product research |
| `demo_request` | Lead | Business lead |
| `download_guide` | Lead | Content download |

### Performance Best Practices

1. **Minimize Selectors**
   ```javascript
   // ✅ Efficient
   '.product-form .add-to-cart'
   
   // ❌ Inefficient
   'button, .btn, [type="submit"], input[type="button"]'
   ```

2. **Use Specific Selectors**
   ```javascript
   // ✅ Specific to avoid false positives
   '.product-detail .add-to-cart-btn'
   
   // ❌ Too generic
   '.btn'
   ```

3. **Conditional Tracking**
   ```javascript
   // ✅ Only track when relevant
   if (user.isLoggedIn && product.isPremium) {
     PixelAnalytics.track('premium_product_view');
   }
   ```

### Data Privacy & Compliance

1. **Respect User Privacy**
   ```javascript
   // ✅ Check consent before tracking
   if (userConsent.hasTrackingConsent()) {
     PixelAnalytics.track('event_name');
   }
   ```

2. **Hash Sensitive Data**
   ```javascript
   // ✅ Hash PII before sending
   PixelAnalytics.track('user_action', {
     user_hash: hashUserId(userId), // Hash instead of raw ID
     email_hash: hashEmail(userEmail) // Hash email
   });
   ```

3. **GDPR Compliance**
   - Only collect necessary data
   - Provide opt-out mechanisms
   - Clear privacy policy
   - Data retention policies

### Testing Strategy

1. **Local Testing**
   ```javascript
   // Enable debug mode
   localStorage.setItem('pixel_debug', 'true');
   
   // Test events
   PixelAnalytics.track('test_event', { test: true });
   ```

2. **Facebook Test Events**
   - Use test event codes
   - Monitor real-time delivery
   - Verify event parameters

3. **Browser Testing**
   - Test in multiple browsers
   - Verify mobile compatibility
   - Check console for errors

---

## 🎉 Conclusion

Pixelify's custom events system provides a powerful, flexible, and adblocker-proof way to track user interactions on your Shopify store. With both manual and automatic triggering options, comprehensive Facebook CAPI integration, and real-time analytics, you can gain deep insights into customer behavior while maintaining reliable tracking that bypasses browser restrictions.

### Key Benefits

- ✅ **Adblocker-Proof**: Server-side tracking via Facebook CAPI
- ✅ **Flexible Implementation**: Manual code or automatic CSS triggering
- ✅ **Meta Event Mapping**: Automatic mapping to Facebook standard events
- ✅ **Real-Time Analytics**: Comprehensive tracking and reporting
- ✅ **Easy Setup**: Intuitive dashboard interface
- ✅ **Developer-Friendly**: Full JavaScript SDK and API access

### Getting Started

1. Enable the "Pixel Tracker" app embed in your theme
2. Create custom events in the Pixelify dashboard
3. Implement manual tracking with `PixelAnalytics.track()`
4. Or configure automatic triggering with CSS selectors
5. Test using browser console and Facebook Test Events
6. Monitor performance and optimize as needed

For additional support, consult the [Troubleshooting](#troubleshooting) section or contact Pixelify support.

---

*Last updated: December 2024*  
*Version: 1.0.0*  
*Documentation maintained by the Pixelify team*
