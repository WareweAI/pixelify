# Page Tracking Implementation for Pixel Creation

## Overview
Implemented page tracking functionality for event triggers when creating pixels (both manual and Facebook login methods), similar to Omega Pixel's functionality.

## Changes Made

### 1. Database Schema Updates (`prisma/schema.prisma`)
Added page tracking fields to `AppSettings` model:
- `trackingPages`: String field with default "all" (options: "all", "selected", "excluded")
- `selectedCollections`: JSON string array of collection IDs
- `selectedProductTypes`: JSON string array of product types
- `selectedProductTags`: JSON string array of product tags
- `selectedProducts`: JSON string array of product IDs

### 2. Dashboard UI Updates (`app/routes/app.dashboard.tsx`)

#### State Management
Updated `pixelForm` state to include:
```typescript
{
  pixelName: "",
  pixelId: "",
  trackingPages: "all",
  selectedCollections: [] as string[],
  selectedProductTypes: [] as string[],
  selectedProductTags: [] as string[],
  selectedProducts: [] as string[],
}
```

#### UI Components Added
After the "Tracking on pages" radio buttons, added conditional UI that shows when "Selected pages" or "Excluded pages" is chosen:

1. **Collection Selector**
   - Button: "+ Select collection(s)"
   - Shows count of selected/excluded collections

2. **Product Type Selector**
   - Button: "+ Product with Type(s)"
   - Shows count of selected/excluded product types

3. **Product Tag Selector**
   - Button: "+ Product with Tag(s)"
   - Shows count of selected/excluded product tags

4. **Product Selector**
   - Button: "+ Select Product(s)"
   - Shows count of selected/excluded products

All selectors are styled with:
- Light gray background (#f6f6f7)
- Rounded corners (8px)
- Proper spacing and padding

## How It Works

1. **User creates a pixel** (manual or via Facebook login)
2. **Chooses tracking option**:
   - **All pages**: Pixel fires on all pages (default)
   - **Selected pages**: Pixel only fires on selected collections/products/tags
   - **Excluded pages**: Pixel fires everywhere except selected collections/products/tags

3. **Selects specific pages** (if "Selected" or "Excluded" chosen):
   - Click "+ Select collection(s)" to choose collections
   - Click "+ Product with Type(s)" to choose product types
   - Click "+ Product with Tag(s)" to choose product tags
   - Click "+ Select Product(s)" to choose specific products

4. **Settings are saved** to the database in `AppSettings` table

## Next Steps (TODO)

The following functionality needs to be implemented:

1. **Collection Selector Modal**
   - Fetch collections from Shopify
   - Multi-select interface
   - Save selected collection IDs

2. **Product Type Selector Modal**
   - Fetch product types from Shopify
   - Multi-select interface
   - Save selected types

3. **Product Tag Selector Modal**
   - Fetch product tags from Shopify
   - Multi-select interface
   - Save selected tags

4. **Product Selector Modal**
   - Fetch products from Shopify
   - Search and filter interface
   - Multi-select with pagination
   - Save selected product IDs

5. **Backend API Updates**
   - Update pixel creation endpoint to save tracking settings
   - Add validation for tracking page settings
   - Store JSON arrays in database fields

6. **Frontend Script Updates**
   - Update pixel script to check tracking settings
   - Implement page matching logic
   - Only fire events on allowed pages

## Testing

To test the UI:
1. Go to Dashboard
2. Click "Add Facebook Pixel"
3. Choose manual or Facebook login method
4. Enter pixel details
5. Under "Tracking on pages", select "Selected pages" or "Excluded pages"
6. Verify that the 4 selector buttons appear
7. Verify that the UI updates when switching between tracking options

## Files Modified

1. `prisma/schema.prisma` - Added tracking fields to AppSettings
2. `app/routes/app.dashboard.tsx` - Added UI and state management
3. `app/routes/app.catalog.tsx` - Reverted (tracking only for pixels, not catalogs)
4. `app/routes/api.catalog.ts` - Reverted (tracking only for pixels, not catalogs)

## Screenshot Reference

The implementation matches the Omega Pixel screenshot provided, showing:
- Radio buttons for "All pages", "Selected pages", "Excluded pages"
- Expandable sections for collection/product/tag selection
- Clean, minimal UI with proper spacing
