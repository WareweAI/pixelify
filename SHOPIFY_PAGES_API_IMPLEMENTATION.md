# Shopify Pages API Implementation

## Overview
Replaced hardcoded page options with dynamic data fetched from Shopify's GraphQL API. This allows the pixel tracking system to include/exclude pages based on actual store content.

## Changes Made

### 1. New GraphQL Query (`app/lib/queries.ts`)
Added `STORE_PAGES_QUERY` that fetches:
- Shop pages (up to 250)
- Collections (up to 250)
- Products (up to 250, active only)

### 2. New API Endpoint (`app/routes/api.shopify-pages.ts`)
Created dedicated endpoint `/api/shopify-pages` that:
- Authenticates with Shopify Admin API
- Fetches pages, collections, and products using GraphQL
- Returns structured page data with labels, values, types, and IDs
- Includes system pages (Home, Cart, Checkout, Search, Account)
- Handles errors gracefully with fallback to system pages only

### 3. Dashboard Updates (`app/routes/app.dashboard.tsx`)
- Added `storePages` state and `isLoadingPages` flag
- Created separate `useEffect` to fetch pages from `/api/shopify-pages`
- Removed dependency on `dashboardData.storePages`
- Fallback to system pages on error
- `pageTypeOptions` now uses dynamic `storePages` state

### 4. API Dashboard Cleanup (`app/routes/api.dashboard.ts`)
- Removed products/collections fetching from dashboard loader
- Removed `storePages` from dashboard response
- Removed `get-store-pages` intent from action handler
- Simplified to only fetch theme extension status
- Reduced API response size and improved performance

## Benefits

1. **Separation of Concerns**: Pages are fetched independently from dashboard data
2. **Better Performance**: Dashboard loads faster without fetching all pages/products
3. **Scalability**: Can handle up to 250 pages, collections, and products
4. **Error Handling**: Graceful fallback to system pages if Shopify API fails
5. **Maintainability**: Single source of truth for page data via dedicated endpoint

## API Response Format

```json
{
  "success": true,
  "pages": [
    {
      "label": "All Pages",
      "value": "all",
      "type": "system"
    },
    {
      "label": "Page: About Us",
      "value": "/pages/about-us",
      "type": "page",
      "id": "gid://shopify/Page/123"
    },
    {
      "label": "Collection: Summer Sale",
      "value": "/collections/summer-sale",
      "type": "collection",
      "id": "gid://shopify/Collection/456"
    },
    {
      "label": "Product: T-Shirt",
      "value": "/products/t-shirt",
      "type": "product",
      "id": "gid://shopify/Product/789"
    }
  ],
  "shopName": "My Store"
}
```

## Usage in Pixel Creation

When creating a pixel, users can now:
1. Select "All Pages" to track everywhere
2. Select specific pages from their actual Shopify store
3. Select specific collections to track
4. Select specific products to track

The page selector component receives the full list of available pages and allows multi-select for include/exclude targeting.
