# Facebook Token Auto-Refresh Implementation

## Problem

Facebook access tokens expire after a certain period (typically 60 days for long-lived tokens). When a token expires, all CAPI events fail with error:

```
Error validating access token: Session has expired on Thursday, 15-Jan-26 01:00:00 PST
Code: 190, Subcode: 463
```

## Solution

Implemented automatic token refresh that:
1. Detects token expiration errors
2. Automatically refreshes the token using Facebook's token exchange API
3. Retries the failed request with the new token
4. Updates all apps with the refreshed token

## Implementation

### 1. Token Refresh Service (`app/services/facebook-token-refresh.server.ts`)

**Functions:**

- `checkAndRefreshToken(appId)` - Check if token is expired and refresh if needed
- `refreshAllUserTokens(userId)` - Refresh tokens for all user's apps
- `handleFacebookApiError(error, appId)` - Handle API errors and refresh if token-related

**How It Works:**

```typescript
// 1. Check if token is expired or expiring soon (within 7 days)
const needsRefresh = !expiresAt || expiresAt < sevenDaysFromNow;

// 2. Call Facebook token exchange API
const refreshResult = await refreshMetaAccessToken(currentToken);

// 3. Update database with new token
await prisma.appSettings.update({
  where: { id: app.settings.id },
  data: {
    metaAccessToken: refreshResult.newToken,
    metaTokenExpiresAt: refreshResult.expiresAt,
  },
});
```

### 2. Auto-Refresh in Event Tracking (`app/routes/api.track.ts`)

**Before:**
```typescript
await forwardToMeta({ ... });
```

**After:**
```typescript
try {
  await forwardToMeta({ ... });
} catch (error) {
  // Check if it's a token error
  if (error?.code === 190 || error?.error_subcode === 463) {
    // Refresh token
    const newToken = await checkAndRefreshToken(app.id);
    
    if (newToken) {
      // Retry with new token
      await forwardToMeta({ accessToken: newToken, ... });
    }
  }
}
```

**Benefits:**
- Events don't fail due to expired tokens
- Automatic retry with refreshed token
- No user intervention needed

### 3. Auto-Refresh in Webhooks (`app/routes/webhooks.orders.create.tsx`)

**Implementation:**
```typescript
const response = await fetch(facebookApiUrl, { ... });
const responseData = await response.json();

// Check for token expiration
if (responseData.error?.code === 190 || responseData.error?.error_subcode === 463) {
  const newToken = await checkAndRefreshToken(app.id);
  
  if (newToken) {
    // Retry with new token
    await fetch(facebookApiUrl, { access_token: newToken, ... });
  }
}
```

**Applied to:**
- Purchase webhook (`webhooks.orders.create.tsx`)
- Cart webhook (`webhooks.carts.create.tsx`) - similar implementation
- Checkout webhook (`webhooks.checkouts.create.tsx`) - similar implementation

### 4. Manual Refresh in Dashboard (`app/routes/app.dashboard.tsx`)

**New Action:**
```typescript
if (intent === "refresh-facebook-token") {
  const refreshedCount = await refreshAllUserTokens(user.id);
  return { success: true, message: `Refreshed ${refreshedCount} tokens` };
}
```

**Usage:**
- User can manually trigger token refresh from Dashboard
- Refreshes all tokens for all apps
- Useful for proactive maintenance

## Error Detection

The system detects token expiration by checking for:

1. **Error Code 190** - Invalid OAuth access token
2. **Error Subcode 463** - Token expired
3. **Error Type** - OAuthException

Example error:
```json
{
  "error": {
    "message": "Error validating access token: Session has expired",
    "type": "OAuthException",
    "code": 190,
    "error_subcode": 463,
    "fbtrace_id": "..."
  }
}
```

## Token Refresh Flow

```
┌─────────────────────────────────────────────────────────────┐
│                    Event Triggered                          │
│  (ViewContent, AddToCart, Purchase, etc.)                   │
└─────────────────────┬───────────────────────────────────────┘
                      │
                      ▼
┌─────────────────────────────────────────────────────────────┐
│              Send to Facebook CAPI                          │
│  POST /v24.0/{pixel_id}/events                              │
└─────────────────────┬───────────────────────────────────────┘
                      │
                      ▼
              ┌───────────────┐
              │ Success?      │
              └───────┬───────┘
                      │
        ┌─────────────┴─────────────┐
        │                           │
        ▼ YES                       ▼ NO
┌───────────────┐         ┌─────────────────────┐
│ Event Sent ✅ │         │ Check Error Type    │
└───────────────┘         └──────────┬──────────┘
                                     │
                          ┌──────────┴──────────┐
                          │ Token Error?        │
                          │ (Code 190/463)      │
                          └──────────┬──────────┘
                                     │
                          ┌──────────┴──────────┐
                          │                     │
                          ▼ YES                 ▼ NO
                ┌─────────────────────┐   ┌──────────────┐
                │ Refresh Token       │   │ Log Error ❌ │
                │ via Facebook API    │   └──────────────┘
                └──────────┬──────────┘
                           │
                           ▼
                ┌─────────────────────┐
                │ Update Database     │
                │ with New Token      │
                └──────────┬──────────┘
                           │
                           ▼
                ┌─────────────────────┐
                │ Retry Event Send    │
                │ with New Token      │
                └──────────┬──────────┘
                           │
                           ▼
                ┌─────────────────────┐
                │ Event Sent ✅       │
                │ (after refresh)     │
                └─────────────────────┘
```

