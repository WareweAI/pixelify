# Complete Facebook Token Flow - Testing Guide

## Overview

This document provides step-by-step testing procedures to verify that Facebook tokens are properly managed across disconnect, reconnect, and usage in all features (dashboard, catalog, tracking, proxy).

## System Architecture

### Token Storage
- **Database**: `AppSettings.metaAccessToken` and `metaAccessToken ExpiresAt`
- **localStorage**: `facebook_access_token`, `facebook_user`, `facebook_pixels`
- **Cache**: Dashboard, catalog, settings, app-settings caches

### Token Usage
- **Dashboard**: Display connection status, manage pixels
- **Catalog**: Create/sync catalogs, upload products
- **Tracking**: Send events to Meta CAPI
- **Proxy**: Track events from storefront

## Test 1: Disconnect Flow

### Steps

1. **Initial State**: Facebook connected
   ```
   ✓ Token in database
   ✓ Token in localStorage
   ✓ Dashboard shows "Facebook Connected"
   ```

2. **Click Disconnect Button**
   - Location: Dashboard → Facebook Connection Card → "Disconnect"

3. **Verify Database Cleared**
   ```sql
   SELECT metaAccessToken, metaTokenExpiresAt, metaPixelId, metaPixelEnabled 
   FROM AppSettings 
   WHERE appId IN (SELECT id FROM App WHERE userId = 'your_user_id');
   ```
   
   **Expected**:
   ```
   metaAccessToken: NULL
   metaTokenExpiresAt: NULL
   metaPixelId: NULL
   metaPixelEnabled: false
   ```

4. **Verify localStorage Cleared**
   - Open browser DevTools → Application → Local Storage
   - Check for:
     - `facebook_access_token` → Should be removed
     - `facebook_user` → Should be removed
     - `facebook_pixels` → Should be removed

5. **Verify Cache Cleared**
   - Check logs for:
     ```
     [Dashboard API] Disconnecting Facebook for user: user123
     [Dashboard API] Removed Facebook token from app: My Pixel
     [Dashboard API] Cleared all Facebook-related caches
     [Cache] Invalidated X keys matching pattern: dashboard:shop:
     [Cache] Invalidated X keys matching pattern: catalog:shop:
     ```

6. **Verify UI Updated**
   - Dashboard should show:
     ```
     [F] Facebook Not Connected [Disconnected]
         Connect your Facebook account to enable Meta Pixel
         tracking and catalog sync
         [Connect Facebook]
     ```

### Expected Results

✅ Token removed from database (all apps)
✅ localStorage cleared
✅ All caches invalidated
✅ UI shows "Not Connected" card
✅ "Connect Facebook" button visible

## Test 2: Reconnect Flow

### Steps

1. **Initial State**: Facebook disconnected (from Test 1)

2. **Click Connect Facebook Button**
   - Location: Dashboard → "Facebook Not Connected" card → "Connect Facebook"
   - OR: Dashboard header → "Connect Facebook" button

3. **Complete OAuth Flow**
   - Facebook login popup appears
   - Enter credentials
   - Authorize app
   - Popup closes

4. **Verify Token Saved to Database**
   ```sql
   SELECT metaAccessToken, metaTokenExpiresAt 
   FROM AppSettings 
   WHERE appId IN (SELECT id FROM App WHERE userId = 'your_user_id');
   ```
   
   **Expected**:
   ```
   metaAccessToken: "EAABsb..." (long string)
   metaTokenExpiresAt: "2025-03-28 10:00:00" (60 days from now)
   ```

5. **Verify Token Saved to localStorage**
   - Open browser DevTools → Application → Local Storage
   - Check for:
     - `facebook_access_token` → Should contain token
     - `facebook_user` → Should contain user info JSON
     - `facebook_pixels` → Should contain pixels array

6. **Verify Cache Cleared**
   - Check logs for:
     ```
     [Facebook OAuth] New token obtained, expires: 2025-03-28T10:00:00Z
     [Facebook OAuth] Updated token for app: My Pixel (pixel_123)
     [Facebook OAuth] Cleared all caches for fresh token data
     ```

7. **Verify UI Updated**
   - Dashboard should show:
     ```
     👤 Facebook Connected [✓ Active]
        Logged in as Your Name • 3 pixel(s) available
        Token expires: Mar 28, 2025
        [Refresh Token] [Disconnect]
     ```

