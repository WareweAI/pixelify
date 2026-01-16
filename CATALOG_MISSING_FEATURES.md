# 📋 Catalog Functionality - Missing Features & Implementation Roadmap

**Date**: January 15, 2026  
**Status**: Core features implemented, gaps identified for full Omega Pixel dynamic ads parity

---

## 🎯 Overview

The Pixelify catalog system has a solid foundation with product sync, event tracking, and catalog attribution working. However, several features are needed to achieve full **Omega Pixel-like functionality** for dynamic ads and event sending.

---

## ❌ Critical Missing Features (Must Implement)

### 1. **Real-Time Product Updates via Webhooks**
**Priority**: 🔴 HIGH  
**Impact**: Without this, catalog falls out of sync when products change  
**Current State**: Manual sync or 5-day auto-sync only

#### What's Missing:
- [ ] Webhook handler for Shopify product updates (`products/update`)
- [ ] Webhook handler for product deletion (`products/delete`)
- [ ] Webhook handler for inventory changes (`inventory_items/update`)
- [ ] Delta sync logic (only send changed fields, not full product)
- [ ] Batch queue for webhook events (prevent rate limiting)
- [ ] Retry logic for failed webhook syncs

#### Implementation Details:
```typescript
// Needed in app/routes/webhooks.ts
- Handle POST /webhooks/product-update
  → Extract product ID and changed fields
  → Queue for batch processing
  → Call FacebookCatalogService.updateProducts()
  → Log changes with timestamps

- Handle POST /webhooks/product-delete
  → Identify affected catalogs
  → Delete from Facebook catalog
  → Update local database

- Handle POST /webhooks/inventory-update
  → Update product availability status
  → Sync to catalog if stock changed
```

**Files to Create/Modify**:
- `app/routes/webhooks.product-update.ts` (new)
- `app/routes/webhooks.product-delete.ts` (new)  
- `app/routes/webhooks.inventory-update.ts` (new)
- `app/services/webhook-queue.server.ts` (new)
- Update `CATALOG_IMPLEMENTATION_DETAILS.md`

---

### 2. **Background Job Processing for AutoSync**
**Priority**: 🔴 HIGH  
**Impact**: AutoSync currently only works with page refreshes, not automatically  
**Current State**: Database tracks `nextSync` timestamp, but no job processor runs

