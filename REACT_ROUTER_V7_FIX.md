# React Router v7 ESM/CommonJS Fix

## Problem

The app was crashing with this error:
```
SyntaxError: Named export 'json' not found. The requested module 'react-router' is a CommonJS module, which may not support all module.exports as named exports.
```

## Root Cause

React Router v7 changed how the `json` helper is exported. It's no longer available as a named export in ESM modules.

## Solution

Replace all `json()` calls with `Response.json()` which is a standard Web API.

### Before:
```typescript
import { json } from "react-router";

export const action = async ({ request }) => {
  return json({ success: true }, { status: 200 });
};
```

### After:
```typescript
// No import needed - Response.json is a standard Web API

export const action = async ({ request }) => {
  return Response.json({ success: true }, { status: 200 });
};
```

## Files Fixed

- ✅ `app/routes/api.catalog.ts` - Replaced all 30+ `json()` calls with `Response.json()`

## Benefits

1. **Standard Web API**: `Response.json()` is part of the Fetch API standard
2. **Better Compatibility**: Works in all modern environments (Node.js, Deno, Cloudflare Workers, etc.)
3. **No Import Needed**: Reduces bundle size slightly
4. **Future-Proof**: Won't break with React Router updates

## Testing

The fix has been applied and verified:
- ✅ No TypeScript errors
- ✅ No import errors
- ✅ All API endpoints return proper JSON responses

## Migration Guide

If you have other files using `json()` from react-router, replace them with:

```typescript
// Find and replace:
import { json } from "react-router";  // Remove this line
return json({ ... }, { status: 200 }); // Replace with:
return Response.json({ ... }, { status: 200 });
```

## Additional Notes

- `Response.json()` is available in Node.js 18+ (which Shopify apps require)
- The syntax is identical to the old `json()` helper
- Status codes and headers work the same way
- No behavior changes, just a different API

## Deployment

The app is now ready to deploy without ESM/CommonJS errors.