### Expected Results

✅ Long-lived token (60 days) saved to database
✅ Token saved to all user's apps
✅ Token expiry date saved
✅ localStorage populated
✅ All caches cleared
✅ UI shows "Connected" card
✅ Token expiry displayed

## Test 3: Token Usage in Dashboard

### Steps

1. **Navigate to Dashboard**
   - URL: `/app/dashboard`

2. **Verify Connection Status**
   - Should show "Facebook Connected" card
   - Should display user name and picture
   - Should show token expiry date

3. **Create New Pixel**
   - Click "Create Pixel"
   - Select Facebook Pixel from dropdown
   - Verify pixels are loaded from Facebook API

4. **Validate Pixel**
   - Enter Pixel ID
   - Click "Validate"
   - Should successfully validate using token

### Expected Results

✅ Dashboard loads without errors
✅ Facebook connection status displayed
✅ Pixels fetched from Facebook API
✅ Pixel validation works

## Test 4: Token Usage in Catalog

### Steps

1. **Navigate to Catalog Page**
   - URL: `/app/catalog`

2. **Verify Facebook Connection**
   - Should show "Connected as [Your Name]"
   - Should display Facebook user info

3. **Fetch Businesses**
   - Click "Select Business"
   - Should load businesses from Facebook API

4. **Fetch Pixels**
   - Select a business
   - Should load pixels for that business

5. **Create Catalog**
   - Enter catalog name
   - Select pixel
   - Click "Create Catalog"
   - Should successfully create catalog on Facebook

6. **Sync Products**
   - Click "Sync Products"
   - Should upload products to Facebook catalog
   - Check logs for successful upload

### Expected Results

✅ Catalog page loads without errors
✅ Facebook user info displayed
✅ Businesses fetched successfully
✅ Pixels fetched successfully
✅ Catalog created on Facebook
✅ Products synced to catalog

## Test 5: Token Usage in Event Tracking

### Steps

1. **Send Test Event from Dashboard**
   - Go to Dashboard
   - Find a pixel with Meta Pixel enabled
   - Send a test event

2. **Verify Event Sent to Meta CAPI**
   - Check logs for:
     ```
     [Tracking] ✅ Event created: event-id for pixel: app
     [Meta CAPI] Sending event to Meta...
     [Meta CAPI] ✅ Success! events_received: 1
     ```

3. **Send Event from Storefront**
   - Visit your store
   - Trigger a PageView event
   - Check logs for event tracking

4. **Verify Token Refresh (if expired)**
   - Manually expire token in database:
     ```sql
     UPDATE AppSettings 
     SET metaTokenExpiresAt = NOW() - INTERVAL '1 day'
     WHERE appId = 'your_app_id';
     ```
   - Send test event
   - Check logs for automatic refresh:
     ```
     [Tracking] Facebook access token expired, attempting refresh...
     [Tracking] Facebook access token refreshed successfully
     ```

### Expected Results

✅ Events sent to Meta CAPI successfully
✅ No "Session expired" errors
✅ Token refreshes automatically if expired
✅ Events tracked from storefront

## Test 6: Token Usage in Catalog Events

### Steps

1. **Trigger Catalog Event**
   - Add product to cart on storefront
   - Or complete a purchase

2. **Verify Catalog Event Sent**
   - Check logs for:
     ```
     [Catalog Handler] Processing catalog event: AddToCart
     [Catalog Handler] Found catalog mapping for pixel
     [Catalog Handler] Event sent with catalog fields
     ```

3. **Verify Token Used**
   - Check logs for token retrieval:
     ```
     [Catalog Handler] Using token for catalog: catalog-id
     ```

4. **Verify Token Refresh (if expiring)**
   - Set token to expire soon:
     ```sql
     UPDATE AppSettings 
     SET metaTokenExpiresAt = NOW() + INTERVAL '3 days'
     WHERE appId = 'your_app_id';
     ```
   - Trigger catalog event
   - Check logs for:
     ```
     [Catalog Handler] Facebook access token expired or expiring soon, attempting refresh...
     [Catalog Handler] Facebook access token refreshed successfully
     ```

### Expected Results

✅ Catalog events sent successfully
✅ Token retrieved from database
✅ Token refreshes if expiring soon
✅ Catalog fields included in events

