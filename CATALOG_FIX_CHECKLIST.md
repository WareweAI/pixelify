# Catalog Fix Checklist - Follow These Steps

## Current Issues (from screenshot)
- ❌ **35 items have issues** in catalog
- ❌ **No pixel events received** in last hour

## What Was Fixed in Code

### 1. Product Data Format (makeFbProduct)
Fixed all required fields for Facebook Catalog:

```javascript
{
  method: "UPDATE",
  retailer_id: "SKU_123",           // UNIQUE, STABLE ID
  data: {
    id: "SKU_123",                  // Same as retailer_id
    title: "Product Name",          // Required
    description: "Description",     // Required
    availability: "in stock",       // Required: "in stock" or "out of stock"
    condition: "new",               // Required: "new", "refurbished", "used"
    price: "2999 USD",              // Required: cents + currency
    link: "https://...",            // Required: product URL
    image_link: "https://...",      // Required: image URL
    brand: "Brand Name",            // Required
    item_group_id: "product_123",   // Groups variants
  }
}
```

### 2. GraphQL Query Updated
Added `images` field as fallback for `featuredImage`

## YOUR ACTION ITEMS

### STEP 1: Re-sync Catalog (REQUIRED)
1. Go to **Catalog Manager** in Pixelify
2. Click the **⋮** menu on your catalog
3. Click **"Refresh product count"** or trigger a new sync
4. Wait for sync to complete

### STEP 2: Check Facebook Catalog Diagnostics
1. Go to: https://business.facebook.com/commerce/catalogs
2. Select your catalog
3. Click **Diagnostics**
4. Check for remaining issues

### STEP 3: Fix Any Remaining Issues
Common issues and fixes:

| Issue | Fix |
|-------|-----|
| Missing retailer_id | Products need SKU in Shopify |
| Missing price | Products need price in Shopify |
| Missing image | Products need images in Shopify |
| Invalid URL | Check product handle in Shopify |

### STEP 4: Verify Browser Events
1. Go to your Shopify store
2. Open browser DevTools (F12)
3. Go to Network tab
4. Filter by "facebook" or "pixel"
5. Navigate to a product page
6. You should see pixel fire

### STEP 5: Check Events Manager
1. Go to: https://business.facebook.com/events_manager
2. Select your pixel
3. Click **Test Events**
4. You should see:
   - PageView
   - ViewContent (on product pages)

## Expected Result After Fix

```
Pixelify (App)
- Products: 15
- Status: ✅ Active
- Last update: [recent]

app (Pixel)
- Products: 15
- Status: ✅ Pixel events received
- Last update: [recent]
```

## Catalog Product Requirements

Every product MUST have:
- ✅ `retailer_id` - Unique string (SKU or product_variant ID)
- ✅ `title` - Product name
- ✅ `description` - Product description
- ✅ `availability` - "in stock" or "out of stock"
- ✅ `condition` - "new", "refurbished", or "used"
- ✅ `price` - Format: "2999 USD" (cents + currency)
- ✅ `link` - Product page URL
- ✅ `image_link` - Product image URL
- ✅ `brand` - Brand name

## Event ↔ Catalog Matching (CRITICAL)

For Dynamic Ads to work:
```
event.content_ids === catalog.retailer_id
```

Example:
```javascript
// Event sent to Facebook
{
  event_name: "ViewContent",
  custom_data: {
    content_ids: ["SKU_123"],  // MUST match catalog retailer_id
    content_type: "product"
  }
}

// Catalog product
{
  retailer_id: "SKU_123"  // MUST match event content_ids
}
```

## Troubleshooting

### Issue: Still 35 items with issues
1. Check Shopify products have:
   - SKU (or unique identifier)
   - Price
   - At least one image
   - Description
2. Re-sync catalog after fixing products

### Issue: No pixel events
1. Check pixel is installed on store
2. Check pixel ID is correct
3. Check browser console for errors
4. Verify pixel fires on page load

### Issue: Events not matching catalog
1. Ensure `content_ids` in events match `retailer_id` in catalog
2. Use SKU if available, otherwise use consistent product ID format
3. Check catalog diagnostics for "unmatched products"

---

**After completing these steps, your catalog should show:**
- 0 items with issues
- Pixel events received
- Dynamic Ads eligible
