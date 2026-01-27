# Facebook Access Token Management

## Overview

This application implements automatic Facebook access token management to prevent "Session has expired" errors when sending events to Meta Conversions API (CAPI).

## Token Lifecycle

### 1. Initial Token Exchange (OAuth Flow)

When a user connects their Facebook account:

1. **OAuth Callback** (`app/routes/auth.facebook.callback.tsx`):
   - Receives short-lived token from Facebook OAuth
   - Immediately exchanges it for a **long-lived token** (60-day expiry)
   - Saves token and expiry date to database
   - Updates ALL user's pixels with the new token

2. **Manual Token Input** (`app/routes/api.dashboard.ts` - `save-facebook-token`):
   - When user manually enters a token in dashboard
   - Exchanges short-lived token for long-lived token
   - Saves with expiry date to database

### 2. Automatic Token Refresh

Tokens are automatically refreshed in multiple places:

#### A. During Event Tracking (`app/services/tracking.server.ts`)

Before sending events to Meta CAPI:
- Checks if token is expired
- If expired, attempts to refresh using `refreshMetaAccessToken()`
- Updates database with new token
- Continues with event sending using refreshed token

#### B. During Catalog Events (`app/services/catalog-event-handler.server.ts`)

When processing catalog events:
- `getCatalogMapping()` checks token expiry
- Refreshes if expired or expiring within 7 days
- Returns fresh token for catalog operations

#### C. Manual Refresh (Dashboard)

Users can manually refresh tokens:
- Click "Refresh Token" button in dashboard
- Calls `refresh-facebook-token` intent
- Uses `refreshAllUserTokens()` to refresh all tokens for the user

### 3. Background Token Refresh (Optional)

For production environments, set up a cron job:

```bash
# Call this endpoint daily to refresh expiring tokens
curl -X POST https://your-app.com/api/refresh-tokens \
  -H "Authorization: Bearer YOUR_CRON_SECRET"
```

Set `CRON_SECRET` environment variable for authentication.

## Token Refresh Logic

The refresh logic (`app/services/facebook-token-refresh.server.ts`) follows these rules:

1. **Check Expiry**: Token is considered "expiring" if:
   - No expiry date set (old tokens)
   - Expires within 7 days
   - Already expired

2. **Exchange Token**: Uses Facebook Graph API:
   ```
   GET /oauth/access_token?
     grant_type=fb_exchange_token&
     client_id={app_id}&
     client_secret={app_secret}&
     fb_exchange_token={current_token}
   ```

3. **Update Database**: Saves new token and expiry date to `AppSettings` table

4. **Error Handling**: If refresh fails:
   - Logs error
   - Continues with existing token (may fail)
   - User needs to reconnect Facebook if token is truly invalid

## Database Schema

```prisma
model AppSettings {
  metaAccessToken    String?   // Facebook access token
  metaTokenExpiresAt DateTime? // Token expiry timestamp
  // ... other fields
}
```

## Environment Variables

Required for token refresh:

```env
FACEBOOK_APP_ID=your_app_id
FACEBOOK_APP_SECRET=your_app_secret
CRON_SECRET=your_secret_for_cron_jobs # Optional, for background refresh
```

## User Experience

### Dashboard Display

- Shows "Token expires: [date]" under Facebook connection
- Shows "Expiring Soon" badge if token expires within 7 days
- "Refresh Token" button to manually refresh

### Automatic Handling

- Users don't need to do anything
- Tokens refresh automatically during event tracking
- No interruption to event sending

### Error Recovery

If token refresh fails:
1. User sees error in dashboard
2. Can click "Refresh Token" to retry
3. If still failing, needs to reconnect Facebook account

## Testing

### Test Token Expiry

1. Connect Facebook account
2. Check database for `metaTokenExpiresAt`
3. Manually set expiry to past date
4. Send test event - should auto-refresh
5. Check logs for refresh messages

### Test Manual Refresh

1. Connect Facebook account
2. Click "Refresh Token" in dashboard
3. Check logs for refresh success
4. Verify new expiry date in database

## Monitoring

Key log messages to monitor:

```
[Token Refresh] Token for app {id} expired or expiring soon, refreshing...
[Token Refresh] ✅ Token refreshed successfully for app {id}
[Token Refresh] ❌ Failed to refresh token for app {id}
[Tracking] Facebook access token expired, attempting refresh...
[Catalog Handler] Facebook access token expired or expiring soon, attempting refresh...
```

## Best Practices

1. **Set up cron job** to refresh tokens daily (prevents expiry)
2. **Monitor logs** for refresh failures
3. **Alert users** when tokens fail to refresh (email notification)
4. **Test regularly** by manually expiring tokens
5. **Document** for users to reconnect if refresh fails

## Troubleshooting

### "Session has expired" Error

**Cause**: Token expired and refresh failed

**Solution**:
1. Check if `FACEBOOK_APP_ID` and `FACEBOOK_APP_SECRET` are set
2. Verify app secret is correct
3. Check if user's Facebook account still has permissions
4. Ask user to reconnect Facebook account

### Token Not Refreshing

**Cause**: Refresh logic not being called

**Solution**:
1. Check if `metaTokenExpiresAt` is set in database
2. Verify token is actually expired or expiring soon
3. Check logs for refresh attempts
4. Ensure `refreshMetaAccessToken()` is being called

### All Tokens Failing

**Cause**: Facebook API issue or app configuration

**Solution**:
1. Check Facebook App status in Meta Developer Console
2. Verify app is not in development mode (if production)
3. Check if app secret was rotated
4. Test with fresh OAuth connection
