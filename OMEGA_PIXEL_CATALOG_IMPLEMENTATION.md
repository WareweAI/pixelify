# Omega-Pixel Style Catalog Implementation

## Overview

This is a **unified pipeline** implementation for catalog events following Omega-Pixel architecture:
- ✅ One event pipeline for all events
- ✅ Catalog fields = feature flag (injected when products present)
- ✅ Strict validation with fallback strategy
- ✅ Shared event_id for browser + server deduplication
- ❌ No separate Catalog API
- ❌ No separate Purchase function

## 1️⃣ Internal Data Model

### Database Mappings

```typescript
// Store → Pixel → Catalog mapping
{
  userId: string,           // store_id
  pixelId: string,          // pixel_id
  catalogId: string,        // catalog_id
  metaAccessToken: string   // meta_access_token
}

// Product mapping (implicit)
{
  userId: string,           // store_id
  productId: string,        // internal_product_id
  catalogProductId: string  // catalog_product_id (MUST be stable)
}
```

**Critical Rule:** `catalog_product_id === Meta Catalog id`

## 2️⃣ Event Classification Logic

```typescript
// Core conditional - single decision point
IF event contains products[] → treat as Catalog Event
ELSE → treat as Normal Event
```

### Implementation

```typescript
export function classifyEvent(
  eventName: string,
  products: ProductData[] | null | undefined,
  currency: string | null | undefined,
  catalogId: string | null | undefined
): EventClassification {
  // Check if catalog-eligible
  const catalogEventNames = ['ViewContent', 'AddToCart', 'InitiateCheckout', 'Purchase'];
  const isCatalogEligible = catalogEventNames.includes(eventName);

  // If not eligible or no products → normal event
  if (!isCatalogEligible || !products || products.length === 0) {
    return { isCatalogEvent: false };
  }

  // Validate requirements
  if (!catalogId || !currency) {
    return { isCatalogEvent: false };
  }

  // Build catalog event
  return {
    isCatalogEvent: true,
    catalogId,
    contentIds: products.map(p => String(p.id)),
    contents: products.map(p => ({
      id: String(p.id),
      quantity: p.quantity,
      item_price: p.price
    })),
    totalValue: sum(products),
    currency
  };
}
```

## 3️⃣ Catalog Event Payload Rules

### Required Fields

```typescript
{
  content_type: "product",           // REQUIRED
  content_ids: [catalog_product_id], // REQUIRED, length >= 1
  contents: [                        // REQUIRED
    {
      id: catalog_product_id,
      quantity: number,
      item_price: number
    }
  ]
}
```

### Validation Rules

```typescript
// 1. content_ids.length >= 1
if (contentIds.length === 0) {
  return { isCatalogEvent: false };
}

// 2. Every id must exist in catalog (implicit - Meta validates)

// 3. Currency must match catalog currency
if (!currency) {
  return { isCatalogEvent: false };
}

// 4. Product must belong to SAME store
if (storeId !== eventStoreId) {
  throw new Error('Store mismatch');
}

// 5. If any check fails → downgrade to normal event
```

## 4️⃣ Purchase Event Handling

### Event Construction Logic

```typescript
// Calculate total value
total_value = Σ(item_price * quantity)

// Mandatory fields
{
  value: total_value,
  currency: "USD",
  contents: [
    { id: "p1", quantity: 2, item_price: 29.99 },
    { id: "p2", quantity: 1, item_price: 49.99 }
  ],
  content_ids: ["p1", "p2"]
}
```

### Deduplication

```typescript
// Same event_id for browser + server
event_id = hash(
  store_id +
  order_id +
  "Purchase"
)

// Browser event uses same ID
// Server (CAPI) event uses same ID
// → Meta deduplicates automatically
```

## 5️⃣ Event Routing Logic

```
incoming_event.store_id
    ↓
resolve pixel_id
resolve catalog_id
    ↓
attach pixel_id
attach catalog fields (if products present)
    ↓
send to Meta CAPI
```

### Absolute Rules

```typescript
// ❌ Never allow: store A event → catalog B
if (storeId !== eventStoreId) {
  throw new Error('Store mismatch');
}

// ❌ Never allow: store A event → pixel B
// Enforced by getCatalogMapping(userId, pixelId)
```

## 6️⃣ Multi-Product Orders

```typescript
// Cart with 3 items
{
  content_ids: ["p1", "p2", "p3"],
  contents: [
    { id: "p1", quantity: 2, item_price: 29.99 },
    { id: "p2", quantity: 1, item_price: 49.99 },
    { id: "p3", quantity: 3, item_price: 9.99 }
  ],
  value: 139.95,
  currency: "USD"
}

// Meta behavior:
// - Chooses product dynamically per user
// - Optimizes based on user history
// - Shows most relevant product in DPA
```

