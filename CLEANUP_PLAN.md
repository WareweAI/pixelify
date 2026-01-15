# App Cleanup & Optimization Plan

## Files to Remove (Debug/Test Routes)

### Debug Routes (Development Only):
- ❌ `app/routes/debug-ad-accounts.tsx`
- ❌ `app/routes/debug-facebook-token.tsx`
- ❌ `app/routes/validate-token.tsx`
- ❌ `app/routes/catalog-docs.tsx`
- ❌ `app/routes/docs.tsx`

### Debug API Routes:
- ❌ `app/routes/api.debug-ad-accounts.ts`
- ❌ `app/routes/api.debug-events.ts`
- ❌ `app/routes/api.debug-facebook-step-by-step.ts`
- ❌ `app/routes/api.debug-status.ts`
- ❌ `app/routes/api.quick-facebook-test.ts`
- ❌ `app/routes/api.test-capi.ts`
- ❌ `app/routes/api.test-facebook-direct.ts`
- ❌ `app/routes/api.validate-token.ts`

### Duplicate/Redundant API Routes:
- ❌ `app/routes/api.facebook-pixels-by-token.ts` (use api.catalog.ts)
- ❌ `app/routes/api.facebook-pixels-with-auth.ts` (use api.catalog.ts)
- ❌ `app/routes/api.facebook-user-to-pixels.ts` (use api.catalog.ts)
- ❌ `app/routes/api.get-all-pixels.ts` (use api.catalog.ts)
- ❌ `app/routes/api.extract-user-id.ts` (unused)

### Duplicate Pixel Scripts:
- ❌ `app/routes/apps.pixel[.]js.ts` (keep api.pixel[.]js.ts)
- ❌ `app/routes/apps.tools.pixel[.]js.ts` (keep api.pixel[.]js.ts)
- ❌ `app/routes/pixel[.]js.ts` (keep api.pixel[.]js.ts)

## Files to Keep (Production)

### Core App Routes:
- ✅ `app/routes/app.tsx`
- ✅ `app/routes/app.dashboard.tsx`
- ✅ `app/routes/app.catalog.tsx`
- ✅ `app/routes/app.pixels.tsx`
- ✅ `app/routes/app.custom-events.tsx`
- ✅ `app/routes/app.conversions.tsx`
- ✅ `app/routes/app.events.tsx`
- ✅ `app/routes/app.analytics.tsx`
- ✅ `app/routes/app.settings.tsx`
- ✅ `app/routes/app.pricing.tsx`
- ✅ `app/routes/app.help.tsx`

### Core API Routes:
- ✅ `app/routes/api.catalog.ts` (NEW - optimized)
- ✅ `app/routes/api.pixel[.]js.ts` (pixel script)
- ✅ `app/routes/api.track.ts` (tracking)
- ✅ `app/routes/api.analytics.ts`
- ✅ `app/routes/api.conversions.ts`
- ✅ `app/routes/api.custom-events.ts`
- ✅ `app/routes/api.events.ts`
- ✅ `app/routes/api.visitors.ts`
- ✅ `app/routes/api.health.ts`
- ✅ `app/routes/api.meta.validate.ts`

### Auth Routes:
- ✅ `app/routes/auth.$.tsx`
- ✅ `app/routes/auth.facebook.tsx`
- ✅ `app/routes/auth.facebook.callback.tsx`
- ✅ `app/routes/auth.session-token.tsx`

### Webhook Routes:
- ✅ `app/routes/webhooks.app.uninstalled.tsx`
- ✅ `app/routes/webhooks.app_subscriptions.update.tsx`
- ✅ `app/routes/webhooks.orders.create.tsx`
- ✅ `app/routes/webhooks.checkouts.create.tsx`
- ✅ `app/routes/webhooks.carts.create.tsx`

### Proxy Routes:
- ✅ `app/routes/apps.proxy.$.tsx`
- ✅ `app/routes/apps.proxy.track.ts`

### Legal Routes:
- ✅ `app/routes/privacy-policy.tsx`

## Estimated Impact

### Bundle Size Reduction:
- Remove ~15 debug/test routes
- Remove ~10 duplicate API routes
- **Estimated reduction: 200-300KB**

### Performance Improvement:
- Fewer routes to match
- Faster route resolution
- Smaller route manifest
- **Estimated improvement: 10-20% faster routing**

### Maintenance:
- Cleaner codebase
- Easier to navigate
- Less confusion
- Better developer experience
