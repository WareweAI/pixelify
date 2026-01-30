# Select Pages Functionality - Implementation Summary

## Overview
Successfully implemented "Select Pages" functionality for the Shopify Pixel app, allowing users to control which pages fire the Facebook Pixel, similar to Omega Pixel.

## What Was Implemented

### 1. Database Changes
- **Schema Update**: Added `selectedPages` field to `AppSettings` model in Prisma schema
- **Migration**: Created and applied database migration to add the new column
- **Storage Format**: Pages are stored as JSON array of path strings

### 2. GraphQL Queries
Added new queries to `app/lib/queries.ts`:
- `SHOPIFY_PAGES_QUERY`: Fetches Shopify pages with pagination and filtering
- `SEARCH_PAGES_QUERY`: Searches pages by query string
- Supports fetching page metadata including handle, title, and custom metafields

### 3. API Endpoints
Created `app/routes/api.shopify-pages.ts`:
- Fetches pages from Shopify Admin GraphQL API
- Supports pagination (`first`, `after` parameters)
- Supports search (`query` parameter)
- Returns page details with proper error handling

### 4. UI Components

#### Dashboard Updates (`app/routes/app.dashboard.tsx`)
- Added `selectedPages` to pixel form state
- Integrated page selector button in the pixel creation flow
- Updated PageSelector modal to handle both pixel creation and enhanced create flows
- Added logic to load Shopify pages on component mount
- Updated create pixel handler to include selectedPages in submission

#### Page Selector Component (`app/components/PageSelector.tsx`)
- Enhanced to support Shopify pages in addition to system/collection/product pages
- Groups pages by type for better organization
- Displays page count badges for each category
- Supports search/filtering across all page types

### 5. Pixel Script Updates

Updated both pixel script routes to include page filtering:
- `app/routes/apps.proxy.pixel[.]js.ts`
- `app/routes/apps.pixel[.]js.ts`

**Key Features:**
- Client-side page matching logic
- Support for wildcard patterns (e.g., `/products/*`)
- Three tracking modes:
  - `all`: Track on all pages (default)
  - `selected`: Track only on specified pages
  - `excluded`: Track on all pages except specified ones
- Debug logging for troubleshooting

### 6. Backend Logic

Updated `app/routes/api.dashboard.ts`:
- Modified `create-pixel` action to accept and save `trackingPages` and `selectedPages`
- Validates and stores page selection data
- Properly handles JSON serialization

## How It Works

### Page Selection Flow
1. User creates a new pixel
2. Chooses tracking mode: All pages / Selected pages / Excluded pages
3. If selected/excluded, clicks "+ Select Shopify Page(s)"
4. Modal opens showing:
   - System pages (Home, Cart, Checkout, etc.)
   - Shopify custom pages (fetched from API)
   - Collection pages
   - Product pages
5. User selects desired pages
6. Selection is saved as JSON array in database
7. Pixel script loads with page filtering configuration

### Runtime Behavior
When the pixel script loads on a page:
1. Checks `TRACKING_PAGES` mode
2. If not "all", evaluates current page path against `SELECTED_PAGES`
3. Supports exact matches and wildcard patterns
4. Returns true/false based on tracking mode
5. If false, skips all tracking events for that page

### Example Page Paths
```javascript
// Exact matches
"/pages/about"
"/pages/contact"
"/"

// Wildcard patterns
"/products/*"      // All product pages
"/collections/*"   // All collection pages
"/pages/*"         // All custom pages
"/blogs/*"         // All blog posts
```

## Files Modified

### Core Implementation
1. `prisma/schema.prisma` - Database schema
2. `app/lib/queries.ts` - GraphQL queries
3. `app/routes/api.shopify-pages.ts` - New API endpoint
4. `app/routes/api.dashboard.ts` - Pixel creation logic
5. `app/routes/app.dashboard.tsx` - Dashboard UI
6. `app/components/PageSelector.tsx` - Page selector component
7. `app/routes/apps.proxy.pixel[.]js.ts` - Pixel script
8. `app/routes/apps.pixel[.]js.ts` - Pixel script (alternate route)

### Documentation
9. `docs/SELECT_PAGES_FEATURE.md` - Feature documentation
10. `IMPLEMENTATION_SUMMARY.md` - This file

### Database
11. `prisma/migrations/20260128_add_selected_pages/migration.sql` - Migration file

## Testing Checklist

To verify the implementation:

- [ ] Create a pixel with "All pages" mode - should track everywhere
- [ ] Create a pixel with "Selected pages" mode
  - [ ] Select specific pages (e.g., /pages/about)
  - [ ] Visit selected page - should track
  - [ ] Visit non-selected page - should NOT track
- [ ] Create a pixel with "Excluded pages" mode
  - [ ] Select pages to exclude
  - [ ] Visit excluded page - should NOT track
  - [ ] Visit non-excluded page - should track
- [ ] Test wildcard patterns
  - [ ] Select `/products/*` - should track all product pages
  - [ ] Select `/collections/*` - should track all collection pages
- [ ] Check browser console for debug messages
  - [ ] `[PixelTracker] Page not tracked due to page selection rules`
  - [ ] `[PixelTracker] Tracking: PageView`

## Browser Console Debug Messages

When testing, look for these console messages:

**Page Tracked:**
```
[PixelTracker] Tracking: PageView {appId: "...", eventName: "PageView", ...}
[PixelTracker] ✅ Track response: 200
```

**Page Filtered:**
```
[PixelTracker] Page not tracked due to page selection rules
```

## API Endpoints

### Fetch Shopify Pages
```
GET /api/shopify-pages?first=50&query=about
```

Response:
```json
{
  "pages": [
    {
      "id": "gid://shopify/Page/123",
      "handle": "about",
      "title": "About Us",
      "bodySummary": "Learn more about us...",
      "createdAt": "2024-01-01T00:00:00Z",
      "updatedAt": "2024-01-15T00:00:00Z",
      "metafields": []
    }
  ],
  "pageInfo": {
    "hasNextPage": false,
    "hasPreviousPage": false,
    "startCursor": "...",
    "endCursor": "..."
  },
  "totalCount": 1
}
```

## Future Enhancements

Potential improvements for future iterations:

1. **Advanced Filtering**
   - URL query parameter matching
   - Regex pattern support
   - Page tag/metafield filtering

2. **Testing Tools**
   - Page preview/testing interface
   - Real-time tracking status indicator
   - Test mode for debugging

3. **Analytics**
   - Show which pages are being tracked
   - Track page selection effectiveness
   - Suggest optimal page selections

4. **Bulk Operations**
   - Select all pages by tag
   - Select all pages by metafield
   - Import/export page selections

5. **Performance**
   - Cache Shopify pages data
   - Lazy load page lists
   - Optimize GraphQL queries

## Notes

- The implementation follows Shopify best practices for app development
- All GraphQL queries use proper pagination
- Error handling is implemented at all levels
- Debug logging helps with troubleshooting
- The feature is backward compatible (defaults to "all pages")
- No breaking changes to existing pixels

## Support

For questions or issues:
- Check `docs/SELECT_PAGES_FEATURE.md` for detailed documentation
- Review browser console for debug messages
- Verify database schema with `npx prisma studio`
- Test API endpoints directly with tools like Postman