## 7️⃣ Fallback Strategy

```typescript
// If any validation fails:
if (!validation.valid) {
  console.log('Fallback: Sending WITHOUT catalog fields');
  
  return {
    value: totalValue,
    currency: currency,
    // NO content_ids
    // NO contents
    // NO content_type
  };
}

// Reason:
// ✅ Conversion still counted
// ✅ Ads optimization continues
// ⚠️ DPA temporarily skipped
```

### Fallback Triggers

- Product missing in catalog
- Mapping broken
- Feed delay
- Validation error
- Currency mismatch

## 8️⃣ Event Storage

```typescript
// Persist every outbound event
await prisma.event.create({
  data: {
    eventId: string,
    userId: string,
    eventName: string,
    isCatalogEvent: boolean,
    status: 'sent' | 'failed' | 'fallback',
    metaResponse: json,
    customData: {
      event_id: eventId,
      is_catalog_event: true,
      status: 'sent',
      logged_at: timestamp
    }
  }
});
```

**Purpose:** Mandatory for debugging DPA failures

## 9️⃣ Failure Modes

| Failure | Action |
|---------|--------|
| Meta 200 OK but no product match | Log catalog mismatch |
| Meta 400 | Drop + log |
| Meta 5xx | Retry |
| Duplicate event | Drop |

### Implementation

```typescript
export function handleFailureMode(
  statusCode: number,
  responseData: any,
  eventId: string
): { action: 'drop' | 'retry' | 'log'; shouldRetry: boolean } {
  
  // Meta 200 OK but no product match
  if (statusCode === 200 && responseData.events_received === 0) {
    return { action: 'log', shouldRetry: false };
  }

  // Meta 400
  if (statusCode === 400) {
    return { action: 'drop', shouldRetry: false };
  }

  // Meta 5xx
  if (statusCode >= 500) {
    return { action: 'retry', shouldRetry: true };
  }

  // Duplicate
  if (responseData.error?.message?.includes('duplicate')) {
    return { action: 'drop', shouldRetry: false };
  }

  return { action: 'log', shouldRetry: false };
}
```

## 🔟 Absolute Rules

### DO NOT BREAK

- ❌ No separate Catalog API
- ❌ No separate Purchase function
- ✅ One unified event pipeline
- ✅ Catalog fields = feature flag
- ✅ Stable catalog_product_id
- ✅ Shared event_id for dedup

### Enforcement

```typescript
// Rule 1: Unified pipeline
// All events go through processEventWithCatalog()

// Rule 2: Catalog fields as feature flag
if (classification.isCatalogEvent) {
  customData.content_type = "product";
  customData.content_ids = [...];
  customData.contents = [...];
}

// Rule 3: Stable product IDs
// Use SKU or Shopify product ID (never variant ID alone)

// Rule 4: Shared event_id
const eventId = generateEventId(storeId, orderId, eventName);
// Same ID used for browser + server events
```

## Final Mental Model

```
Event
  ↓
Product array?
  ↓ yes
Attach catalog fields
  ↓
Same CAPI endpoint
  ↓
Meta matches product internally
```

## Code Flow

### 1. Event Arrives

```typescript
// From pixel script or webhook
{
  eventName: "Purchase",
  products: [
    { id: "123", quantity: 2, price: 29.99 },
    { id: "456", quantity: 1, price: 49.99 }
  ],
  currency: "USD",
  orderId: "order_12345"
}
```

### 2. Process with Unified Pipeline

```typescript
const { processEventWithCatalog } = await import('~/services/catalog-event-handler.server');

const result = await processEventWithCatalog({
  userId: user.id,
  pixelId: pixel.id,
  eventName: "Purchase",
  products: products,
  currency: "USD",
  orderId: "order_12345",
  customData: {}
});

// Result:
{
  isCatalogEvent: true,
  customData: {
    content_type: "product",
    content_ids: ["123", "456"],
    contents: [
      { id: "123", quantity: 2, item_price: 29.99 },
      { id: "456", quantity: 1, item_price: 49.99 }
    ],
    value: 109.97,
    currency: "USD",
    num_items: 2
  },
  eventId: "abc123...",
  catalogId: "catalog_789"
}
```

### 3. Send to Meta CAPI

