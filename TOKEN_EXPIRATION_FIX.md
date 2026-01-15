# Facebook Token Expiration - Quick Fix Guide

## Problem

You're seeing this error:
```
Error validating access token: Session has expired on Thursday, 15-Jan-26 01:00:00 PST
Code: 190, Subcode: 463
```

## Why This Happens

Facebook access tokens expire after a certain period (typically 60 days). When the token expires, all Facebook API calls fail.

## ✅ Quick Fix (2 minutes)

### Step 1: Go to Dashboard
1. Navigate to `/app/dashboard` in your Pixelify app
2. Look for the "Facebook Connection" section

### Step 2: Reconnect Facebook
1. Click the **"Connect with Facebook"** button
2. Log in to Facebook (if not already logged in)
3. Authorize the app when prompted
4. Wait for "Connected" status

### Step 3: Verify Connection
1. Go back to Catalog Manager (`/app/catalog`)
2. You should see "Facebook Connected" with your profile
3. Try syncing a catalog - it should work now

## What Was Fixed

The system now:
1. ✅ Detects when token is expired
2. ✅ Shows clear error message with "Reconnect Facebook" button
3. ✅ Automatically updates all apps with new token when you reconnect
4. ✅ Provides helpful guidance instead of cryptic errors

## How to Reconnect (Detailed)

### Option 1: Facebook SDK (Recommended)

1. **Open Dashboard** (`/app/dashboard`)
2. **Click "Connect with Facebook"** button
3. **Facebook popup appears** - log in if needed
4. **Authorize permissions:**
   - ads_read
   - business_management
   - catalog_management
5. **Wait for success message**
6. **Token is automatically saved** to all your apps

### Option 2: Manual Token (Advanced)

If Facebook SDK doesn't work:

1. **Go to Facebook Events Manager**
   - Visit: https://business.facebook.com/events_manager
2. **Select your pixel**
3. **Click Settings → Conversions API**
4. **Generate new access token**
5. **Copy the token**
6. **Paste in Dashboard** when creating/editing pixel

## Prevention

To avoid token expiration in the future:

### 1. Use Long-Lived Tokens
- Facebook SDK automatically provides long-lived tokens (60 days)
- These are better than short-lived tokens (1 hour)

### 2. Reconnect Periodically
- Reconnect Facebook every 30-45 days
- Set a calendar reminder

### 3. Monitor Token Health
Check token status in Dashboard:
```sql
SELECT 
  a.name,
  s.metaTokenExpiresAt,
  CASE 
    WHEN s.metaTokenExpiresAt IS NULL THEN 'No expiry set'
    WHEN s.metaTokenExpiresAt < NOW() THEN 'EXPIRED ❌'
    WHEN s.metaTokenExpiresAt < NOW() + INTERVAL '7 days' THEN 'Expiring soon ⚠️'
    ELSE 'Valid ✅'
  END as status
FROM "App" a
JOIN "AppSettings" s ON s."appId" = a."id"
WHERE s."metaAccessToken" IS NOT NULL;
```

## Troubleshooting

### Issue: "Connect with Facebook" button doesn't work

**Solution:**
1. Clear browser cache and cookies
2. Try in incognito/private window
3. Check browser console for errors
4. Ensure Facebook SDK is loaded (check for `window.FB`)

### Issue: Token expires immediately after reconnecting

**Solution:**
1. Make sure you're using Facebook SDK (not manual token)
2. Check Facebook app settings for token expiration policy
3. Verify app has required permissions

### Issue: Some features work, others don't

**Solution:**
1. Check if token has all required permissions:
   - ads_read
   - business_management
   - catalog_management
   - pages_read_engagement
2. Reconnect with all permissions enabled

## Technical Details

### What Happens When Token Expires

1. **API Call Made** → Facebook API
2. **Facebook Returns** → Error 190 (Invalid token)
3. **System Detects** → Token expired error
4. **User Sees** → Clear error message with reconnect button
5. **User Reconnects** → New token saved
6. **System Works** → All features restored

### Token Storage

Tokens are stored in:
```typescript
AppSettings {
  metaAccessToken: string,
  metaTokenExpiresAt: DateTime | null
}
```

When you reconnect:
- New token is saved to ALL apps
- Old token is replaced
- Expiry date is updated (if available)

### Error Detection

The system detects token expiration by checking:
```typescript
error.code === 190 ||           // Invalid OAuth token
error.error_subcode === 463 ||  // Token expired
error.type === 'OAuthException' ||
error.message.includes('Session has expired')
```

## Support

If reconnecting doesn't fix the issue:

1. **Check Facebook App Status**
   - Visit: https://developers.facebook.com/apps
   - Ensure app is not restricted or disabled

2. **Verify Permissions**
   - App must have required permissions
   - Business must be verified

3. **Contact Support**
   - Email: support@warewe.online
   - Include: Error message, timestamp, steps tried

---

**Last Updated:** January 15, 2026
**Status:** ✅ Fixed - Reconnect Facebook to resolve
**Time to Fix:** 2 minutes
