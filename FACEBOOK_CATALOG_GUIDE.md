# Facebook Catalog Implementation Guide

## Overview

The Facebook Catalog feature allows you to sync your Shopify products to Facebook for Dynamic Product Ads. This enables retargeting campaigns, carousel ads, and automated product promotions on Facebook and Instagram.

---

## Prerequisites

Before using the Facebook Catalog feature, ensure you have:

1. **Facebook Business Manager Account**
   - Create one at [business.facebook.com](https://business.facebook.com)
   - You need admin access to create catalogs

2. **Facebook Access Token with Permissions**
   - Required permission: `catalog_management`
   - Generate at [Facebook Graph API Explorer](https://developers.facebook.com/tools/explorer/)
   - Token must be connected in the Dashboard

3. **Facebook Pixel Connected**
   - Connect your Meta Pixel in the Dashboard
   - Pixel should be tracking events on your store

4. **Active Products in Shopify**
   - At least one published product in your Shopify store

---

## Getting Started

### Step 1: Connect Facebook Account

1. Go to **Dashboard** in the app
2. Scroll to the **Facebook Integration** section
3. Enter your **Meta Access Token** (with `catalog_management` permission)
4. Enter your **Meta Pixel ID**
5. Click **Save Settings**

> **Important:** Make sure your access token has the `catalog_management` permission. Without it, you won't be able to create or manage catalogs.

---

## Method 1: Direct Catalog Sync (Recommended)

This method creates a catalog directly in Facebook and syncs products via API.

### Step 1: Navigate to Catalog Page

1. Open the app
2. Click **Catalog** in the navigation menu

### Step 2: Create or Connect a Catalog

You have two options:

#### Option A: Create New Catalog

1. Click **Create New Catalog** button
2. Enter a descriptive name (e.g., "My Store Products")
3. Click **Create Catalog**
4. Wait for confirmation

#### Option B: Use Existing Catalog

1. Click **Use Existing Catalog** button
2. Select a catalog from the dropdown
3. Click **Connect Catalog**

> **Warning:** If you connect to an existing catalog, products with the same ID will be overwritten.

### Step 3: Configure Product Selection

Choose which products to sync:

- **All Products** - Sync your entire product catalog
- **Selected Collections** - Choose specific collections to sync
- **In Stock Only** - Only sync products with available inventory

### Step 4: Sync Products

1. Click **Sync Products Now**
2. Wait for the sync to complete (progress bar will show status)
3. Check the success message for number of products synced

### Step 5: Verify in Facebook

1. Go to [Facebook Commerce Manager](https://business.facebook.com/commerce)
2. Select your catalog
3. Verify products are showing correctly

---

## Method 2: Feed URL (For Non-Admins)

If you don't have admin access to create catalogs, use this method.

### Step 1: Get Feed URL

1. Go to **Catalog** page
2. Click the **Product Feed** tab
3. Copy the **XML Feed URL**

### Step 2: Share with Admin

Send the feed URL to your Business Manager admin who will:

1. Go to [Facebook Commerce Manager](https://business.facebook.com/commerce)
2. Select the catalog
3. Click **Data Sources** → **Add Items**
4. Choose **Data Feed**
5. Paste your feed URL
6. Set update schedule (Daily recommended)
7. Click **Upload**

### Step 3: Verify Feed

After Facebook processes the feed:

1. Check the catalog in Commerce Manager
2. Verify products are imported correctly
3. Fix any errors shown in the feed diagnostics

---

## Product Feed Details

### What's Included in the Feed

Each product variant includes:

- **Basic Info**: Title, Description, Link
- **Images**: Featured image + up to 9 additional images
- **Pricing**: Price, Sale Price (if compare-at-price exists)
- **Inventory**: Availability status (in stock/out of stock)
- **Identifiers**: SKU, Barcode (GTIN), Product ID
- **Attributes**: Brand, Product Type, Color, Size
- **Grouping**: Item Group ID (groups variants together)

### Feed Format

The feed is generated in XML format compatible with Facebook's product feed specification:

```xml
<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0" xmlns:g="http://base.google.com/ns/1.0">
  <channel>
    <title>Your Store Product Feed</title>
    <item>
      <id>product-sku-123</id>
      <title>Product Name - Variant</title>
      <description>Product description...</description>
      <link>https://yourstore.com/products/product-name</link>
      <image_link>https://cdn.shopify.com/image.jpg</image_link>
      <price>29.99 USD</price>
      <availability>in stock</availability>
      <brand>Your Brand</brand>
      <!-- ... more fields -->
    </item>
  </channel>
</rss>
```

### Feed Updates

The feed automatically updates when:

- Products are added/removed
- Prices change
- Inventory levels change
- Product details are modified

Facebook will fetch updates based on your configured schedule (Daily/Weekly).

---

## Settings Configuration

### Catalog Sync Tab

**Product Selection:**
- Choose which products to include in sync
- Filter by collections or stock status

**Sync Actions:**
- **Sync Products Now** - Manual sync trigger
- **Disconnect Catalog** - Remove catalog connection

### Product Feed Tab

**Feed URL:**
- Copy the XML feed URL for manual setup
- Share with Business Manager admins

### Settings Tab

**Auto-sync Schedule:**
- **Daily** (Recommended) - Sync every 24 hours
- **Weekly** - Sync once per week
- **Manual Only** - Only sync when you click the button

**Product Data Mapping:**
- **Product Title** - Use Shopify title or SEO title
- **Product Description** - Use Shopify description or SEO description
- **Product Category** - Use Product Type or Google Category

**Advanced Options:**
- **Include product variants** - Sync all variants as separate items
- **Include additional images** - Add up to 10 images per product
- **Track inventory status** - Update availability based on stock

---

## Troubleshooting

### Error: "Missing Permission"

**Problem:** Access token doesn't have `catalog_management` permission.

**Solution:**
1. Go to [Facebook Graph API Explorer](https://developers.facebook.com/tools/explorer/)
2. Select your app
3. Click "Generate Access Token"
4. Check the `catalog_management` permission
5. Copy the new token
6. Update it in Dashboard settings

### Error: "No business accounts found"

**Problem:** Your Facebook account isn't added to any Business Manager.

**Solution:**
1. Go to [business.facebook.com](https://business.facebook.com)
2. Create a Business Manager account
3. Add yourself as an admin
4. Try creating the catalog again

### Products Not Syncing

**Problem:** Sync completes but products don't appear in catalog.

**Solution:**
1. Check that products are **Active** in Shopify
2. Verify products have images and prices
3. Check Facebook Commerce Manager for error messages
4. Try syncing a smaller batch first

### Feed URL Not Working

**Problem:** Facebook can't fetch the feed URL.

**Solution:**
1. Verify the URL is accessible (open in browser)
2. Check that your app is deployed and running
3. Ensure the `appId` in the URL is correct
4. Check Facebook's feed diagnostics for specific errors

### Catalog Shows Old Data

**Problem:** Changes in Shopify aren't reflected in Facebook.

**Solution:**
1. Click **Sync Products Now** to force an update
2. Check the "Last Sync" timestamp
3. Verify auto-sync schedule is enabled
4. For feed URL method, check Facebook's fetch schedule

---

## Best Practices

### 1. Product Data Quality

- Use high-quality product images (at least 1024x1024px)
- Write clear, descriptive product titles
- Include detailed product descriptions
- Add product variants (color, size) properly
- Use SKUs and barcodes when available

### 2. Catalog Organization

- Create separate catalogs for different product lines
- Use collections to organize products logically
- Keep product data consistent and up-to-date
- Remove discontinued products promptly

### 3. Sync Schedule

- Use **Daily** sync for stores with frequent changes
- Use **Weekly** sync for stable catalogs
- Manual sync after major product updates
- Monitor sync status regularly

### 4. Facebook Pixel Integration

- Ensure your pixel is tracking these events:
  - `ViewContent` - Product page views
  - `AddToCart` - Add to cart actions
  - `InitiateCheckout` - Checkout started
  - `Purchase` - Completed orders

- Connect your pixel to the catalog in Facebook Commerce Manager
- This enables dynamic retargeting based on user behavior

### 5. Testing

Before launching campaigns:

1. Verify all products appear in catalog
2. Check product images load correctly
3. Test product links work
4. Verify prices are accurate
5. Confirm inventory status is correct

---

## Dynamic Product Ads Setup

Once your catalog is synced, create Dynamic Product Ads:

### Step 1: Create Product Set

1. Go to Facebook Commerce Manager
2. Select your catalog
3. Click **Product Sets** → **Create Set**
4. Define filters (e.g., price range, product type)
5. Save the product set

### Step 2: Create Ad Campaign

1. Go to Facebook Ads Manager
2. Create new campaign with **Sales** objective
3. Choose **Catalog Sales** campaign type
4. Select your catalog
5. Choose your product set
6. Set up targeting and budget
7. Create ad creative (carousel, collection, etc.)

### Step 3: Set Up Retargeting

1. Create a Custom Audience based on pixel events:
   - Viewed products but didn't purchase
   - Added to cart but didn't checkout
   - Purchased specific products

2. Use these audiences in your Dynamic Ads
3. Show relevant products to each audience segment

---

## API Endpoints

For developers integrating with the catalog:

### XML Feed Endpoint

```
GET /api/catalog-feed/{appId}.xml
```

**Response:** XML feed with all active products

**Caching:** 1 hour

**Format:** RSS 2.0 with Facebook product feed schema

### Example Usage

```bash
# Fetch feed
curl https://your-app-url.com/api/catalog-feed/your-app-id.xml

# Validate feed
curl -I https://your-app-url.com/api/catalog-feed/your-app-id.xml
```

---

## Frequently Asked Questions

### Q: How many products can I sync?

A: Up to 5,000 products per sync. For larger catalogs, contact support.

### Q: How long does syncing take?

A: Typically 1-5 minutes depending on product count. Large catalogs may take longer.

### Q: Can I sync to multiple catalogs?

A: Currently, one catalog per app. Create multiple apps for multiple catalogs.

### Q: What happens to deleted products?

A: They remain in the catalog until you manually remove them or run a full sync.

### Q: Can I customize the feed format?

A: The feed follows Facebook's standard format. Custom fields can be added via custom labels.

### Q: Do I need a Facebook Shop?

A: No, catalogs work independently. But you can use the same catalog for Facebook Shops.

### Q: How do I track catalog performance?

A: Use Facebook Ads Manager to see metrics for Dynamic Product Ads using your catalog.

### Q: Can I exclude certain products?

A: Yes, use collection-based filtering or set products to "Draft" status in Shopify.

---

## Support

For additional help:

- Check Facebook's [Product Catalog Guide](https://www.facebook.com/business/help/1275400645914358)
- Review [Dynamic Ads Documentation](https://www.facebook.com/business/help/455326144628161)
- Contact app support for technical issues

---

## Changelog

### Version 1.0
- Initial catalog sync implementation
- XML feed generation
- Create/connect catalog functionality
- Product selection filters
- Auto-sync scheduling
