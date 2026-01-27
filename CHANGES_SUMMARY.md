# Facebook Token Management - Implementation Summary

## Problem

Users were experiencing "Error validating access token: Session has expired" errors when sending events to Meta Conversions API. The issue was caused by:

1. Short-lived Facebook tokens (1-2 hours) being saved directly without exchange
2. No automatic token refresh mechanism
3. Tokens expiring during event tracking

## Solution Implemented

### 1. Token Exchange on Save

**File**: `app/routes/api.dashboard.ts`

- Modified `save-facebook-token` intent to exchange short-lived tokens for long-lived tokens (60 days)
- Added token expiry date extraction and storage
- Returns expiry information to client

**Changes**:
- Calls Facebook Graph API to exchange tokens
- Debugs token to get expiry timestamp
- Saves both token and expiry date to database

### 2. Automatic Token Refresh in Catalog Handler

**File**: `app/services/catalog-event-handler.server.ts`

- Added token refresh logic to `getCatalogMapping()` function
- Checks if token is expired or expiring within 7 days
- Automatically refreshes before returning catalog mapping

**Changes**:
- Imported `refreshMetaAccessToken` from meta-capi service
- Added expiry check logic
- Updates database with refreshed token

### 3. Token Expiry Display in Dashboard

**File**: `app/routes/app.dashboard.tsx`

- Added `tokenExpiresAt` state variable
- Extracts token expiry from dashboard data
- Displays expiry date in Facebook connection card
- Shows "Expiring Soon" badge if token expires within 7 days
- Updated "Refresh" button to "Refresh Token" for clarity

**Changes**:
- New state: `const [tokenExpiresAt, setTokenExpiresAt] = useState<string | null>(null)`
- New effect to extract token expiry from apps data
- Updated Facebook connection card UI

### 4. Enhanced Token Refresh Function

**File**: `app/services/facebook-token-refresh.server.ts`

- Added `refreshAllExpiringTokens()` function for batch refresh
- Finds all tokens expiring within 7 days
- Refreshes them automatically
- Returns statistics (refreshed, failed, total)

**Changes**:
- New function for background/cron job usage
- Queries database for expiring tokens
- Processes all in batch

### 5. Token Refresh API Endpoint

**File**: `app/routes/api.refresh-tokens.ts` (NEW)

- Created new API endpoint for manual/cron token refresh
- Supports authentication via Bearer token
- Returns refresh statistics

**Usage**:
```bash
curl -X POST https://your-app.com/api/refresh-tokens \
  -H "Authorization: Bearer YOUR_CRON_SECRET"
```

### 6. Database Query Update

**File**: `app/routes/api.dashboard.ts`

- Updated SQL query to include `metaTokenExpiresAt` field
- Includes token expiry in transformed apps data
- Sent to client for display

## Files Modified

1. `app/routes/api.dashboard.ts` - Token exchange and query update
2. `app/routes/app.dashboard.tsx` - UI updates for token expiry display
3. `app/services/catalog-event-handler.server.ts` - Automatic refresh in catalog handler
4. `app/services/facebook-token-refresh.server.ts` - Batch refresh function
5. `app/routes/api.refresh-tokens.ts` - NEW: API endpoint for token refresh

## Files Already Implemented (No Changes Needed)

1. `app/routes/auth.facebook.callback.tsx` - Already exchanges for long-lived tokens ✅
2. `app/services/tracking.server.ts` - Already has token refresh logic ✅
3. `app/services/meta-capi.server.ts` - Already has `refreshMetaAccessToken()` function ✅
4. `app/services/facebook-token-refresh.server.ts` - Already has `checkAndRefreshToken()` ✅

## How It Works

### User Flow

1. **User connects Facebook**:
   - OAuth callback exchanges short-lived token for long-lived token (60 days)
   - Token and expiry saved to database
   - All user's pixels updated with new token

2. **User manually enters token**:
   - Dashboard exchanges token for long-lived version
   - Saves with expiry date
   - Shows expiry date in UI

3. **Automatic refresh during events**:
   - Before sending to Meta CAPI, checks if token expired
   - If expired, refreshes automatically
   - Updates database
   - Continues with event sending

4. **Manual refresh**:
   - User clicks "Refresh Token" button
   - Calls API to refresh all tokens
   - Updates UI with new expiry date

5. **Background refresh (optional)**:
   - Cron job calls `/api/refresh-tokens` daily
   - Refreshes all tokens expiring within 7 days
   - Prevents expiry before it happens

## Testing

### Test Token Exchange

1. Connect Facebook account via OAuth
2. Check database: `SELECT metaAccessToken, metaTokenExpiresAt FROM AppSettings;`
3. Verify expiry is ~60 days in future

### Test Automatic Refresh

1. Manually set token expiry to past: `UPDATE AppSettings SET metaTokenExpiresAt = NOW() - INTERVAL '1 day';`
2. Send test event from storefront
3. Check logs for: `[Tracking] Facebook access token expired, attempting refresh...`
4. Verify token refreshed in database

### Test Manual Refresh

1. Go to dashboard
2. Click "Refresh Token" button
3. Check logs for: `[Token Refresh] Refreshed X/Y tokens`
4. Verify new expiry date displayed

### Test Catalog Refresh

1. Set token expiry to past
2. Trigger catalog event (product view, add to cart)
3. Check logs for: `[Catalog Handler] Facebook access token expired or expiring soon, attempting refresh...`
4. Verify token refreshed

## Environment Variables Required

```env
FACEBOOK_APP_ID=your_facebook_app_id
FACEBOOK_APP_SECRET=your_facebook_app_secret
CRON_SECRET=your_secret_for_cron_jobs  # Optional, for background refresh
```

## Monitoring

Watch for these log messages:

**Success**:
- `[Token Refresh] ✅ Token refreshed successfully for app {id}`
- `[Tracking] Facebook access token refreshed successfully`
- `[Catalog Handler] Facebook access token refreshed successfully`

**Warnings**:
- `[Token Refresh] Token for app {id} expired or expiring soon, refreshing...`
- `[Tracking] Facebook access token expired, attempting refresh...`

**Errors**:
- `[Token Refresh] ❌ Failed to refresh token for app {id}`
- `Meta CAPI error: Error validating access token: Session has expired`

## Next Steps (Optional Enhancements)

1. **Email Notifications**: Send email to users when token refresh fails
2. **Dashboard Alert**: Show banner when token expires within 3 days
3. **Automatic Reconnect**: Redirect to Facebook OAuth when refresh fails
4. **Token Health Dashboard**: Show all tokens and their expiry status
5. **Webhook**: Set up Facebook webhook for token expiry notifications

## Documentation

Created `FACEBOOK_TOKEN_REFRESH.md` with:
- Complete token lifecycle explanation
- Refresh logic details
- Testing procedures
- Troubleshooting guide
- Best practices

## Result

✅ Tokens are now automatically exchanged for long-lived versions (60 days)
✅ Tokens refresh automatically before expiry
✅ Users can manually refresh tokens from dashboard
✅ Token expiry displayed in UI
✅ Background refresh available via cron job
✅ No more "Session has expired" errors during event tracking
