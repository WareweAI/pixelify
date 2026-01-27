# Page Selector Fix - Omega Pixel Style

## Problem
1. "Choose Pages" button wasn't working
2. Shopify API error: "Access denied for pages field" - app doesn't have permission to query `pages`
3. No error handling for API failures

## Solution

### 1. Fixed Shopify API Permissions Issue
**Problem:** The app doesn't have `read_online_store_pages` scope, causing GraphQL errors.

**Solution:** Removed the `pages` query and added URL pattern-based system pages instead:
- `/products/*` - All product pages
- `/collections/*` - All collection pages  
- `/blogs/*` - All blog posts
- `/pages/*` - All custom pages

This approach is similar to Omega Pixel and doesn't require special permissions.

### 2. Improved Error Handling
- API always returns success with system pages as fallback
- Graceful degradation if collections/products can't be fetched
- Warning messages logged but don't break the UI
- Dashboard handles missing data gracefully

### 3. Added "Choose Pages" Button
Added the missing button in the dashboard that opens the page selector modal.

### 4. Better UX
- Button shows loading state while fetching pages
- Modal shows helpful message if no pages available
- "Add" button disabled if no pages selected
- Clear empty states and search feedback

## What Pages Are Available Now

### System Pages (Always Available)
- All Pages
- Home Page (/)
- Cart Page (/cart)
- Checkout Page (/checkout)
- Search Results (/search)
- Account Page (/account)
- Product Pages (/products/*)
- Collection Pages (/collections/*)
- Blog Posts (/blogs/*)
- Custom Pages (/pages/*)

### Dynamic Pages (If API succeeds)
- Specific collections from your store
- Specific products from your store

## How It Works

1. **On Dashboard Load:**
   - Fetches pages from `/api/shopify-pages`
   - API queries collections and products (no pages query)
   - Always returns system pages + any collections/products found
   - Logs warnings but never fails

2. **When Creating Pixel:**
   - Select "Selected Pages" or "Excluded Pages"
   - Click "Choose Pages" button
   - Modal opens with all available pages
   - Select pages and click "Add"

3. **URL Pattern Matching:**
   - Use wildcards (*) for pattern matching
   - `/products/*` matches all product pages
   - `/collections/summer-sale` matches specific collection
   - Flexible and doesn't require special permissions

## Testing

1. Open browser console
2. Refresh dashboard
3. Look for logs:
   ```
   [Dashboard] Fetching store pages from /api/shopify-pages...
   [Shopify Pages API] ✅ Fetched X pages (Y collections, Z products)
   [Dashboard] ✅ Loaded X pages from Shopify
   ```
4. Create new pixel
5. Select "Selected Pages"
6. Click "Choose Pages" button
7. Modal should open with system pages + your collections/products

## Benefits

✅ No special Shopify permissions required
✅ Works even if API fails
✅ Flexible URL pattern matching
✅ Better error handling
✅ Similar to Omega Pixel approach
✅ Always has fallback pages
