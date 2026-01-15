# Comprehensive App Optimization Plan

## Phase 1: Remove Debug/Test Routes (Immediate)

### Debug UI Routes to DELETE:
```bash
rm app/routes/debug-ad-accounts.tsx
rm app/routes/debug-facebook-token.tsx
rm app/routes/validate-token.tsx
rm app/routes/catalog-docs.tsx
rm app/routes/docs.tsx
```

### Debug API Routes to DELETE:
```bash
rm app/routes/api.debug-ad-accounts.ts
rm app/routes/api.debug-events.ts
rm app/routes/api.debug-facebook-step-by-step.ts
rm app/routes/api.debug-status.ts
rm app/routes/api.quick-facebook-test.ts
rm app/routes/api.test-capi.ts
rm app/routes/api.test-facebook-direct.ts
rm app/routes/api.validate-token.ts
```

**Impact:** Remove ~13 unused routes, reduce bundle by ~150KB

---

## Phase 2: Remove Duplicate/Redundant API Routes

### Duplicate Facebook API Routes to DELETE:
```bash
rm app/routes/api.facebook-pixels-by-token.ts
rm app/routes/api.facebook-pixels-with-auth.ts
rm app/routes/api.facebook-user-to-pixels.ts
rm app/routes/api.get-all-pixels.ts
rm app/routes/api.extract-user-id.ts
rm app/routes/api.facebook.callback.ts
rm app/routes/api.facebook.exchange-token.ts
```

**Reason:** All functionality moved to `api.catalog.ts`

### Duplicate Pixel Scripts to DELETE:
```bash
rm app/routes/apps.pixel[.]js.ts
rm app/routes/apps.tools.pixel[.]js.ts
rm app/routes/pixel[.]js.ts
rm app/routes/apps.proxy.pixel[.]js.ts
```

**Keep:** `api.pixel[.]js.ts` (main pixel script)

**Impact:** Remove ~11 duplicate routes, reduce bundle by ~100KB

---

## Phase 3: Optimize Route Loading

### Add Route Lazy Loading

