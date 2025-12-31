# Pixelify Custom Event Tracker

A comprehensive guide to creating, managing, and implementing custom events in Pixelify - a Shopify app for server-side Facebook pixel tracking that bypasses adblockers.

## Overview

Pixelify's Custom Event Tracker allows you to track specific user interactions on your Shopify store that aren't covered by standard e-commerce events. All events are sent server-side via Facebook's Conversions API (CAPI), ensuring reliable tracking even with adblockers enabled.

### Key Features

- **Server-Side Tracking**: All events sent via Facebook CAPI, adblocker-proof
- **Flexible Triggering**: Manual code-based or automatic CSS selector triggering
- **Meta Event Mapping**: Map custom events to Facebook standard events
- **Real-Time Analytics**: Track events with detailed user and session data
- **Theme Integration**: Easy integration with Shopify themes via JavaScript API

## Architecture

### Database Schema

Custom events are stored in the `CustomEvent` model with the following key fields:

```prisma
model CustomEvent {
  id            String   @id @default(uuid())
  appId         String
  name          String   // Unique event identifier (e.g., "wishlist_add")
  displayName   String   // Human-readable name (e.g., "Add to Wishlist")
  description   String?  // Optional description
  metaEventName String?  // Facebook standard event mapping
  isActive      Boolean  @default(true)

  // Triggering configuration
  pageType      String   @default("all")  // Page restriction
  pageUrl       String?  // Custom URL restriction
  eventType     String   @default("click") // DOM event type
  selector      String?  // CSS selector for auto-triggering

  // Event data
  eventData     String?  // JSON data sent with event

  app           App      @relation(fields: [appId], references: [id])
  @@unique([appId, name])
}
```

### API Endpoints

#### Custom Events Management
- `GET /api/custom-events?appId={appId}&shop={shop}` - Retrieve active custom events
- `POST /app/custom-events` - Create/update/delete custom events (dashboard)

#### Event Tracking
- `POST /apps/proxy/track` - Track events (server-side to Facebook CAPI)

### Theme Integration

The `pixelify-tracker.liquid` theme extension injects tracking scripts and handles:

1. **Configuration Loading**: Fetches pixel ID and custom events from server
2. **Script Injection**: Loads `pixel.js` tracking script
3. **Facebook Pixel**: Initializes client-side Facebook pixel if configured
4. **Custom Event Handling**: Processes automatic and manual event triggers

## Creating Custom Events

### Dashboard Interface

1. **Access Custom Events**: Navigate to Pixelify app → Custom Events section
2. **Create Event**: Click "Create Event" button
3. **Configure Event**:
   - **Display Name**: Friendly name (e.g., "Add to Wishlist")
   - **Event Name**: Unique identifier (e.g., `wishlist_add`)
   - **Page Type**: Page restriction (all, product, cart, etc.)
   - **Trigger Type**: Manual or automatic
   - **Meta Event Mapping**: Facebook standard event
   - **Event Data**: Default JSON data

### Event Configuration Options

#### Trigger Types

**Manual Triggering** (`eventType: "custom"`):
- Events triggered via `PixelAnalytics.track()` in theme code
- Full control over when and how events fire
- Can include dynamic data

**Automatic Triggering** (`eventType: "click|submit|change|etc."`):
- Events fire automatically when CSS selectors match
- No code changes required in theme
- Configurable via dashboard

#### Page Restrictions

- `all`: All pages
- `index`: Home page only
- `product`: Product pages only
- `collection`: Collection pages only
- `cart`: Cart page only
- `checkout`: Checkout pages only
- `search`: Search results page
- `custom`: Specific URL pattern

## Implementation Examples

### Manual Event Triggering

#### Basic Event
```javascript
// In theme JavaScript
PixelAnalytics.track('wishlist_add');
```