#### What's Missing:
- [ ] Background job queue (Bull, Agenda, or Node-cron)
- [ ] Scheduled task that runs every 5 days
- [ ] Job status tracking (pending, running, completed, failed)
- [ ] Retry mechanism for failed syncs
- [ ] Admin dashboard to view job history
- [ ] Email notifications on sync success/failure
- [ ] Stagger syncs to avoid API rate limits (don't sync all at once)

#### Implementation Details:
```typescript
// Needed services/components:
- CatalogSyncScheduler
  → Runs every day (checks if sync needed)
  → For each catalog: if (Date.now() > nextSync)
  → Call FacebookCatalogService.syncCatalog()
  → Update lastSync and nextSync timestamps
  → Log results

- Job status tracking in database
  → catalogSyncJob table
  → Fields: catalogId, status, startTime, endTime, error

- Admin view of job history
  → Show last 20 syncs
  → Display success rate
  → Show error logs
```

**Files to Create/Modify**:
- `app/services/catalog-sync-scheduler.server.ts` (new)
- `prisma/schema.prisma` - Add `CatalogSyncJob` model
- `app/routes/app.catalog-sync-history.tsx` (new, admin view)
- Add cron job trigger to app startup
- Update `CATALOG_IMPLEMENTATION_DETAILS.md`

---

### 3. **Catalog Analytics & Performance Monitoring**
**Priority**: 🟡 MEDIUM  
**Impact**: Users can't see if catalog sync is working properly  
**Current State**: Only shows product counts, no performance metrics

#### What's Missing:
- [ ] Track sync duration and API call count
- [ ] Monitor sync success rate (% of products that synced successfully)
- [ ] Track failed products and error reasons
- [ ] Display in UI: sync status, last sync time, next sync time
- [ ] Analytics: Products synced per day/week
- [ ] Alert: When sync fails 3+ times consecutively
- [ ] Dashboard widget showing catalog health

#### Implementation Details:
```typescript
// Database tracking:
CatalogSyncJob:
  - catalogId, startTime, endTime, duration
  - status: "pending" | "running" | "success" | "failed"
  - totalProducts, syncedProducts, failedProducts
  - errors: string[] (list of API errors encountered)

// UI Components needed:
- Catalog Health Card (in dashboard)
  → Last sync time
  → Next sync time
  → Sync success rate
  → Failed products count

- Sync History Table (in catalog manager)
  → Date, duration, status, products synced, errors
  → Click to see error details
```

**Files to Create/Modify**:
- `prisma/schema.prisma` - Enhance `CatalogSyncJob` model
- `app/services/catalog-analytics.server.ts` (new)
- `app/routes/api.catalog-stats.ts` (new API endpoint)
- `app/components/CatalogHealthCard.tsx` (new)
- `app/components/SyncHistoryTable.tsx` (new)

---

### 4. **Event Enrichment with Catalog Product Details**
**Priority**: 🟡 MEDIUM  
**Impact**: Without this, Facebook can't fully optimize dynamic ads  
**Current State**: Only sends `content_ids`, not full product details

#### What's Missing:
- [ ] Include product `title` in event payload
- [ ] Include product `image_url` for dynamic ads
- [ ] Include product `category` for better targeting
- [ ] Include product `brand` for brand-specific ads
- [ ] Include `retailer_id` consistency check
- [ ] Cache product details to avoid N+1 queries
- [ ] Validate that sent product IDs exist in catalog

#### Implementation Details:
```typescript
// Current payload (minimal):
{
  content_type: "product",
  content_ids: ["123", "456"],
  contents: [
    { id: "123", quantity: 2, item_price: 29.99 }
  ]
}

// Enhanced payload (Facebook requires for DPA):
{
  content_type: "product",
  content_ids: ["123", "456"],
  contents: [
    {
      id: "123",
      quantity: 2,
      item_price: 29.99,
      title: "Blue T-Shirt",
      image_url: "https://...",
      category: "Clothing > Shirts",
      brand: "BrandName",
      retailer_id: "123"  // Must match catalog
    }
  ]
}

// Service method needed:
enrichEventWithProductDetails(catalogId, productIds)
  → Fetch from cache or database
  → Get product title, image, category, brand
  → Validate retailer_id matches
  → Return enriched payload
```

**Files to Create/Modify**:
- `app/services/catalog-event-handler.server.ts` - Update `buildCatalogEventPayload()`
- `app/services/product-cache.server.ts` (new - cache product details)
- `prisma/schema.prisma` - Store product details if needed
- Update event payload structure

---

### 5. **Product Catalog Feed as Fallback**
**Priority**: 🟡 MEDIUM  
**Impact**: Some users can't sync via API, need XML feed option  
**Current State**: Feed URL generated but not actively promoted

#### What's Missing:
- [ ] Admin UI to switch between API and Feed methods
- [ ] Detailed feed format validation
- [ ] Feed refresh interval configuration
- [ ] Feed URL in Facebook Commerce Manager UI
- [ ] Monitor feed import status in Facebook
- [ ] Test feed method end-to-end
- [ ] Documentation for feed setup
- [ ] Feed health checks (is Facebook importing correctly?)

#### Implementation Details:
```typescript
// Current feed endpoint:
GET /api/catalog-feed/{appId}.xml

// Enhancements needed:
- Add feed format option selector in UI
- Show feed URL in catalog details
- Instructions: "Copy this URL to Facebook Commerce Manager > Settings > Data Sources"
- Monitor: When was feed last imported?
- Status: Is Facebook importing successfully?

// Database fields needed:
FBCatalog:
  syncMethod: "api" | "feed"  // Toggle between methods
  feedUrl: string             // For reference
  feedLastImportedAt: Date
  feedImportStatus: "success" | "error" | "pending"
  feedImportError: string     // If failed
```

**Files to Create/Modify**:
- `app/routes/api.catalog-feed.[appId][.]xml.ts` - Enhance existing
- `app/routes/app.catalog.tsx` - Add method selector UI
- `app/services/facebook-feed-monitor.server.ts` (new)
- `prisma/schema.prisma` - Add sync method tracking

---

## ⚠️ Important Missing Features (Should Implement)

### 6. **Variant Product Handling**
**Priority**: 🟡 MEDIUM  
**Impact**: Shopify stores with variants need proper SKU/variant ID tracking  
**Current State**: Variants may be treated as separate products

#### What's Missing:
- [ ] Option to sync variants as separate catalog items or combine parent
- [ ] Variant attribute mapping (color, size, etc.)
- [ ] Variant SKU as unique identifier
- [ ] Stock tracking per variant
- [ ] Pricing per variant
- [ ] Image mapping for specific variants
- [ ] Clear documentation on variant strategy

#### Implementation Details:
```typescript
// Decision: Shopify variant vs Facebook variant
Option A: Each variant = separate catalog product
  - variant_id as retailer_id
  - Pros: Precise inventory tracking
  - Cons: Can create hundreds of items

Option B: Parent + variant attributes
  - parent_id as retailer_id
  - variants as attributes in catalog
  - Pros: Cleaner catalog structure
  - Cons: More complex mapping

// Required fields per variant:
{
  id: "variant_123",
  retailer_id: "variant_123",
  title: "Blue T-Shirt - Size M",
  price: 29.99,
  availability: "in stock",
  image_url: "variant_specific_image.jpg",
  attributes: {
    size: "M",
    color: "Blue"
  }
}
```

**Files to Create/Modify**:
- `app/services/shopify-products.server.ts` - Enhance variant handling
- `app/routes/api.catalog.ts` - Update product transformation
- Add variant strategy option to settings
- Documentation for variant setup

---

### 7. **Product Filtering & Selection**
**Priority**: 🟡 MEDIUM  
**Impact**: Users may not want all products in catalog (old stock, drafts, etc.)  
**Current State**: Syncs all active products only

#### What's Missing:
- [ ] UI to select which products to sync
- [ ] Filter by: collection, product type, tags, price range
- [ ] Exclude drafts, archived, or out-of-stock
- [ ] "Smart catalog" that auto-updates based on filters
- [ ] Product count preview before sync
- [ ] Partial resync (only selected products)
- [ ] Sync history per product

#### Implementation Details:
```typescript
// Database fields needed:
FBCatalog:
  filterConfig: {
    includeCollections?: string[]
    excludeCollections?: string[]
    includeTags?: string[]
    excludeTags?: string[]
    excludeArchived?: boolean
    excludeDrafts?: boolean
    minPrice?: number
    maxPrice?: number
    productTypes?: string[]
  }

// UI: Multi-select filters
- Shopify Collections (checkbox list)
- Product Tags (searchable)
- Price range slider
- Exclude archived / drafts (toggles)

// Preview: "X products will be synced with current filters"
```

**Files to Create/Modify**:
- `app/routes/app.catalog.tsx` - Add filter UI
- `app/services/shopify-products.server.ts` - Apply filters
- `app/routes/api.catalog.ts` - Pass filters to sync
- `prisma/schema.prisma` - Store filter config

---

### 8. **Custom Product Field Mapping**
**Priority**: 🟡 MEDIUM  
**Impact**: Advanced users need to map custom Shopify fields to Facebook attributes  
**Current State**: Fixed mapping of Shopify → Facebook fields

#### What's Missing:
- [ ] UI to configure field mapping
- [ ] Support for custom Metafields
- [ ] Map Shopify custom field → Facebook attribute
- [ ] Example: Shopify "youtube_video" → Facebook "video_url"
- [ ] Validation that mapped fields exist
- [ ] Test mapping before saving
- [ ] Map multiple Shopify fields to one Facebook field

#### Implementation Details:
```typescript
// Database:
FBCatalog:
  fieldMapping: {
    "youtube_video": "video_url",
    "custom_brand": "brand",
    "color_swatch": "color"
  }

// During sync:
1. Get Shopify product
2. Apply field mapping
3. Transform Shopify fields → Facebook fields
4. Upload to catalog

// UI: Key-value pair editor
[Shopify Field] → [Facebook Field]
[custom_brand] → [brand]
[youtube_id] → [video_url]
```

**Files to Create/Modify**:
- `app/routes/app.catalog-field-mapping.tsx` (new)
- `app/services/product-field-mapper.server.ts` (new)
- `prisma/schema.prisma` - Store mapping config

---

### 9. **Inventory Sync**
**Priority**: 🟡 MEDIUM  
**Impact**: Dynamic ads should reflect current inventory  
**Current State**: Only syncs availability (in stock / out of stock)

#### What's Missing:
- [ ] Sync quantity/stock level to Facebook
- [ ] Update inventory when Shopify inventory changes
- [ ] Sync availability date for pre-orders
- [ ] Handle multiple fulfillment locations
- [ ] Sync via Feed method as well
- [ ] Monitor inventory sync failures

#### Implementation Details:
```typescript
// Facebook catalog supports:
{
  availability: "in stock",
  quantity: 42,  // Current stock
  check_out_url: "https://..."  // Unique checkout URL per product
}

// When Shopify inventory changes:
1. Webhook trigger: inventory_items/update
2. Find affected catalog products
3. Get latest inventory from Shopify
4. Update in Facebook catalog
5. Log inventory change with timestamp
```

**Files to Create/Modify**:
- `app/routes/webhooks.inventory-update.ts` - Already planned in feature #1
- `app/services/facebook-catalog.server.ts` - Add inventory update
- Monitor inventory sync success rate

---

### 10. **Multi-Catalog Support per Store**
**Priority**: 🟡 MEDIUM  
**Impact**: Large stores may want separate catalogs for different channels  
**Current State**: Only one catalog per pixel

#### What's Missing:
- [ ] Allow multiple catalogs per user
- [ ] Assign catalogs to different pixels
- [ ] Separate product selection per catalog
- [ ] Sync status per catalog
- [ ] Delete catalog from Pixelify (and optionally Facebook)
- [ ] Reorder catalogs in UI
- [ ] Clone catalog configuration

#### Implementation Details:
```typescript
// Current limitation:
1 Pixel → 1 Catalog

// Enhancement:
1 Pixel → Multiple Catalogs
  → Primary catalog (for events)
  → Secondary catalog (for different product set)

// UI changes:
- Catalog manager shows multiple entries
- Each has independent sync status
- Each has independent event attribution

// Considerations:
- Which catalog to use for event attribution?
- Solution: Use "primary" flag, or allow selection per pixel
```

**Files to Create/Modify**:
- `app/routes/app.catalog.tsx` - Update for multiple catalogs
- `prisma/schema.prisma` - Add ordering, primary flag
- `app/services/catalog-event-handler.server.ts` - Handle multiple catalogs

---

## 🔧 Nice-to-Have Features (Polish & UX)

### 11. **Catalog Debugging & Validation**
**Priority**: 🟢 LOW  
**Impact**: Helps users troubleshoot sync issues  

- [ ] Catalog validation tool (check for missing fields, invalid formats)
- [ ] Sample product viewer (show what Facebook sees)
- [ ] Test event payload viewer
- [ ] Facebook API response inspector
- [ ] Sync error details with suggested fixes
- [ ] "Is this product valid?" checker for individual products

---

### 12. **Enhanced Event Testing UI**
**Priority**: 🟢 LOW  
**Impact**: Easier to test catalog events  

- [ ] UI to manually trigger events (ViewContent, AddToCart, etc.)
- [ ] Select products for event
- [ ] Preview actual payload before sending
- [ ] Show Facebook response
- [ ] Test in Facebook Events Manager directly from Pixelify UI

---

### 13. **Catalog Performance Optimization**
**Priority**: 🟢 LOW  
**Impact**: Faster syncs for stores with 10k+ products  

- [ ] Implement parallel batch processing
- [ ] Progress tracking (X of Y products uploaded)
- [ ] Resume failed syncs from checkpoint
- [ ] Compress product data in transit
- [ ] Cache product images locally
- [ ] Monitor API rate limits and adjust batch size

---

### 14. **Documentation & Guides**
**Priority**: 🟢 LOW  
**Impact**: Better onboarding and support  

- [ ] Step-by-step catalog setup guide
- [ ] Video tutorial
- [ ] Troubleshooting guide
- [ ] FAQ (common issues and solutions)
- [ ] Best practices for product organization
- [ ] Dynamic ads campaign setup guide
- [ ] Common error codes and fixes

---

### 15. **Notifications & Alerts**
**Priority**: 🟢 LOW  
**Impact**: Users stay informed about catalog status  

- [ ] Email notification when sync succeeds
- [ ] Email alert when sync fails 3+ times
- [ ] In-app toast when manual sync completes
- [ ] Slack webhook integration for sync status
- [ ] Dashboard notification badge (catalog needs attention)
- [ ] Daily summary email

---

## 📊 Implementation Priority Matrix

| Feature | Priority | Effort | Impact | Status |
|---------|----------|--------|--------|--------|
| Webhook real-time updates | 🔴 HIGH | HIGH | HIGH | ❌ Not Started |
| Background job scheduler | 🔴 HIGH | HIGH | HIGH | ❌ Not Started |
| Catalog analytics | 🟡 MEDIUM | MEDIUM | HIGH | ❌ Not Started |
| Event enrichment | 🟡 MEDIUM | MEDIUM | HIGH | ❌ Not Started |
| Feed fallback | 🟡 MEDIUM | MEDIUM | MEDIUM | 🟡 Partial |
| Variant handling | 🟡 MEDIUM | MEDIUM | MEDIUM | ❌ Not Started |
| Product filtering | 🟡 MEDIUM | MEDIUM | MEDIUM | ❌ Not Started |
| Custom field mapping | 🟡 MEDIUM | HIGH | LOW | ❌ Not Started |
| Inventory sync | 🟡 MEDIUM | MEDIUM | MEDIUM | ❌ Not Started |
| Multi-catalog support | 🟡 MEDIUM | HIGH | MEDIUM | ❌ Not Started |

---

## 🚀 Recommended Implementation Order

### Phase 1: Core Reliability (Weeks 1-2)
1. **Webhook handlers** - Real-time product updates
2. **Background job scheduler** - AutoSync actually runs
3. **Catalog analytics** - Users see what's happening

### Phase 2: Enhanced Functionality (Weeks 3-4)
4. **Event enrichment** - Better dynamic ads optimization
5. **Product filtering** - Users select what to sync
6. **Variant handling** - Support Shopify variants properly

### Phase 3: Advanced Features (Weeks 5-6)
7. **Inventory sync** - Stock levels update
8. **Custom field mapping** - Advanced customization
9. **Multi-catalog support** - Multiple catalogs per store

### Phase 4: Polish & Support (Weeks 7+)
10. **Debugging tools** - Troubleshooting UI
11. **Documentation** - Guides and FAQs
12. **Performance** - Optimize for large stores

---

## 📝 Notes

- **Omega Pixel Parity**: Implementing features 1-5 will achieve feature parity with Omega Pixel's catalog system
- **Facebook Requirements**: Features 3, 4, and 9 are recommended by Facebook for optimal dynamic ads performance
- **User Requests**: Collect feedback on which features are most needed
- **Database Migrations**: Several features require Prisma schema updates and migrations

---

## ✅ Checklist for Developers

- [ ] Review each feature with product team
- [ ] Prioritize based on actual user needs
- [ ] Create GitHub issues for each feature
- [ ] Estimate effort and assign sprints
- [ ] Add acceptance criteria to issues
- [ ] Plan testing strategy for each feature
- [ ] Document implementation details
- [ ] Update this roadmap as features are built

---

**Last Updated**: January 15, 2026  
**Next Review**: After Phase 1 completion