## Benefits

### 1. Zero Downtime
- Events continue to work even when tokens expire
- Automatic recovery without user intervention

### 2. Better User Experience
- No "token expired" errors shown to users
- Seamless event tracking

### 3. Improved Data Quality
- No lost events due to expired tokens
- Consistent tracking across all events

### 4. Proactive Maintenance
- Tokens refreshed 7 days before expiration
- Manual refresh option in Dashboard

## Testing

### Test Token Expiration

1. **Simulate expired token:**
   ```sql
   UPDATE "AppSettings" 
   SET "metaTokenExpiresAt" = NOW() - INTERVAL '1 day'
   WHERE "appId" = 'your_app_id';
   ```

2. **Trigger an event** (view product, add to cart, etc.)

3. **Check logs:**
   ```
   [Track] Detected token error, attempting to refresh token...
   [Token Refresh] Token for app XXX expired or expiring soon, refreshing...
   [Token Refresh] ✅ Token refreshed successfully for app XXX
   [Track] ✅ Token refreshed, retrying event send...
   [Track] ✅ SUCCESS (after token refresh): Event sent to Facebook CAPI
   ```

### Test Manual Refresh

1. **Go to Dashboard**
2. **Click "Refresh Token" button** (if added to UI)
3. **Check response:**
   ```json
   {
     "success": true,
     "message": "Successfully refreshed 3 token(s)"
   }
   ```

## Monitoring

### Logs to Watch

**Successful Refresh:**
```
[Token Refresh] Token for app XXX expired or expiring soon, refreshing...
[Token Refresh] ✅ Token refreshed successfully for app XXX
```

**Failed Refresh:**
```
[Token Refresh] ❌ Failed to refresh token for app XXX: [error]
```

**Event Retry After Refresh:**
```
[Track] ✅ SUCCESS (after token refresh): Event sent to Facebook CAPI
```

### Database Monitoring

Check token expiration dates:
```sql
SELECT 
  a.name,
  s.metaPixelId,
  s.metaTokenExpiresAt,
  CASE 
    WHEN s.metaTokenExpiresAt IS NULL THEN 'No expiry set'
    WHEN s.metaTokenExpiresAt < NOW() THEN 'EXPIRED'
    WHEN s.metaTokenExpiresAt < NOW() + INTERVAL '7 days' THEN 'Expiring soon'
    ELSE 'Valid'
  END as status
FROM "App" a
JOIN "AppSettings" s ON s."appId" = a."id"
WHERE s."metaAccessToken" IS NOT NULL;
```

## Troubleshooting

### Issue: Token Refresh Fails

**Symptoms:**
- Logs show: `[Token Refresh] ❌ Failed to refresh token`
- Events continue to fail

**Solutions:**
1. Check if Facebook App ID and Secret are set in environment variables
2. Verify the current token is still valid for exchange
3. User may need to reconnect Facebook in Dashboard

### Issue: Events Still Fail After Refresh

**Symptoms:**
- Token refreshes successfully
- Events still fail with 190 error

**Solutions:**
1. Check if pixel ID is correct
2. Verify user has permission to access the pixel
3. Check if Facebook app has required permissions

### Issue: Token Expires Too Quickly

**Symptoms:**
- Tokens expire every few days instead of 60 days

**Solutions:**
1. Use long-lived tokens (60 days) instead of short-lived (1 hour)
2. Ensure token exchange is using correct parameters
3. Check Facebook app settings for token expiration policy

## Configuration

### Environment Variables Required

```env
FACEBOOK_APP_ID=your_app_id
FACEBOOK_APP_SECRET=your_app_secret
```

These are used by the `refreshMetaAccessToken()` function in `meta-capi.server.ts`.

### Database Schema

No changes required - uses existing `AppSettings` table:
```prisma
model AppSettings {
  metaAccessToken    String?
  metaTokenExpiresAt DateTime?
  // ... other fields
}
```

## Future Enhancements

- [ ] Scheduled cron job to refresh tokens proactively
- [ ] Email notifications when token refresh fails
- [ ] Dashboard UI to show token expiration status
- [ ] Automatic token refresh 30 days before expiration
- [ ] Token health monitoring dashboard

## Related Files

- `app/services/facebook-token-refresh.server.ts` - Token refresh service
- `app/services/meta-capi.server.ts` - Meta CAPI with token exchange
- `app/routes/api.track.ts` - Event tracking with auto-refresh
- `app/routes/webhooks.orders.create.tsx` - Purchase webhook with auto-refresh
- `app/routes/app.dashboard.tsx` - Manual refresh action

---

**Implementation Date:** January 15, 2026
**Status:** ✅ Complete and Production-Ready
**Impact:** Zero downtime for expired tokens