#### Event with Custom Data
```javascript
PixelAnalytics.track('wishlist_add', {
  value: 99.99,
  currency: 'USD',
  content_name: 'Premium Widget',
  content_ids: ['12345'],
  content_type: 'product'
});
```

#### Dynamic Product Data
```javascript
function trackProductView(product) {
  PixelAnalytics.track('product_view', {
    content_name: product.title,
    content_ids: [product.id.toString()],
    content_type: 'product',
    value: parseFloat(product.price),
    currency: Shopify.currency.active
  });
}
```

### Automatic Event Triggering

#### CSS Selector Configuration
```json
{
  "name": "add_to_cart_auto",
  "selector": ".add-to-cart-btn, [name='add']",
  "eventType": "click",
  "pageType": "product",
  "eventData": "{\"content_type\": \"product\"}"
}
```

#### Form Submission Tracking
```json
{
  "name": "newsletter_signup",
  "selector": "#newsletter-form",
  "eventType": "submit",
  "pageType": "all",
  "metaEventName": "Lead"
}
```

## Server-Side Processing

### Event Flow

1. **Client Trigger**: Event fired via code or CSS selector
2. **Data Collection**: User data, session info, and custom data gathered
3. **Server Transmission**: Event sent to Pixelify servers via `/apps/proxy/track`
4. **Database Storage**: Event logged in PostgreSQL with full analytics data
5. **Facebook CAPI**: Event forwarded to Meta Conversions API
6. **Adblocker Bypass**: Server-side sending ensures delivery

### Meta Event Mapping

Custom events are mapped to Facebook standard events:

```javascript
const metaEventMap = {
  'pageview': 'PageView',
  'view_content': 'ViewContent',
  'add_to_cart': 'AddToCart',
  'purchase': 'Purchase',
  'lead': 'Lead',
  'contact': 'Contact',
  'search': 'Search'
};
```

### Data Processing

Events include comprehensive tracking data:

- **User Data**: IP, User-Agent, geolocation, device info
- **Session Data**: Session ID, fingerprint, UTM parameters
- **Event Data**: Custom data, timestamps, URLs
- **E-commerce Data**: Value, currency, product information

## Facebook Integration

### Conversions API (CAPI)

All events are sent server-side to Facebook's CAPI:

```typescript
interface MetaEventData {
  event_name: string;
  event_time: number;
  event_source_url?: string;
  action_source: 'website';
  user_data: {
    client_ip_address?: string;
    client_user_agent?: string;
    external_id?: string; // Hashed fingerprint
  };
  custom_data?: Record<string, unknown>;
}
```

### Authentication & Validation

- **Access Token**: Facebook app access token with ads_management scope
- **Pixel ID**: Facebook pixel/dataset ID
- **Token Validation**: Automatic expiry checking and renewal prompts
- **Test Events**: Debug mode with test event codes

## Analytics & Monitoring

### Event Logging

All events are stored with detailed analytics:

```sql
-- Event table structure
CREATE TABLE Event (
  id SERIAL PRIMARY KEY,
  appId VARCHAR NOT NULL,
  eventName VARCHAR NOT NULL,
  url TEXT,
  userAgent TEXT,
  ipAddress INET,
  country VARCHAR,
  city VARCHAR,
  deviceType VARCHAR,
  browser VARCHAR,
  sessionId VARCHAR,
  utmSource VARCHAR,
  value DECIMAL,
  currency VARCHAR,
  customData JSONB,
  createdAt TIMESTAMP DEFAULT NOW()
);
```

### Dashboard Analytics

- **Real-time Event Tracking**: Live event feed
- **Conversion Funnels**: Track user journeys
- **Geographic Data**: User location analytics
- **Device/Browser Stats**: Technical analytics
- **Revenue Tracking**: E-commerce performance

## Best Practices

### Event Naming
- Use lowercase with underscores: `wishlist_add`, `newsletter_signup`
- Keep names descriptive but concise
- Maintain consistency across similar events

