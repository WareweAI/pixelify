# Omega Pixel Catalog Implementation Details

## 📋 **What Has Been Implemented**

### **1. Complete Catalog Management System**
- ✅ **UI Interface**: Full React-based catalog manager (`app/catalog`)
- ✅ **Database Schema**: Facebook catalog tracking in Prisma
- ✅ **API Endpoints**: RESTful catalog operations (`/api/catalog`)
- ✅ **XML Feed Generation**: Automated product feeds (`/api/catalog-feed/{appId}.xml`)

### **2. Facebook Catalog Integration**
- ✅ **Catalog Creation**: Via Facebook Graph API
- ✅ **Product Sync**: Batch upload/update/delete operations
- ✅ **Pixel Linking**: Connect catalogs to Facebook pixels
- ✅ **AutoSync**: Scheduled product synchronization (every 5 days)
- ✅ **Feed Fallback**: XML feed method for limited permissions

### **3. Event Tracking with Catalog Attribution**
- ✅ **Catalog Event Handler**: Unified pipeline for all events
- ✅ **Product Data Injection**: Automatic content_ids, contents, content_type
- ✅ **Event Classification**: Smart detection of catalog-eligible events
- ✅ **Fallback Strategy**: Graceful degradation when catalog unavailable
- ✅ **Deduplication**: Event ID generation for browser/server dedup

### **4. Multi-Method Data Sync**
- ✅ **API Method**: Direct Facebook Graph API batch operations
- ✅ **Feed Method**: XML product feeds for catalog import
- ✅ **Webhook Integration**: Real-time product updates
- ✅ **Manual Sync**: On-demand catalog synchronization

---

## 🔄 **How Data Flows to Catalog**

### **Phase 1: Catalog Setup**
```
Shopify Store → Pixelify App → Facebook Business Account
       ↓              ↓              ↓
   Products    Create Catalog    Select Business
       ↓              ↓              ↓
   Sync Data    Link to Pixel    Enable Tracking
```

### **Phase 2: Product Data Flow**
```
Shopify Products → GraphQL Fetch → Transform to Facebook Format
       ↓              ↓              ↓
   Active Only    Variant Handling    Required Fields Mapping
       ↓              ↓              ↓
   Batch Upload    API / Feed Method    Facebook Catalog
```

### **Phase 3: Event Attribution Flow**
```
User Action → Event Triggered → Catalog Lookup
     ↓              ↓              ↓
  Product Data   Classify Event   Find Linked Catalog
     ↓              ↓              ↓
  Inject Fields   Send to CAPI    Meta Processes Event
```

---

## 🏗️ **Technical Implementation Details**

### **Database Schema**
```sql
-- Facebook Catalogs Table
CREATE TABLE facebook_catalog (
  id SERIAL PRIMARY KEY,
  userId INTEGER REFERENCES users(id),
  catalogId VARCHAR(255) UNIQUE,
  name VARCHAR(255),
  pixelId VARCHAR(255),
  pixelEnabled BOOLEAN DEFAULT false,
  autoSync BOOLEAN DEFAULT false,
  productCount INTEGER DEFAULT 0,
  lastSync TIMESTAMP,
  nextSync TIMESTAMP,
  syncStatus VARCHAR(50) DEFAULT 'pending',
  createdAt TIMESTAMP DEFAULT NOW(),
  updatedAt TIMESTAMP DEFAULT NOW()
);
```

### **Key Services**

#### **FacebookCatalogService** (`app/services/facebook-catalog.server.ts`)
- `createCatalog()` - Creates Facebook commerce catalog
- `uploadProducts()` - Batch product uploads (1000 items/batch)
- `updateProducts()` - Incremental product updates
- `connectPixelToCatalog()` - Links pixel to catalog for attribution

#### **CatalogEventHandler** (`app/services/catalog-event-handler.server.ts`)
- `getCatalogMapping()` - Finds catalog for user + pixel
- `classifyEvent()` - Determines if event needs catalog data
- `buildCatalogEventPayload()` - Injects catalog fields
- `processEventWithCatalog()` - Main pipeline processor

#### **MetaCAPI Service** (`app/services/meta-capi.server.ts`)
- `mapToMetaEvent()` - Converts events to Meta format
- `sendToMetaCAPI()` - Sends events via Conversions API
- Catalog-aware event enhancement

### **API Endpoints**

#### **Catalog Management** (`/api/catalog`)
```typescript
POST /api/catalog
// Actions: create-catalog, sync-catalog, toggle-autosync, toggle-pixel, delete-catalog
```

