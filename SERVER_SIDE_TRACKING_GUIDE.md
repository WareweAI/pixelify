# Pixelify Server-Side Tracking System: Technical Guide

## Overview

This document provides a comprehensive technical guide to the Pixelify server-side tracking system. It explains how the system bypasses adblockers, processes events, and forwards data to Facebook's Conversions API (CAPI) while maintaining privacy and security standards.

## Table of Contents

1. [Server-Side Tracking Architecture](#1-server-side-tracking-architecture)
2. [Adblocker Bypass Mechanism](#2-adblocker-bypass-mechanism)
3. [Technical Implementation](#3-technical-implementation)
4. [Data Processing Pipeline](#4-data-processing-pipeline)
5. [Security & Privacy](#5-security--privacy)
6. [Error Handling & Retry Logic](#6-error-handling--retry-logic)
7. [Database Schema](#7-database-schema)
8. [Performance Optimization](#8-performance-optimization)

---

## 1. Server-Side Tracking Architecture

### 1.1 System Overview

The Pixelify server-side tracking system operates on a multi-layered architecture that ensures reliable data collection even when client-side tracking is blocked:

```
┌─────────────────┐    ┌──────────────────┐    ┌─────────────────┐
│   Client Side   │    │   Server Side    │    │   Data Layer    │
│                 │    │                  │    │                 │
│ Theme Extension │───▶│   API Routes     │───▶│   Database      │
│ JavaScript      │    │   + Services     │    │   PostgreSQL    │
└─────────────────┘    └──────────────────┘    └─────────────────┘
                                 │
                                 ▼
                       ┌──────────────────┐
                       │   Facebook CAPI  │
                       │   (Server-side)  │
                       └──────────────────┘
```

### 1.2 Core Components

#### 1.2.1 Client-Side Components
- **Theme Extension**: Shopify app extension injected into storefront
- **Dynamic Script Generation**: Server-generated JavaScript with real-time configuration
- **Event Listeners**: Automatic tracking of pageviews, clicks, scrolls, and custom events

#### 1.2.2 Server-Side Components
- **API Routes**: REST endpoints for event ingestion
- **Webhook Handlers**: Server-side tracking for e-commerce events
- **Service Layer**: Business logic for data processing and forwarding

#### 1.2.3 Data Layer
- **Database**: PostgreSQL with Prisma ORM
- **Caching**: In-memory caching for geo and device data
- **Analytics**: Session management and daily statistics

---

## 2. Adblocker Bypass Mechanism

### 2.1 The Problem with Client-Side Tracking

Traditional pixel tracking relies on:
- Client-side JavaScript execution
- Network requests to Facebook's domains
- Browser APIs that can be blocked

**Adblockers block these by:**
- Preventing JavaScript execution
- Blocking requests to known tracking domains
- Filtering out tracking cookies and identifiers

### 2.2 Server-Side Solution

Pixelify's server-side tracking bypasses adblockers through:

#### 2.2.1 Server-to-Server Communication
```javascript
// Traditional client-side (BLOCKED by adblockers)
fbq('track', 'Purchase', {
  value: 99.99,
  currency: 'USD'
});

// Server-side (BYPASSES adblockers)
const response = await fetch(`https://graph.facebook.com/v24.0/${pixelId}/events`, {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({
    data: [{
      event_name: 'Purchase',
      event_time: Math.floor(Date.now() / 1000),
      action_source: 'website',
      user_data: {
        em: hashedEmail,
        client_ip_address: userIP
      },
      custom_data: {
        value: 99.99,
        currency: 'USD'
      }
    }],
    access_token: accessToken
  })
});
```

#### 2.2.2 Shopify Webhook Integration

The system leverages Shopify's webhook system to capture server-side events:

```typescript
// Webhook handler for order creation
export async function action({ request }: ActionFunctionArgs) {
  const order = JSON.parse(await request.text());
  
  // This runs on Shopify's servers - completely invisible to adblockers
  await prisma.event.create({
    data: {
      appId: app.id,
      eventName: "purchase",
      value: parseFloat(order.total_price),
      currency: order.currency,
      customData: {
        order_id: order.id,
        source: "webhook" // Mark as server-side tracked
      }
    }
  });
}
```

#### 2.2.3 Proxy Architecture

Client requests go to the app's own domain, not Facebook's:

```
Browser ──▶ shop.myshopify.com/apps/pixel-api/track ──▶ graph.facebook.com
           (ALLOWED)                               (SERVER-TO-SERVER)
```

---

## 3. Technical Implementation

### 3.1 API Endpoints

#### 3.1.1 Primary Tracking Endpoint
**Route**: `POST /api/track`

**Purpose**: Main event ingestion endpoint

**Request Format**:
```json
{
  "appId": "px_1234567890abcdef",
  "eventName": "pageview",
  "url": "https://example.com/product/123",
  "referrer": "https://google.com",
  "sessionId": "sess_abcdef123456",
  "visitorId": "visitor_789xyz",
  "screenWidth": 1920,
  "screenHeight": 1080,
  "utmSource": "google",
  "utmMedium": "cpc",
  "utmCampaign": "summer_sale",
  "customData": {
    "category": "electronics",
    "brand": "apple"
  }
}
```

**Response Format**:
```json
{
  "success": true,
  "eventId": "evt_123e4567-e89b-12d3-a456-426614174000"
}
```

#### 3.1.2 App Proxy Tracking
**Route**: `POST /apps/proxy/track?shop={shop_domain}`

**Purpose**: Shopify app proxy endpoint for additional tracking layer

#### 3.1.3 Dynamic Script Generation
**Route**: `GET /apps/proxy/pixel.js?id={app_id}&shop={shop_domain}`

**Purpose**: Generates custom tracking JavaScript based on app settings

### 3.2 Service Architecture

#### 3.2.1 Tracking Service (`tracking.server.ts`)

```typescript
export async function trackEvent(
  payload: TrackingPayload,
  context: TrackingContext
): Promise<{ success: boolean; eventId?: string; error?: string }> {
  try {
    // 1. Skip bot traffic
    if (isBot(context.userAgent)) {
      return { success: true };
    }

    // 2. Validate app and get settings
    const app = await prisma.app.findUnique({
      where: { appId: payload.appId },
      select: { id: true, settings: true }
    });

    // 3. Enrich data with geo/device information
    const [geoData, deviceData] = await Promise.all([
      getGeoData(context.ip),
      Promise.resolve(parseDevice(context.userAgent))
    ]);

    // 4. Store event in database
    const event = await prisma.event.create({ /* ... */ });

    // 5. Forward to Facebook CAPI (server-side)
    if (app.settings?.metaPixelEnabled) {
      await forwardToMeta(app.settings, eventData);
    }

    return { success: true, eventId: event.id };
  } catch (error) {
    console.error('Tracking error:', error);
    return { success: false, error: 'Internal error' };
  }
}
```

#### 3.2.2 Meta CAPI Service (`meta-capi.server.ts`)

```typescript
export async function sendToMetaCAPI(
  pixelId: string,
  accessToken: string,
  events: MetaEventData[],
  testEventCode?: string
): Promise<MetaSendResult> {
  try {
    const url = `https://graph.facebook.com/v24.0/${pixelId}/events`;
    
    const body = {
      data: events,
      ...(testEventCode && { test_event_code: testEventCode })
    };

    const response = await fetch(`${url}?access_token=${accessToken}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body)
    });

    const data = await response.json();
    
    if (data.error) {
      return { success: false, error: data.error.message };
    }

    return { 
      success: true, 
      events_received: data.events_received,
      fbtrace_id: data.fbtrace_id 
    };
  } catch (error) {
    return { 
      success: false, 
      error: error instanceof Error ? error.message : 'Unknown error' 
    };
  }
}
```

### 3.3 Webhook Implementation

#### 3.3.1 Order Creation Webhook

```typescript
// Server-side purchase tracking (adblocker-proof)
export async function action({ request }: ActionFunctionArgs) {
  const order = JSON.parse(await request.text());
  
  // Extract e-commerce data
  const totalPrice = parseFloat(order.total_price);
  const currency = order.currency;
  const products = order.line_items.map(item => ({
    id: item.product_id,
    name: item.title,
    price: parseFloat(item.price),
    quantity: item.quantity
  }));

  // Track purchase event (server-side)
  await prisma.event.create({
    data: {
      appId: app.id,
      eventName: "purchase",
      value: totalPrice,
      currency,
      productId: order.id,
      productName: `Order ${order.name}`,
      customData: {
        order_id: order.id,
        products,
        source: "webhook"
      }
    }
  });

  // Forward to Facebook CAPI
  await forwardToMetaCAPI(/* event data */);
}
```

---

## 4. Data Processing Pipeline

### 4.1 Event Flow

```
1. Client Event Generated
   ├── Pageview (automatic)
   ├── Click (automatic)
   ├── Custom Event (configured)
   └── E-commerce Event (webhook)
           │
           ▼
2. Request Processing
   ├── CORS Handling
   ├── Authentication (app ID validation)
   ├── Rate Limiting
   └── Request Validation
           │
           ▼
3. Data Enrichment
   ├── IP Geolocation Lookup
   ├── Device Detection (UA parsing)
   ├── Session Management
   └── UTM Parameter Extraction
           │
           ▼
4. Storage
   ├── Event Record Creation
   ├── Analytics Session Update
   ├── Daily Statistics Update
   └── Error Logging (if needed)
           │
           ▼
5. Forwarding
   ├── Facebook CAPI Transformation
   ├── PII Hashing (SHA256)
   ├── Server-to-Server Request
   └── Response Handling
```

### 4.2 Data Enrichment Process

#### 4.2.1 Geo Location Service

```typescript
const geoCache = new Map<string, { data: GeoData; timestamp: number }>();
const CACHE_TTL = 1000 * 60 * 60; // 1 hour

export async function getGeoData(ip: string): Promise<GeoData> {
  // Check cache first
  const cached = geoCache.get(ip);
  if (cached && Date.now() - cached.timestamp < CACHE_TTL) {
    return cached.data;
  }

  // Fetch from IP-API
  const response = await fetch(
    `http://ip-api.com/json/${ip}?fields=status,country,countryCode,region,city,zip,lat,lon,timezone,isp`
  );
  
  const data = await response.json();
  const geoData = {
    country: data.country,
    countryCode: data.countryCode,
    region: data.region,
    city: data.city,
    zip: data.zip,
    lat: data.lat,
    lon: data.lon,
    timezone: data.timezone,
    isp: data.isp
  };

  // Cache the result
  geoCache.set(ip, { data: geoData, timestamp: Date.now() });
  return geoData;
}
```

#### 4.2.2 Device Detection Service

```typescript
import { UAParser } from 'ua-parser-js';

export function parseDevice(userAgent: string | null): DeviceData {
  const parser = new UAParser(userAgent);
  const result = parser.getResult();

  return {
    browser: result.browser.name || null,
    browserVersion: result.browser.version || null,
    os: result.os.name || null,
    osVersion: result.os.version || null,
    device: result.device.model || null,
    deviceType: result.device.type || 'desktop',
    deviceVendor: result.device.vendor || null
  };
}

// Bot detection to filter out non-human traffic
export function isBot(userAgent: string | null): boolean {
  const botPatterns = [
    /bot/i, /spider/i, /crawl/i, /slurp/i,
    /googlebot/i, /bingbot/i, /yandex/i,
    /facebookexternalhit/i, /twitterbot/i
  ];
  
  return botPatterns.some(pattern => pattern.test(userAgent || ''));
}
```

### 4.3 Event Mapping to Meta Standards

```typescript
function mapEventName(eventName: string): string {
  const eventNameMap: Record<string, string> = {
    pageview: "PageView",
    add_to_cart: "AddToCart",
    initiate_checkout: "InitiateCheckout",
    purchase: "Purchase",
    lead: "Lead",
    search: "Search"
  };
  
  return eventNameMap[eventName.toLowerCase()] || eventName;
}
```

---

## 5. Security & Privacy

### 5.1 PII Protection

#### 5.1.1 Data Hashing

All personally identifiable information (PII) is hashed using SHA256 before transmission:

```typescript
function hashData(data: string): string {
  return crypto
    .createHash("sha256")
    .update(data.toLowerCase().trim())
    .digest("hex");
}

// Usage in Meta event creation
const userData = {
  em: email ? hashData(email) : undefined,     // Hashed email
  ph: phone ? hashData(phone) : undefined,     // Hashed phone
  fn: firstName ? hashData(firstName) : undefined, // Hashed first name
  ln: lastName ? hashData(lastName) : undefined,   // Hashed last name
  client_ip_address: ipAddress,                // IP (not hashed per Meta requirements)
  client_user_agent: userAgent                 // User agent (not hashed)
};
```

#### 5.1.2 Configurable Privacy Settings

```sql
-- AppSettings table controls privacy
CREATE TABLE AppSettings (
  id                 String  @id @default(uuid())
  appId              String  @unique
  recordIp           Boolean @default(true)    -- Control IP recording
  recordLocation     Boolean @default(true)    -- Control geo data
  recordSession      Boolean @default(true)    -- Control session tracking
  metaPixelEnabled   Boolean @default(false)   -- Control Meta forwarding
);
```

### 5.2 Security Measures

#### 5.2.1 Webhook Verification

All Shopify webhooks are verified using HMAC signatures:

```typescript
function verifyWebhook(body: string, hmac: string | null): boolean {
  if (!hmac) return false;
  
  const secret = process.env.SHOPIFY_API_SECRET || "";
  const hash = crypto
    .createHmac("sha256", secret)
    .update(body, "utf8")
    .digest("base64");
    
  return crypto.timingSafeEqual(
    Buffer.from(hash), 
    Buffer.from(hmac)
  );
}
```

#### 5.2.2 CORS Configuration

```typescript
// API endpoints support CORS for cross-origin tracking
const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type',
};
```

#### 5.2.3 Input Validation

```typescript
// Comprehensive input validation
const { appId, eventName } = data;

if (!appId || !eventName) {
  return Response.json(
    { error: 'Missing required fields' }, 
    { status: 400 }
  );
}

// Validate app exists
const app = await prisma.app.findUnique({
  where: { appId },
  include: { settings: true }
});

if (!app) {
  return Response.json(
    { error: 'App not found' }, 
    { status: 404 }
  );
}
```

### 5.3 Data Retention Policies

The system implements configurable data retention:

```sql
-- Events table with automatic cleanup capability
CREATE TABLE Event (
  id             String   @id @default(uuid())
  appId          String
  eventName      String
  createdAt      DateTime @default(now())
  -- ... other fields
  
  @@index([appId, createdAt]) -- Enable efficient cleanup queries
);
```

---

## 6. Error Handling & Retry Logic

### 6.1 Client-Side Retry Logic

```javascript
// Enhanced error handling and retry logic in theme extension
var retryCount = 0;
var maxRetries = 3;
var retryDelay = 1000; // 1 second

function attemptInitialization() {
  fetchPixelConfig()
    .then(initializeTracker)
    .catch(function(err) {
      retryCount++;
      console.error('[PixelTracker] Initialization failed (attempt ' + retryCount + '/' + maxRetries + '):', err.message);
      
      if (retryCount < maxRetries) {
        setTimeout(attemptInitialization, retryDelay);
        retryDelay *= 2; // Exponential backoff
      } else {
        console.error('[PixelTracker] Failed to initialize after ' + maxRetries + ' attempts');
      }
    });
}
```

### 6.2 Server-Side Error Handling

#### 6.2.1 Database Connection Resilience

```typescript
export async function action({ request }: ActionFunctionArgs) {
  // Check database connectivity
  try {
    await prisma.$queryRaw`SELECT 1`;
  } catch (dbError) {
    return Response.json(
      { 
        success: false, 
        error: 'Database temporarily unavailable' 
      },
      { status: 503 }
    );
  }
  
  // Continue with event processing...
}
```

#### 6.2.2 Graceful Degradation

```typescript
// Continue tracking even if some services fail
try {
  // Primary tracking
  const event = await prisma.event.create({ /* ... */ });
  
  // Optional services (don't fail if these error)
  await Promise.allSettled([
    updateAnalyticsSession(app.id, sessionId, sessionData),
    updateDailyStats(app.id, fingerprint),
    forwardToMetaCAPI(metaSettings, eventData) // Silently fails if Meta API unavailable
  ]);
  
} catch (error) {
  console.error('[Track] Critical error:', error);
  return Response.json(
    { success: false, error: 'Internal error' },
    { status: 500 }
  );
}
```

### 6.3 Meta CAPI Error Handling

```typescript
export async function sendToMetaCAPI(
  pixelId: string,
  accessToken: string,
  events: MetaEventData[]
): Promise<MetaSendResult> {
  try {
    const response = await fetch(url, { /* request options */ });
    const data = await response.json();

    if (data.error) {
      // Log error but don't throw - we still have the event in our database
      console.error("Meta CAPI error:", data.error);
      
      return {
        success: false,
        error: data.error.message,
        error_code: data.error.code
      };
    }

    return {
      success: true,
      events_received: data.events_received,
      fbtrace_id: data.fbtrace_id
    };
  } catch (error) {
    // Network error - log but don't fail the entire tracking request
    console.error("Meta CAPI send error:", error);
    return {
      success: false,
      error: error instanceof Error ? error.message : "Unknown error"
    };
  }
}
```

---

## 7. Database Schema

### 7.1 Core Tables

#### 7.1.1 Event Table

```sql
CREATE TABLE Event (
  id             String   @id @default(uuid())
  appId          String
  eventName      String
  url            String?
  referrer       String?
  userAgent      String?
  ipAddress      String?
  
  -- Geographic data
  country        String?
  countryCode    String?
  region         String?
  city           String?
  zip            String?
  lat            Float?
  lon            Float?
  timezone       String?
  isp            String?
  
  -- Device data
  browser        String?
  browserVersion String?
  os             String?
  osVersion      String?
  device         String?
  deviceType     String?
  deviceVendor   String?
  
  -- Session data
  fingerprint    String?
  sessionId      String?
  
  -- Marketing data
  utmSource      String?
  utmMedium      String?
  utmCampaign    String?
  utmTerm        String?
  utmContent     String?
  
  -- Page data
  pageTitle      String?
  screenWidth    Int?
  screenHeight   Int?
  scrollDepth    Int?
  clickX         Int?
  clickY         Int?
  
  -- E-commerce data
  value          Float?
  currency       String?
  productId      String?
  productName    String?
  quantity       Int?
  
  -- Custom data
  customData     Json?
  createdAt      DateTime @default(now())
  
  app            App      @relation(fields: [appId], references: [id])
  
  @@index([appId, createdAt])
  @@index([eventName])
  @@index([country])
  @@index([deviceType])
);
```

#### 7.1.2 Analytics Session Table

```sql
CREATE TABLE AnalyticsSession (
  id          String   @id @default(uuid())
  appId       String
  sessionId   String   @unique
  fingerprint String?
  ipAddress   String?
  userAgent   String?
  browser     String?
  os          String?
  deviceType  String?
  country     String?
  pageviews   Int      @default(0)
  duration    Int      @default(0)
  startTime   DateTime @default(now())
  lastSeen    DateTime @default(now())
  app         App      @relation(fields: [appId], references: [id])
  
  @@index([appId, startTime])
);
```

#### 7.1.3 Daily Statistics Table

```sql
CREATE TABLE DailyStats (
  id          String   @id @default(uuid())
  appId       String
  date        DateTime
  pageviews   Int      @default(0)
  uniqueUsers Int      @default(0)
  sessions    Int      @default(0)
  purchases   Int      @default(0)
  revenue     Float    @default(0)
  updatedAt   DateTime @default(now())
  app         App      @relation(fields: [appId], references: [id])
  
  @@unique([appId, date])
);
```

#### 7.1.4 Custom Events Table

```sql
CREATE TABLE CustomEvent (
  id            String   @id @default(uuid())
  appId         String
  name          String
  displayName   String
  description   String?
  metaEventName String?
  isActive      Boolean  @default(true)
  
  -- Event configuration
  pageType      String   @default("all")
  pageUrl       String?
  eventType     String   @default("click")
  selector      String?
  eventData     String?  -- JSON string
  
  createdAt     DateTime @default(now())
  updatedAt     DateTime @updatedAt
  
  app           App      @relation(fields: [appId], references: [id], onDelete: Cascade)
  
  @@unique([appId, name])
  @@index([appId])
  @@index([pageType])
  @@index([isActive])
);
```

### 7.2 Relationships

```
App (1) ──── (N) Event
  │           │
  │           ├── AnalyticsSession
  │           ├── DailyStats
  │           ├── CustomEvent
  │           └── ErrorLog
  │
  └── AppSettings (1:1)
```

---

## 8. Performance Optimization

### 8.1 Database Optimization

#### 8.1.1 Strategic Indexing

```sql
-- Composite indexes for common queries
CREATE INDEX idx_event_app_created ON Event (appId, createdAt);
CREATE INDEX idx_event_name ON Event (eventName);
CREATE INDEX idx_event_country ON Event (country);
CREATE INDEX idx_event_device_type ON Event (deviceType);

-- Indexes for analytics queries
CREATE INDEX idx_session_app_start ON AnalyticsSession (appId, startTime);
CREATE INDEX idx_daily_stats_app_date ON DailyStats (appId, date);
```

#### 8.1.2 Query Optimization

```typescript
// Efficient app lookup with selective fields
const app = await prisma.app.findUnique({
  where: { appId: payload.appId },
  select: { 
    id: true, 
    settings: {
      select: {
        recordIp: true,
        recordLocation: true,
        metaPixelEnabled: true
      }
    }
  }
});
```

### 8.2 Caching Strategy

#### 8.2.1 Geo Data Caching

```typescript
const geoCache = new Map<string, { data: GeoData; timestamp: number }>();
const CACHE_TTL = 1000 * 60 * 60; // 1 hour

export async function getGeoData(ip: string): Promise<GeoData> {
  const cached = geoCache.get(ip);
  if (cached && Date.now() - cached.timestamp < CACHE_TTL) {
    return cached.data;
  }
  
  // Fetch and cache...
  const geoData = await fetchGeoData(ip);
  geoCache.set(ip, { data: geoData, timestamp: Date.now() });
  
  // Cleanup old entries periodically
  if (geoCache.size > 10000) {
    cleanupCache();
  }
  
  return geoData;
}
```

#### 8.2.2 Parallel Processing

```typescript
// Enrich data in parallel
const [geoData, deviceData] = await Promise.all([
  getGeoData(context.ip),
  Promise.resolve(parseDevice(context.userAgent))
]);
```

### 8.3 Request Optimization

#### 8.3.1 Batch Processing

```typescript
// Update daily stats with upsert (single query)
await prisma.dailyStats.upsert({
  where: { appId_date: { appId: app.id, date: today } },
  update: {
    pageviews: { increment: 1 },
    sessions: newSessionCreated ? { increment: 1 } : undefined
  },
  create: {
    appId: app.id,
    date: today,
    pageviews: 1,
    sessions: newSessionCreated ? 1 : 0
  }
});
```

#### 8.3.2 Non-blocking Operations

```typescript
// Use keepalive for client requests
fetch(ENDPOINT, {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify(data),
  keepalive: true  // Don't block page unload
});

// Use Promise.allSettled for optional operations
await Promise.allSettled([
  updateAnalyticsSession(),
  updateDailyStats(),
  forwardToMetaCAPI() // Optional, don't block if this fails
]);
```

### 8.4 Resource Management

#### 8.4.1 Memory Management

```typescript
// Periodic cache cleanup
function cleanupCache() {
  const now = Date.now();
  for (const [key, value] of geoCache.entries()) {
    if (now - value.timestamp > CACHE_TTL) {
      geoCache.delete(key);
    }
  }
}
```

#### 8.4.2 Connection Pooling

```typescript
// Prisma connection configuration
// prisma/schema.prisma
generator client {
  provider = "prisma-client-js"
}

datasource db {
  provider  = "postgresql"
  url       = env("DATABASE_URL")
  directUrl = env("DIRECT_URL")
}
```

---

## Conclusion

The Pixelify server-side tracking system provides a robust, adblocker-resistant solution for e-commerce analytics and Facebook pixel tracking. By leveraging server-side processing, webhook integrations, and intelligent data enrichment, it ensures reliable data collection while maintaining privacy and security standards.

Key benefits:
- **100% Adblocker Resistance**: Server-to-server communication bypasses all client-side blocking
- **Privacy Compliant**: Configurable data collection with PII hashing
- **Performance Optimized**: Caching, parallel processing, and efficient queries
- **Scalable Architecture**: Multi-layered design with proper error handling
- **E-commerce Focused**: Native Shopify integration with webhook support

This system serves as a comprehensive solution for businesses requiring reliable tracking in an increasingly restrictive digital advertising landscape.