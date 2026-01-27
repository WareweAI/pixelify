# ReadableStream Cache Fix

## Error
```
TypeError [ERR_INVALID_STATE]: Invalid state: ReadableStream is locked
```

## Root Cause

The error occurred because `withCache` was caching and returning `Response` objects directly. When a Response object's body is read once, its ReadableStream becomes "locked" and cannot be read again.

### The Problem Flow:
```typescript
// ❌ WRONG - Caching Response objects
return withCache(key, 300, async () => {
  return Response.json({ data: "..." }); // Response object cached
});

// On cache hit:
// 1. First request reads the Response body → Stream locked
// 2. Second request tries to read same Response → ERROR: Stream is locked
```

## Solution

Cache the **data** instead of the **Response object**, then wrap it in a fresh Response on return.

### Fixed Pattern:
```typescript
// ✅ CORRECT - Cache data, return fresh Response
const cachedData = await withCache(key, 300, async () => {
  return { data: "..." }; // Plain object cached
});

return Response.json(cachedData); // Fresh Response created each time
```

## Files Fixed

### 1. `app/routes/api.pixel.ts`
**Before:**
```typescript
return withCache(cacheKey, 300, async () => {
  // ... fetch data ...
  return Response.json({ pixels, ... }); // ❌ Response cached
});
```

**After:**
```typescript
const cachedData = await withCache(cacheKey, 300, async () => {
  // ... fetch data ...
  return { pixels, ... }; // ✅ Data cached
});

return Response.json(cachedData); // ✅ Fresh Response
```

### 2. `app/routes/api.analytics.ts`
**Before:**
```typescript
return withCache(cacheKey, 300, async () => {
  return Response.json({ apps, totalEvents, ... }); // ❌
});
```

**After:**
```typescript
const cachedData = await withCache(cacheKey, 300, async () => {
  return { apps, totalEvents, ... }; // ✅
});

return Response.json(cachedData); // ✅
```

### 3. `app/routes/api.visitors.ts`
**Before:**
```typescript
return withCache(cacheKey, 300, async () => {
  return Response.json({ sessions, ... }); // ❌
});
```

**After:**
```typescript
const cachedData = await withCache(cacheKey, 300, async () => {
  return { sessions, ... }; // ✅
});

return Response.json(cachedData); // ✅
```

### 4. `app/routes/api.dashboard.ts`
**Status:** ✅ Already correct!
```typescript
return withCache(cacheKey, 300, async () => {
  return { apps, stats, ... }; // ✅ Already returning data
});
```

## Why This Works

### Response Object Lifecycle
```
┌─────────────────────────────────────────────────────────┐
│                  Response Object                         │
├─────────────────────────────────────────────────────────┤
│  Headers: { "Content-Type": "application/json" }        │
│  Body: ReadableStream (can only be read ONCE)           │
│  Status: 200                                             │
└─────────────────────────────────────────────────────────┘

First Read:  response.json() → Stream consumed ✓
Second Read: response.json() → ERROR: Stream locked ✗
```

### Plain Object Caching
```
┌─────────────────────────────────────────────────────────┐
│                  Cached Data Object                      │
├─────────────────────────────────────────────────────────┤
│  { pixels: [...], cached: false, ... }                  │
│  ↓                                                       │
│  Can be read unlimited times ✓                          │
│  ↓                                                       │
│  Response.json(data) creates fresh Response each time   │
└─────────────────────────────────────────────────────────┘

Request 1: Response.json(cachedData) → New Response ✓
Request 2: Response.json(cachedData) → New Response ✓
Request N: Response.json(cachedData) → New Response ✓
```

## Cache Flow (Fixed)

```
┌──────────────────────────────────────────────────────────┐
│                    Request Arrives                        │
└────────────────────┬─────────────────────────────────────┘
                     │
                     ▼
            ┌────────────────┐
            │  Check Cache   │
            └────────┬───────┘
                     │
         ┌───────────┴───────────┐
         │                       │
         ▼                       ▼
    ┌────────┐            ┌──────────┐
    │  HIT   │            │   MISS   │
    └────┬───┘            └─────┬────┘
         │                      │
         │                      ▼
         │              ┌───────────────┐
         │              │  Fetch Data   │
         │              │  from DB/API  │
         │              └───────┬───────┘
         │                      │
         │                      ▼
         │              ┌───────────────┐
         │              │  Store Data   │
         │              │  in Cache     │
         │              └───────┬───────┘
         │                      │
         └──────────┬───────────┘
                    │
                    ▼
         ┌──────────────────────┐
         │  Get Cached Data     │
         │  (Plain Object)      │
         └──────────┬───────────┘
                    │
                    ▼
         ┌──────────────────────┐
         │  Response.json(data) │
         │  (Fresh Response)    │
         └──────────┬───────────┘
                    │
                    ▼
         ┌──────────────────────┐
         │   Return to Client   │
         └──────────────────────┘
```

## Testing

### Test Cache Hit (No Error)
```bash
# First request - cache miss
curl http://localhost:3000/api/pixel
# Response time: ~500ms
# Logs: [Cache] MISS: pixels:shop

# Second request - cache hit
curl http://localhost:3000/api/pixel
# Response time: ~50ms
# Logs: [Cache] HIT: pixels:shop
# ✅ No ReadableStream error!

# Third request - still works
curl http://localhost:3000/api/pixel
# Response time: ~50ms
# ✅ Still no error!
```

### Verify All Endpoints
```bash
# Test pixels
curl http://localhost:3000/api/pixel

# Test dashboard
curl http://localhost:3000/api/dashboard

# Test analytics
curl http://localhost:3000/api/analytics

# Test visitors
curl http://localhost:3000/api/visitors

# All should work without ReadableStream errors ✅
```

## Best Practices

### ✅ DO: Cache Plain Data
```typescript
const cachedData = await withCache(key, ttl, async () => {
  return { 
    users: [...],
    count: 10,
    timestamp: new Date()
  };
});

return Response.json(cachedData);
```

### ❌ DON'T: Cache Response Objects
```typescript
// This will cause ReadableStream errors!
return withCache(key, ttl, async () => {
  return Response.json({ data: "..." });
});
```

### ✅ DO: Cache Serializable Data
```typescript
// Good - all serializable
return {
  string: "text",
  number: 123,
  boolean: true,
  array: [1, 2, 3],
  object: { key: "value" },
  date: new Date().toISOString() // Convert to string
};
```

### ❌ DON'T: Cache Non-Serializable Objects
```typescript
// Bad - these can't be cached properly
return {
  date: new Date(), // ❌ Use .toISOString()
  function: () => {}, // ❌ Functions can't be cached
  promise: Promise.resolve(), // ❌ Promises can't be cached
  stream: new ReadableStream() // ❌ Streams can't be cached
};
```

## Summary

✅ **Fixed ReadableStream error** by caching data instead of Response objects
✅ **All API routes updated** to use correct pattern
✅ **Cache still works** with 5-minute TTL
✅ **No performance impact** - same speed, no errors
✅ **Unlimited cache hits** - data can be read infinite times

**Key Takeaway:** Always cache the **data**, not the **Response**. Create fresh Response objects on each request.
