# Facebook Catalog Ads - Testing Guide

## Quick Testing Checklist

### ✅ Step 1: Verify Catalog Setup

1. **Go to Catalog Manager** (`/app/catalog`)
2. **Check catalog exists** and shows:
   - ✅ Catalog name
   - ✅ Product count (e.g., 15/15 products)
   - ✅ Last sync date
   - ✅ Tracking pixel toggle is ON
   - ✅ AutoSync toggle is ON (recommended)

3. **Verify in Facebook:**
   - Go to [Facebook Catalog Manager](https://business.facebook.com/commerce/catalogs)
   - Find your catalog
   - Check products are synced
   - Verify pixel is connected

### ✅ Step 2: Test ViewContent Event

1. **Visit a product page** on your Shopify store
2. **Check browser console** for pixel tracking
3. **Check server logs** for:
   ```
   [Track] Processing event: ViewContent for app: your_app_id
   [Track] Found catalog 123456789 for pixel 987654321
   [Track] ✅ SUCCESS: Event "ViewContent" sent to Facebook CAPI (linked to catalog 123456789)
   ```

4. **Verify in Facebook Events Manager:**
   - Go to [Events Manager](https://business.facebook.com/events_manager)
   - Select your pixel
   - Click "Test Events"
   - Should see ViewContent event with:
     - `catalog_id` in custom_data
     - `content_ids` array with product ID
     - `content_type: "product"`
     - `value` and `currency`

### ✅ Step 3: Test AddToCart Event

1. **Add product to cart** on your store
2. **Check server logs** for:
   ```
   [Track] Found catalog 123456789 for pixel 987654321
   [Track] ✅ SUCCESS: Event "AddToCart" sent to Facebook CAPI (linked to catalog 123456789)
   ```

3. **Verify in Facebook Events Manager:**
   - Should see AddToCart event
   - Check for `catalog_id` in custom_data
   - Verify `content_ids` matches product added

### ✅ Step 4: Test InitiateCheckout Event

1. **Start checkout process** on your store
2. **Check webhook logs** for:
   ```
   [Webhook] checkouts/create from your-store.myshopify.com
   [Webhook] Found catalog 123456789 for InitiateCheckout event
   [Webhook] InitiateCheckout forwarded to Meta CAPI (linked to catalog 123456789)
   ```

3. **Verify in Facebook Events Manager:**
   - Should see InitiateCheckout event
   - Check for `catalog_id`
   - Verify `contents` array with all cart items
   - Check `num_items` matches cart quantity

### ✅ Step 5: Test Purchase Event

1. **Complete a test order** (use Shopify test mode)
2. **Check webhook logs** for:
   ```
   [Webhook] orders/create from your-store.myshopify.com
   [Webhook] Found catalog 123456789 for purchase event
   [Webhook] Purchase tracked: order_12345 - 89.97 USD
   [Webhook] Forwarded to Meta CAPI (linked to catalog 123456789)
   ```

3. **Verify in Facebook Events Manager:**
   - Should see Purchase event
   - Check for `catalog_id`
   - Verify `order_id` is included
   - Check `contents` array with all purchased items
   - Verify `value` matches order total

### ✅ Step 6: Verify Event Quality

1. **Go to Events Manager** → Your Pixel
2. **Click "Diagnostics"** tab
3. **Check Event Match Quality:**
   - Should be "Good" or "Great" (green)
   - Customer information parameters: 3+ matched
   - Event quality score: 7.0+ (out of 10)

4. **Check for warnings:**
   - No "Missing catalog_id" warnings
   - No "Product ID mismatch" errors
   - No "Invalid content_type" errors

### ✅ Step 7: Test Catalog Sync

1. **Go to Catalog Manager**
2. **Click "Sync" button** on your catalog
3. **Wait for sync to complete** (should show "Syncing..." then "Completed")
4. **Page should auto-reload** after 1 second
5. **Verify product count updated** (e.g., 15/15 products)

6. **Check server logs:**
   ```
   [Sync] Starting sync for catalog 123456789
   [Sync] ✅ Fetched 15 products from Shopify
   [Sync] ✅ Prepared 15 products for Facebook upload
   [Sync] ✅ Batch uploaded: 15 products
   [Sync] ✅ Sync complete! Total synced: 15 products
   ```

## Common Issues & Solutions

### Issue: No catalog_id in events

**Symptoms:**
- Events show in Facebook but no `catalog_id`
- Logs show: `[Track] No catalog found for pixel 987654321`

**Solutions:**
1. Check catalog exists in database:
   ```sql
   SELECT * FROM FacebookCatalog WHERE userId = 'your_user_id';
   ```
2. Verify `pixelEnabled = true`
3. Check `pixelId` matches your Facebook Pixel ID
4. Toggle "Tracking Pixel" OFF then ON in Catalog Manager

### Issue: Product IDs don't match

**Symptoms:**
- Events have `content_ids` but Facebook shows "Product not found"
- Catalog diagnostics show "Unmatched products"

**Solutions:**
1. Check product IDs in catalog:
   - Go to Facebook Catalog Manager
   - View products
   - Note the `retailer_id` format
2. Verify `content_ids` format matches:
   - Should be strings: `["123"]` not `[123]`
   - Should match `retailer_id` exactly
3. Re-sync catalog if products changed
4. Check variant mode (separate/grouped/first)

### Issue: Events not showing in Facebook

**Symptoms:**
- Server logs show success
- No events in Events Manager

**Solutions:**
1. Wait 5-10 minutes (Facebook has delay)
2. Check pixel ID is correct
3. Verify access token is valid
4. Check for Facebook API errors in logs
5. Use Test Events tool in Events Manager

### Issue: Sync shows 1 product instead of 15

**Symptoms:**
- Catalog shows "1/15 products"
- Facebook shows 15 products

**Solutions:**
1. Trigger a new sync (click Sync button)
2. Wait for page to auto-reload (1 second)
3. Check database:
   ```sql
   SELECT productCount FROM FacebookCatalog WHERE id = 'catalog_id';
   ```
4. If still wrong, manually update:
   ```sql
   UPDATE FacebookCatalog SET productCount = 15 WHERE id = 'catalog_id';
   ```

## Testing Commands

### Check Catalog in Database
```sql
SELECT 
  id, 
  catalogId, 
  name, 
  pixelId, 
  pixelEnabled, 
  productCount, 
  syncStatus 
FROM FacebookCatalog 
WHERE userId = 'your_user_id';
```

### Check Recent Events
```sql
SELECT 
  eventName, 
  productId, 
  value, 
  currency, 
  customData->>'catalog_id' as catalog_id,
  createdAt 
FROM Event 
WHERE appId = 'your_app_id' 
ORDER BY createdAt DESC 
LIMIT 10;
```

### Check App Settings
```sql
SELECT 
  metaPixelId, 
  metaPixelEnabled, 
  metaVerified,
  metaAccessToken IS NOT NULL as hasToken
FROM AppSettings 
WHERE appId = 'your_app_id';
```

## Facebook Test Events Tool

### How to Use

1. **Go to Events Manager** → Your Pixel
2. **Click "Test Events"** tab
3. **Copy test event code** (e.g., `TEST12345`)
4. **Add to Dashboard:**
   - Go to Pixelify Dashboard
   - Paste test event code in settings
   - Save

5. **Trigger events** on your store
6. **Watch Test Events** tab in real-time
7. **Verify event data:**
   - Event name
   - Custom data (catalog_id, content_ids)
   - User data (IP, user agent)
   - Timestamp

### What to Look For

✅ **Green checkmarks** - Event received successfully
✅ **catalog_id** present in custom_data
✅ **content_ids** array with product IDs
✅ **content_type: "product"**
✅ **value** and **currency** for e-commerce events
✅ **order_id** for Purchase events

❌ **Red X** - Event failed (check error message)
⚠️ **Yellow warning** - Event received but has issues

## Performance Benchmarks

### Expected Results

- **Event Latency:** < 2 seconds from trigger to Facebook
- **Catalog Sync:** 15 products in < 5 seconds
- **Event Quality Score:** 7.0+ (out of 10)
- **Match Rate:** 80%+ customer information matched

### Monitoring

Check these metrics daily:
- Total events sent (should match store activity)
- Event quality score (should stay above 7.0)
- Catalog sync status (should be "synced")
- Product count (should match Shopify)

## Next Steps After Testing

1. ✅ **All tests pass** → Enable AutoSync and monitor
2. ⚠️ **Some issues** → Review logs and fix configuration
3. ❌ **Major issues** → Contact support with logs

### Create Facebook Ads

Once testing is complete:

1. **Go to Ads Manager**
2. **Create new campaign:**
   - Objective: Sales
   - Campaign type: Catalog Sales
3. **Select your catalog**
4. **Choose product set** (or use all products)
5. **Set up Dynamic Ads:**
   - Retarget viewers
   - Retarget cart abandoners
   - Cross-sell to purchasers
6. **Launch campaign**

### Monitor Performance

- Check ROAS daily
- Review product performance
- Optimize product sets
- Adjust budgets based on results

## Support

Need help? Contact us:
- **Email:** support@warewe.online
- **Docs:** https://pixelify-red.vercel.app/docs
- **Facebook Help:** https://business.facebook.com/events_manager

---

**Last Updated:** January 15, 2026
**Testing Time:** ~15 minutes for full test suite