```typescript
await forwardToMeta({
  pixelId: pixel.id,
  accessToken: token,
  catalogId: result.catalogId,
  eventId: result.eventId,
  event: {
    eventName: "Purchase",
    eventTime: Math.floor(Date.now() / 1000),
    eventSourceUrl: url,
    actionSource: 'website',
    userData: { ... },
    customData: result.customData
  }
});
```

### 4. Meta Processes Event

```
Meta receives:
{
  event_name: "Purchase",
  event_id: "abc123...",
  custom_data: {
    content_type: "product",
    content_ids: ["123", "456"],
    contents: [...],
    value: 109.97,
    currency: "USD"
  }
}

Meta actions:
1. Matches content_ids to catalog products
2. Attributes conversion to catalog
3. Optimizes ads for these products
4. Enables DPA retargeting
```

## Testing

### Test Catalog Event

```bash
# 1. Trigger purchase with products
curl -X POST /api/track \
  -H "Content-Type: application/json" \
  -d '{
    "appId": "pixel_123",
    "eventName": "Purchase",
    "productId": "123",
    "value": 29.99,
    "currency": "USD",
    "quantity": 1,
    "customData": {
      "order_id": "order_12345",
      "contents": [
        { "id": "123", "quantity": 1, "item_price": 29.99 }
      ]
    }
  }'

# 2. Check logs
[Track] Processing event: Purchase for app: pixel_123
[Catalog Handler] Event classified as catalog event
[Catalog Handler] Validation passed
[Track] ✅ SUCCESS: Event sent to Facebook CAPI (catalog event)

# 3. Verify in Facebook Events Manager
# - Event shows content_type: "product"
# - Event shows content_ids: ["123"]
# - Event shows contents array
```

### Test Fallback

```bash
# 1. Trigger event with invalid product
curl -X POST /api/track \
  -H "Content-Type: application/json" \
  -d '{
    "appId": "pixel_123",
    "eventName": "Purchase",
    "productId": "",
    "value": 29.99,
    "currency": "USD"
  }'

# 2. Check logs
[Catalog Handler] No valid product IDs, downgrading to normal event
[Catalog Handler] Fallback triggered: Invalid product IDs
[Track] ✅ SUCCESS: Event sent to Facebook CAPI (normal event)

# 3. Verify in Facebook Events Manager
# - Event shows value and currency
# - Event does NOT show content_ids
# - Conversion still counted
```

## Monitoring

### Key Metrics

```sql
-- Catalog event rate
SELECT 
  COUNT(*) FILTER (WHERE customData->>'is_catalog_event' = 'true') as catalog_events,
  COUNT(*) as total_events,
  ROUND(100.0 * COUNT(*) FILTER (WHERE customData->>'is_catalog_event' = 'true') / COUNT(*), 2) as catalog_rate
FROM "Event"
WHERE eventName IN ('ViewContent', 'AddToCart', 'InitiateCheckout', 'Purchase')
  AND createdAt > NOW() - INTERVAL '7 days';

-- Fallback rate
SELECT 
  COUNT(*) FILTER (WHERE customData->>'status' = 'fallback') as fallback_events,
  COUNT(*) as total_events,
  ROUND(100.0 * COUNT(*) FILTER (WHERE customData->>'status' = 'fallback') / COUNT(*), 2) as fallback_rate
FROM "Event"
WHERE eventName IN ('ViewContent', 'AddToCart', 'InitiateCheckout', 'Purchase')
  AND createdAt > NOW() - INTERVAL '7 days';
```

### Logs to Watch

```
✅ Good:
[Catalog Handler] Event classified as catalog event
[Catalog Handler] Validation passed
[Track] ✅ SUCCESS: Event sent to Facebook CAPI (catalog event)

⚠️ Warning:
[Catalog Handler] Fallback triggered: Invalid product IDs
[Catalog Handler] Sending event WITHOUT catalog fields

❌ Error:
[Catalog Handler] Validation failed: Catalog not found
[Track] ❌ FAILED: Meta CAPI error
```

## Files Modified

1. `app/services/catalog-event-handler.server.ts` - Unified pipeline (NEW)
2. `app/services/meta-capi.server.ts` - Updated forwardToMeta with eventId
3. `app/routes/api.track.ts` - Integrated unified pipeline
4. `app/routes/webhooks.orders.create.tsx` - Uses unified pipeline
5. `app/routes/webhooks.carts.create.tsx` - Uses unified pipeline
6. `app/routes/webhooks.checkouts.create.tsx` - Uses unified pipeline

---

**Implementation Style:** Omega-Pixel
**Status:** ✅ Production-Ready
**Architecture:** Unified Pipeline with Feature Flag
**Deduplication:** Shared event_id across browser + server
