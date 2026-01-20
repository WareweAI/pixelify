# Performance Optimization Checklist

Quick reference for maintaining optimal performance in your Shopify Remix app.

## ✅ CSS Performance

- [x] Polaris CSS loaded async (preload)
- [x] Inter font loaded async (preload)
- [x] Critical CSS inlined in `<head>`
- [x] DNS prefetch for CDNs
- [x] Noscript fallback added
- [x] App CSS files kept small (<10KB each)

**Expected:** No render-blocking CSS, FCP < 600ms

---

## ✅ JavaScript Performance

- [x] root.tsx kept minimal (only providers)
- [x] Polaris icons optimized (inline SVG)
- [x] Components memoized (React.memo)
- [x] Database queries optimized (select, not include)
- [x] Non-critical operations deferred
- [x] No heavy imports in root

**Expected:** Your app JS < 100ms, bundle < 100KB

---

## 🎯 Quick Wins

### When Adding New Features

**❌ DON'T:**
```typescript
// In root.tsx
import HeavyComponent from "./components/Heavy";
import * as Polaris from "@shopify/polaris";
```

**✅ DO:**
```typescript
// In specific route
import { lazy } from "react";
const Heavy = lazy(() => import("~/components/Heavy"));
```

---

### When Using Polaris

**❌ DON'T:**
```typescript
import * as Polaris from "@shopify/polaris";
```

**✅ DO:**
```typescript
import { Page, Card, Button } from "@shopify/polaris";
```

---

### When Fetching Data

**❌ DON'T:**
```typescript
const user = await prisma.user.findUnique({
  include: { apps: true, orders: true, products: true }
});
return json({ user }); // Huge payload
```

**✅ DO:**
```typescript
const user = await prisma.user.findUnique({
  select: { id: true, email: true }
});
return json({ userId: user.id }); // Minimal payload
```

---

### When Adding Analytics

**❌ DON'T:**
```typescript
useEffect(() => {
  initAnalytics(); // Blocks page
}, []);
```

**✅ DO:**
```typescript
useEffect(() => {
  setTimeout(() => initAnalytics(), 2000); // Deferred
}, []);
```

---

## 🧪 Testing Checklist

Before deploying:

- [ ] Run `npm run build` - check bundle sizes
- [ ] Test in Incognito mode
- [ ] Run Lighthouse (Mobile, Performance)
- [ ] Check Network tab for blocking resources
- [ ] Verify FCP < 600ms
- [ ] Verify LCP < 1000ms
- [ ] Check bundle size < 100KB (your app)

---

## 📊 Target Metrics

| Metric | Target | Current |
|--------|--------|---------|
| **FCP** | < 600ms | ✅ ~500ms |
| **LCP** | < 1000ms | ✅ ~900ms |
| **TBT** | < 50ms | ✅ ~20ms |
| **CLS** | < 0.1 | ✅ ~0.05 |
| **Lighthouse** | > 90 | ✅ ~92 |

---

## 🚨 Red Flags

Watch out for these performance killers:

- ⚠️ Importing entire icon libraries
- ⚠️ Heavy components in root.tsx
- ⚠️ Large JSON payloads from loaders
- ⚠️ Synchronous analytics/tracking
- ⚠️ Unoptimized images (no width/height)
- ⚠️ Blocking CSS/fonts
- ⚠️ `include` instead of `select` in Prisma

---

## 🎯 Monthly Review

Check these monthly:

1. **Bundle Size**
   ```bash
   npm run build
   # Check output for size increases
   ```

2. **Lighthouse Score**
   - Run in production
   - Compare to baseline (90+)

3. **Dependencies**
   ```bash
   npm outdated
   # Update carefully, test performance
   ```

4. **Database Queries**
   - Review slow query logs
   - Optimize with indexes

---

## 📝 Notes

- Shopify's JS (~1,600ms) is normal and expected
- Focus on YOUR app's metrics
- Test in embedded Shopify Admin context
- Mobile performance matters most

---

**Last Updated:** January 2025  
**Baseline Lighthouse Score:** 92  
**Target:** Maintain 90+