**File:** `app/routes.ts` (create if doesn't exist)

```typescript
import { type RouteConfig } from "@react-router/dev/routes";

export default [
  // Core routes (eager load)
  { path: "/", file: "routes/_index/route.tsx" },
  { path: "/app", file: "routes/app.tsx", children: [
    { index: true, file: "routes/app.dashboard.tsx" },
    { path: "pixels", file: "routes/app.pixels.tsx" },
    { path: "catalog", file: "routes/app.catalog.tsx" },
    
    // Lazy load less frequently used routes
    { path: "custom-events", lazy: () => import("./routes/app.custom-events.tsx") },
    { path: "conversions", lazy: () => import("./routes/app.conversions.tsx") },
    { path: "events", lazy: () => import("./routes/app.events.tsx") },
    { path: "analytics", lazy: () => import("./routes/app.analytics.tsx") },
    { path: "settings", lazy: () => import("./routes/app.settings.tsx") },
    { path: "pricing", lazy: () => import("./routes/app.pricing.tsx") },
    { path: "help", lazy: () => import("./routes/app.help.tsx") },
  ]},
] satisfies RouteConfig;
```

**Impact:** Reduce initial bundle by 40-50%, faster first load

---

## Phase 4: Optimize Component Imports

### Use Dynamic Imports for Heavy Components

**Before:**
```typescript
import { Chart } from "recharts";
import { DataTable } from "@shopify/polaris";
```

**After:**
```typescript
const Chart = lazy(() => import("recharts").then(m => ({ default: m.Chart })));
const DataTable = lazy(() => import("@shopify/polaris").then(m => ({ default: m.DataTable })));
```

---

## Phase 5: Remove Unused Dependencies

### Check package.json for unused packages:
```bash
npx depcheck
```

### Likely unused packages to remove:
- Old testing libraries
- Unused UI libraries
- Duplicate utilities

---

## Phase 6: Optimize Database Queries

### Current Issues:
1. Sequential queries in loaders
2. No query result caching
3. Over-fetching data

### Solutions:

**1. Parallel Queries (Already done in catalog):**
```typescript
const [user, products, catalogs] = await Promise.all([
  prisma.user.findUnique(...),
  prisma.product.findMany(...),
  prisma.catalog.findMany(...),
]);
```

**2. Select Only Needed Fields:**
```typescript
// Before
const apps = await prisma.app.findMany({ where: { userId } });

// After
const apps = await prisma.app.findMany({ 
  where: { userId },
  select: { id: true, name: true, appId: true } // Only what's needed
});
```

**3. Add Indexes (Already in schema):**
```prisma
@@index([userId])
@@index([appId, createdAt])
```

---

## Phase 7: Implement Code Splitting

### Create Separate Bundles:

**vite.config.ts:**
```typescript
export default defineConfig({
  build: {
    rollupOptions: {
      output: {
        manualChunks: {
          'vendor-react': ['react', 'react-dom', 'react-router'],
          'vendor-shopify': ['@shopify/polaris', '@shopify/app-bridge'],
          'vendor-charts': ['recharts'],
          'vendor-utils': ['date-fns', 'lodash'],
        }
      }
    }
  }
});
```

**Impact:** Better caching, faster subsequent loads

---

## Phase 8: Optimize Images and Assets

### Add Image Optimization:
```typescript
// Use WebP format
// Lazy load images
// Add proper dimensions
<img 
  src="/image.webp" 
  loading="lazy" 
  width="300" 
  height="200"
  alt="Description"
/>
```

---

## Phase 9: Add Route Prefetching

### Prefetch Next Likely Route:

```typescript
import { Link } from "react-router";

<Link 
  to="/app/catalog" 
  prefetch="intent" // Prefetch on hover
>
  Catalog
</Link>
```

---

## Phase 10: Optimize State Management

### Remove Unnecessary State:

**Before:**
```typescript
const [data, setData] = useState(loaderData);
const [loading, setLoading] = useState(false);
const [error, setError] = useState(null);
```

**After:**
```typescript
// Use loader data directly
const data = useLoaderData();
const navigation = useNavigation();
const isLoading = navigation.state === "loading";
```

---

## Performance Metrics Goals

### Current (Estimated):
- Initial Load: 3-4 seconds
- Route Change: 500-800ms
- Bundle Size: 800KB-1MB

### Target After Optimization:
- Initial Load: 1-1.5 seconds (60% faster)
- Route Change: 100-200ms (75% faster)
- Bundle Size: 400-500KB (50% smaller)

---

## Implementation Priority

### High Priority (Do First):
1. ✅ Remove debug routes
2. ✅ Remove duplicate API routes
3. ✅ Optimize database queries (parallel)
4. ✅ Add route lazy loading
5. ✅ Remove unused imports

### Medium Priority:
6. Add code splitting
7. Optimize component imports
8. Add route prefetching
9. Optimize state management

### Low Priority:
10. Image optimization
11. Remove unused dependencies
12. Add service worker caching

---

## Monitoring

### Add Performance Monitoring:

```typescript
// app/entry.client.tsx
if (typeof window !== 'undefined') {
  // Measure route changes
  window.addEventListener('routechange', (e) => {
    console.log('Route change time:', e.detail.duration);
  });
  
  // Measure initial load
  window.addEventListener('load', () => {
    const perfData = performance.getEntriesByType('navigation')[0];
    console.log('Page load time:', perfData.loadEventEnd - perfData.fetchStart);
  });
}
```

---

## Automated Cleanup Script

Create `scripts/cleanup.sh`:

```bash
#!/bin/bash

echo "🧹 Cleaning up unused files..."

# Remove debug routes
rm -f app/routes/debug-*.tsx
rm -f app/routes/api.debug-*.ts
rm -f app/routes/api.test-*.ts
rm -f app/routes/api.quick-*.ts
rm -f app/routes/validate-token.tsx
rm -f app/routes/catalog-docs.tsx
rm -f app/routes/docs.tsx

# Remove duplicate API routes
rm -f app/routes/api.facebook-pixels-by-token.ts
rm -f app/routes/api.facebook-pixels-with-auth.ts
rm -f app/routes/api.facebook-user-to-pixels.ts
rm -f app/routes/api.get-all-pixels.ts
rm -f app/routes/api.extract-user-id.ts

# Remove duplicate pixel scripts
rm -f app/routes/apps.pixel[.]js.ts
rm -f app/routes/apps.tools.pixel[.]js.ts
rm -f app/routes/pixel[.]js.ts
rm -f app/routes/apps.proxy.pixel[.]js.ts

echo "✅ Cleanup complete!"
echo "📊 Removed approximately 24 unused files"
echo "💾 Estimated bundle size reduction: 250KB"
```

Run with: `bash scripts/cleanup.sh`

---

## Expected Results

After implementing all optimizations:

### Bundle Size:
- **Before:** 800KB-1MB
- **After:** 400-500KB
- **Reduction:** 50%

### Load Times:
- **Initial Load:** 60% faster
- **Route Changes:** 75% faster
- **API Calls:** 40% faster (parallel queries)

### User Experience:
- ✅ Instant route transitions
- ✅ Smooth UI updates
- ✅ No loading spinners for cached routes
- ✅ Better perceived performance

### Developer Experience:
- ✅ Cleaner codebase
- ✅ Easier to navigate
- ✅ Faster builds
- ✅ Better maintainability
