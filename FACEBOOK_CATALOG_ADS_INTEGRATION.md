# Facebook Catalog & Ads Integration

## Overview

Pixelify now automatically links all e-commerce events to your Facebook Catalog, enabling powerful Facebook Ads optimization and Dynamic Product Ads (DPA).

## How It Works

### 1. Catalog Creation & Product Sync

When you create a catalog through Pixelify:
- Products are synced from Shopify to Facebook Catalog
- Each product gets a unique `retailer_id` (SKU or product ID)
- Products include: name, price, image, URL, availability, brand
- Catalog is linked to your Facebook Pixel (if selected)

### 2. Event Tracking with Catalog Attribution

All e-commerce events automatically include catalog information:

#### **ViewContent** (Product Page Views)
```javascript
{
  event_name: "ViewContent",
  custom_data: {
    content_ids: ["product_123"],      // Product ID from catalog
    content_type: "product",
    content_name: "Product Name",
    value: 29.99,
    currency: "USD",
    catalog_id: "your_catalog_id"      // Links to your catalog
  }
}
```

#### **AddToCart** (Add to Cart)
```javascript
{
  event_name: "AddToCart",
  custom_data: {
    content_ids: ["product_123"],
    content_type: "product",
    value: 29.99,
    currency: "USD",
    num_items: 1,
    catalog_id: "your_catalog_id"
  }
}
```

#### **InitiateCheckout** (Checkout Started)
```javascript
{
  event_name: "InitiateCheckout",
  custom_data: {
    content_ids: ["product_123", "product_456"],
    content_type: "product",
    contents: [
      { id: "product_123", quantity: 2 },
      { id: "product_456", quantity: 1 }
    ],
    value: 89.97,
    currency: "USD",
    num_items: 3,
    catalog_id: "your_catalog_id"
  }
}
```

#### **Purchase** (Order Completed)
```javascript
{
  event_name: "Purchase",
  custom_data: {
    content_ids: ["product_123", "product_456"],
    content_type: "product",
    contents: [
      { id: "product_123", quantity: 2 },
      { id: "product_456", quantity: 1 }
    ],
    value: 89.97,
    currency: "USD",
    order_id: "order_12345",
    num_items: 3,
    catalog_id: "your_catalog_id"
  }
}
```

### 3. Automatic Catalog Linking

The system automatically:
1. Detects when an e-commerce event is triggered
2. Finds the active catalog linked to your Facebook Pixel
3. Includes the `catalog_id` in the event data
4. Ensures `content_ids` match the `retailer_id` in your catalog
5. Sends the event to Facebook via Conversions API (CAPI)

### 4. Adblocker-Proof Tracking

All events are sent via **Facebook Conversions API (CAPI)** from the server:
- ✅ Bypasses adblockers
- ✅ More accurate tracking
- ✅ Better data quality for Facebook Ads
- ✅ Improved ad performance and ROAS

## Benefits for Facebook Ads

### 1. Dynamic Product Ads (DPA)
- Show personalized ads with products users viewed
- Retarget cart abandoners with exact products
- Cross-sell related products automatically

### 2. Better Ad Optimization
- Facebook knows which products drive conversions
- Optimize for specific product categories
- Better audience targeting based on product interests

### 3. Improved ROAS
- More accurate conversion tracking
- Better attribution of sales to ads
- Optimized bidding based on product performance

### 4. Catalog Sales Campaigns
- Create campaigns that automatically promote your catalog
- Facebook selects best-performing products
- Automatic product recommendations

## Setup Requirements

### 1. Create a Catalog
1. Go to **Catalog Manager** in Pixelify
2. Click **Create Catalog**
3. Select your Facebook Business Account
4. Choose a Pixel (optional but recommended)
5. Name your catalog
6. Select variant submission mode
7. Click **Create Catalog**

### 2. Enable Pixel Tracking
1. In Catalog Manager, find your catalog
2. Toggle **Tracking Pixel** to ON
3. This links catalog events to your pixel

### 3. Enable AutoSync (Recommended)
1. Toggle **AutoSync** to ON
2. Products automatically sync every 5 days
3. Keeps catalog up-to-date with Shopify

### 4. Verify Events in Facebook
1. Go to **Events Manager** in Facebook
2. Select your Pixel
3. Click **Test Events**
4. Trigger events on your store (view product, add to cart, etc.)
5. Verify events show `catalog_id` in custom data

## Event Sources

Events are tracked from multiple sources:

### 1. Client-Side (Pixel Script)
- Tracks user interactions in real-time
- Includes: ViewContent, AddToCart, custom events
- Sent via CAPI from server (adblocker-proof)

### 2. Server-Side (Webhooks)
- Tracks backend events (100% accurate)
- Includes: AddToCart, InitiateCheckout, Purchase
- Automatically includes catalog information

### 3. Manual Tracking
- Custom events via API
- Can include catalog data manually

## Troubleshooting

### Events Not Showing Catalog ID
1. Check if catalog is created and synced
2. Verify pixel is linked to catalog (toggle ON)
3. Check logs for catalog lookup errors
4. Ensure `pixelEnabled: true` in database

### Products Not Matching
1. Verify `content_ids` match `retailer_id` in catalog
2. Check product sync status in Catalog Manager
3. Re-sync catalog if products changed
4. Ensure product IDs are strings, not numbers

### Ads Not Using Catalog
1. Create a **Catalog Sales** campaign in Facebook Ads
2. Select your catalog in campaign settings
3. Choose **Dynamic Ads** format
4. Set up product sets (optional)

## Best Practices

### 1. Keep Catalog Synced
- Enable AutoSync for automatic updates
- Manually sync after major product changes
- Monitor sync status in Catalog Manager

### 2. Use Consistent Product IDs
- Use SKUs if available (more stable)
- Ensure IDs match between Shopify and Facebook
- Don't change product IDs frequently

### 3. Include All Required Fields
- Price (in cents for CAPI)
- Currency
- Product name
- Image URL
- Product URL

### 4. Test Events Regularly
- Use Facebook Test Events tool
- Verify catalog_id is included
- Check content_ids match catalog products

### 5. Monitor Performance
- Check Events Manager for event quality
- Review catalog diagnostics in Facebook
- Monitor ad performance by product

## Advanced Features

### Product Sets
Create product sets in Facebook Catalog Manager:
- Group products by category, price, brand
- Target specific product sets in ads
- Create custom audiences based on product sets

### Custom Labels
Add custom labels to products:
- Best sellers
- New arrivals
- Seasonal products
- Sale items

### Feed Rules
Apply rules to modify product data:
- Adjust prices for ads
- Add prefixes/suffixes to titles
- Filter products by condition

## API Reference

### Catalog Sync Endpoint
```
POST /api/catalog
intent: sync-catalog
id: catalog_id
```

### Event Tracking Endpoint
```
POST /api/track
{
  appId: "your_app_id",
  eventName: "ViewContent",
  productId: "product_123",
  value: 29.99,
  currency: "USD"
}
```

### Webhook Events
- `orders/create` → Purchase event
- `checkouts/create` → InitiateCheckout event
- `carts/create` → AddToCart event

## Support

For issues or questions:
- Email: support@warewe.online
- Documentation: https://pixelify-red.vercel.app/docs
- Facebook Events Manager: https://business.facebook.com/events_manager

---

**Last Updated:** January 15, 2026
**Version:** 2.0