## Test 7: Complete Disconnect-Reconnect Cycle

### Steps

1. **Start Connected**
   - Verify Facebook connected
   - Verify token in database
   - Verify catalog working

2. **Disconnect**
   - Click "Disconnect"
   - Verify all cleared (database, localStorage, cache)

3. **Try Using Catalog (Should Fail)**
   - Go to Catalog page
   - Should show "Not Connected" message
   - Should prompt to connect Facebook

4. **Reconnect**
   - Click "Connect Facebook"
   - Complete OAuth
   - Verify token saved

5. **Use Catalog Again (Should Work)**
   - Go to Catalog page
   - Should show connected status
   - Should be able to create/sync catalogs

6. **Send Test Event (Should Work)**
   - Send event from dashboard
   - Should successfully send to Meta CAPI

### Expected Results

✅ Disconnect clears everything
✅ Features require reconnection
✅ Reconnect restores functionality
✅ All features work after reconnect

## Test 8: Token Expiry and Refresh

### Steps

1. **Check Current Token Expiry**
   ```sql
   SELECT metaTokenExpiresAt FROM AppSettings WHERE appId = 'your_app_id';
   ```

2. **Wait for Token to Expire** (or manually expire)
   ```sql
   UPDATE AppSettings 
   SET metaTokenExpiresAt = NOW() - INTERVAL '1 day'
   WHERE appId = 'your_app_id';
   ```

3. **Send Test Event**
   - Should automatically refresh token
   - Check logs for refresh

4. **Verify New Expiry Date**
   ```sql
   SELECT metaTokenExpiresAt FROM AppSettings WHERE appId = 'your_app_id';
   ```
   - Should be 60 days in future

5. **Manual Refresh**
   - Go to Dashboard
   - Click "Refresh Token"
   - Verify new expiry date displayed

### Expected Results

✅ Expired tokens refresh automatically
✅ New expiry date set (60 days)
✅ Manual refresh works
✅ UI shows updated expiry date

## Troubleshooting

### Issue: "Connect Facebook" button not showing after disconnect

**Solution**:
1. Clear browser cache
2. Reload page
3. Check console for errors
4. Verify `hasValidFacebookToken` is false in API response

### Issue: Token not saved to database after OAuth

**Solution**:
1. Check logs for OAuth callback errors
2. Verify `FACEBOOK_APP_ID` and `FACEBOOK_APP_SECRET` are set
3. Check redirect URI matches Facebook app settings
4. Verify user exists in database

### Issue: Catalog can't access token

**Solution**:
1. Verify token in database:
   ```sql
   SELECT metaAccessToken FROM AppSettings;
   ```
2. Check logs for token retrieval
3. Verify `getValidTokenForUser()` is working
4. Clear catalog cache

### Issue: Events failing with "Session expired"

**Solution**:
1. Check token expiry:
   ```sql
   SELECT metaTokenExpiresAt FROM AppSettings;
   ```
2. Manually refresh token from dashboard
3. Check logs for refresh attempts
4. Reconnect Facebook if refresh fails

## Success Criteria

All tests should pass with these results:

✅ Disconnect completely clears tokens and caches
✅ Reconnect saves tokens to database and localStorage
✅ Token available in dashboard, catalog, tracking, proxy
✅ Token refreshes automatically when expired
✅ Manual refresh works from dashboard
✅ UI shows correct connection status
✅ No "Session expired" errors
✅ All features work after reconnect

## Logs to Monitor

**Disconnect**:
```
[Dashboard API] Disconnecting Facebook for user: user123
[Dashboard API] Removed Facebook token from app: My Pixel
[Dashboard API] Cleared all Facebook-related caches
```

**Reconnect**:
```
[Facebook OAuth] New token obtained, expires: 2025-03-28T10:00:00Z
[Facebook OAuth] Updated token for app: My Pixel
[Facebook OAuth] Cleared all caches for fresh token data
```

**Token Usage**:
```
[Token Manager] Found token for app My Pixel
[Catalog Handler] Using token for catalog: catalog-id
[Tracking] Sending event to Meta CAPI with token
```

**Token Refresh**:
```
[Token Refresh] Token expired or expiring soon, refreshing...
[Token Refresh] ✅ Token refreshed successfully
```