### Meta Event Mapping
- Choose appropriate Facebook standard events
- Use `Purchase` for completed transactions
- Use `Lead` for signups and inquiries
- Use `ViewContent` for content engagement

### Performance Considerations
- Minimize custom data payload size
- Use efficient CSS selectors
- Implement proper error handling
- Consider loading performance impact

### Privacy & Compliance
- Respect user privacy settings
- Implement proper data retention policies
- Ensure GDPR/CCPA compliance
- Hash sensitive user data

## Troubleshooting

### Common Issues

#### Events Not Firing
- Verify event is active in dashboard
- Check browser console for JavaScript errors
- Ensure `PixelAnalytics` is loaded
- Confirm event name matches exactly

#### Facebook Events Missing
- Validate Facebook pixel connection
- Check access token validity
- Use Facebook's Test Events tool
- Allow 15+ minutes for event processing

#### Automatic Triggers Failing
- Verify CSS selectors are correct
- Test selectors in browser dev tools
- Check page type restrictions
- Ensure theme embed is enabled

### Debug Tools

#### Browser Console
```javascript
// Check if PixelAnalytics is loaded
console.log(window.PixelAnalytics);

// Manually trigger test event
PixelAnalytics.track('test_event', { debug: true });
```

#### Facebook Test Events
- Use Facebook Events Manager test events
- Include `test_event_code` in development
- Monitor event delivery in real-time

#### Server Logs
- Check application logs for API errors
- Monitor database connection issues
- Review webhook delivery status

## Advanced Usage

### Conditional Tracking
```javascript
// Track only for logged-in users
if (userLoggedIn) {
  PixelAnalytics.track('premium_content_view', {
    content_category: 'premium'
  });
}
```

### Event Chaining
```javascript
// Track multi-step process
PixelAnalytics.track('form_start');
PixelAnalytics.track('form_complete', { value: 50 });
```

### Dynamic Selectors
```javascript
// Track dynamically added elements
document.addEventListener('DOMContentLoaded', function() {
  // Re-bind tracking for AJAX-loaded content
  bindCustomEventTracking();
});
```

## API Reference

### PixelAnalytics.track()
```typescript
PixelAnalytics.track(eventName: string, data?: object): void
```

**Parameters:**
- `eventName` (string): Custom event name
- `data` (object, optional): Custom event data

**Example:**
```javascript
PixelAnalytics.track('purchase', {
  value: 99.99,
  currency: 'USD',
  content_ids: ['12345']
});
```

### Custom Event Object
```typescript
interface CustomEvent {
  id: string;
  name: string;
  displayName: string;
  selector?: string;
  eventType: string;
  pageType: string;
  pageUrl?: string;
  data: object;
}
```

## Deployment & Configuration

### Environment Variables
```env
# Facebook Integration
FACEBOOK_APP_ID=your_facebook_app_id
FACEBOOK_APP_SECRET=your_facebook_app_secret

# Database
DATABASE_URL=postgresql://user:pass@host:port/db

# Shopify
SHOPIFY_API_KEY=your_shopify_api_key
SHOPIFY_API_SECRET=your_shopify_api_secret
```

### Theme Settings
Enable the "Pixel Tracker" app embed in Shopify theme customizer with:
- Enable Tracking: ✅
- Enable Custom Events: ✅
- Enabled Custom Events: (leave empty for all, or comma-separated list)

## Support & Resources

### Documentation
- [Facebook Conversions API Docs](https://developers.facebook.com/docs/marketing-api/conversions-api/)
- [Shopify Theme Development](https://shopify.dev/docs/themes)
- [Pixelify Main README](../README.md)

### Getting Help
1. Check browser developer console
2. Use Facebook's Test Events tool
3. Review server application logs
4. Contact Pixelify support

---

**Note**: Custom events require proper Facebook pixel setup and valid access tokens. All events are sent server-side to ensure adblocker resistance and reliable tracking.