#### **XML Feed** (`/api/catalog-feed/{appId}.xml`)
```xml
<rss version="2.0" xmlns:g="http://base.google.com/ns/1.0">
  <channel>
    <title>Store Product Feed</title>
    <item>
      <id>retailer_id</id>
      <title>Product Title</title>
      <price>29.99 USD</price>
      <availability>in stock</availability>
      <condition>new</condition>
    </item>
  </channel>
</rss>
```

### **Event Data Structure**

#### **Catalog Event Payload**
```javascript
{
  event_name: "AddToCart",
  custom_data: {
    content_ids: ["product_123"],           // Matches catalog retailer_id
    content_type: "product",                // Required for catalog
    contents: [{                            // Detailed product info
      id: "product_123",
      quantity: 1,
      item_price: 29.99
    }],
    value: 29.99,                          // Total cart/order value
    currency: "USD",
    num_items: 1
  },
  user_data: { /* hashed PII */ },
  event_id: "unique_dedup_id"
}
```

---

## 🔗 **Data Flow Diagrams**

### **Product Sync Flow**
```
1. User clicks "Sync Catalog"
2. App fetches products from Shopify Admin API
3. Transform products to Facebook format
4. Batch upload via Facebook Graph API
5. Update local sync status
6. Schedule next auto-sync (5 days)
```

### **Event Processing Flow**
```
1. Event triggered (ViewContent, AddToCart, etc.)
2. Check if pixel has linked catalog
3. If catalog exists + event eligible:
   - Inject content_ids, contents, content_type
   - Send enhanced event to Meta CAPI
4. Meta automatically attributes to catalog via pixel link
5. Dynamic ads use catalog data for personalization
```

### **Catalog Attribution Logic**
```
Pixel ID → Database Lookup → Catalog ID
     ↓              ↓              ↓
  User Event → Product IDs → Content IDs Match
     ↓              ↓              ↓
  Enhanced Event → Meta CAPI → Catalog Linked
     ↓              ↓              ↓
  Ad Optimization → Dynamic Ads → Conversions
```

---

## 🎯 **Key Features Implemented**

### **Smart Product ID Mapping**
- **Primary**: Uses SKU if available
- **Fallback**: `shopify_{store}_{productId}_{variantId}`
- **Validation**: Ensures IDs match between Shopify and Facebook

### **Event Classification Rules**
```typescript
const catalogEvents = ['ViewContent', 'AddToCart', 'InitiateCheckout', 'Purchase'];
const isCatalogEvent = catalogEvents.includes(eventName) && products.length > 0 && catalogId;
```

### **Automatic Fallback**
- If catalog validation fails → Send normal event
- If pixel not linked → Skip catalog fields
- If API errors → Use feed method

### **Deduplication Strategy**
- Generate SHA256 hash of: `storeId + orderId + eventName + timestamp`
- Same event_id for browser + server events
- Prevents duplicate conversions

---

## 🚀 **Benefits for Dynamic Ads**

### **Complete Attribution Chain**
1. **Product Data** → Synced to Facebook Catalog
2. **Event Data** → Enhanced with content_ids
3. **Pixel Link** → Catalog connected to pixel
4. **Meta Inference** → Automatic catalog attribution
5. **Ad Optimization** → Dynamic product ads work

### **Multi-Store Support**
- Each store has unique pixel
- Separate catalogs per store
- Isolated event attribution
- No cross-store data leakage

### **Real-Time Updates**
- Webhook-triggered sync for new products
- Auto-sync every 5 days for updates
- Manual sync on-demand
- Feed method for instant updates

---

## 📊 **Monitoring & Debugging**

### **Sync Status Tracking**
- Database tracks: `lastSync`, `nextSync`, `syncStatus`
- UI shows: product counts, sync timestamps, error states
- Logs all sync operations and failures

### **Event Validation**
- Validates product IDs exist in catalog
- Checks currency and catalog linkage
- Fallback to normal events on failure
- Comprehensive error logging

### **Performance Optimization**
- Batch operations (1000 items/batch)
- Parallel processing where possible
- Efficient database queries
- Caching for repeated lookups

---

## 🔧 **Configuration Options**

### **Variant Submission Modes**
- **Separate**: Each variant as individual product
- **Grouped**: Variants under parent product
- **First**: Only first variant per product

### **Sync Intervals**
- **AutoSync**: Every 5 days (configurable)
- **Manual**: On-demand via UI
- **Webhook**: Real-time for new products

### **Feed vs API Method**
- **API Method**: Direct Graph API (preferred)
- **Feed Method**: XML upload (fallback)
- **Auto-detection**: Based on token permissions

---

**Last Updated:** January 15, 2026
**Implementation Status:** ✅ Complete and Production-Ready