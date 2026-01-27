# Facebook Disconnect & Reconnect Fix

## Problem

When users clicked "Disconnect" on the Facebook connection in the dashboard:
- Token was only removed from localStorage (client-side)
- Token remained in database (server-side)
- Cache was not cleared
- "Connect Facebook" button didn't show up properly after disconnect
- Token couldn't be properly saved again for catalog use

## Solution Implemented

### 1. API Disconnect Handler

**File**: `app/routes/api.dashboard.ts`

Added new `disconnect-facebook` intent that:
- Removes `metaAccessToken` from database
- Removes `metaTokenExpiresAt` from database
- Removes `metaPixelId` from database
- Disables `metaPixelEnabled` flag
- Clears cache to force data refresh
- Applies to ALL user's apps/pixels

**Code**:
```typescript
if (intent === "disconnect-facebook") {
  // Remove Facebook tokens from all user's apps
  const apps = await prisma.app.findMany({
    where: { userId: user.id },
    include: { settings: true },
  });

  for (const app of apps) {
    if (app.settings) {
      await prisma.appSettings.update({
        where: { id: app.settings.id },
        data: { 
          metaAccessToken: null,
          metaTokenExpiresAt: null,
          metaPixelId: null,
          metaPixelEnabled: false,
        },
      });
    }
  }

  invalidateDashboardCache();
  return { success: true, message: "Facebook disconnected successfully" };
}
```

### 2. Dashboard Disconnect Handler

**File**: `app/routes/app.dashboard.tsx`

Updated `handleDisconnectFacebook` to:
- Call API to remove tokens from database
- Clear all local state variables
- Clear localStorage
- Clear token expiry state
- Reload page to reflect changes

**Code**:
```typescript
const handleDisconnectFacebook = useCallback(() => {
  // Call API to remove tokens from database
  fetcher.submit(
    { intent: "disconnect-facebook" },
    { method: "POST" }
  );

  // Clear local state
  setFacebookAccessToken("");
  setFacebookUser(null);
  setFacebookPixels([]);
  setIsConnectedToFacebook(false);
  setSelectedFacebookPixel("");
  setFacebookError("");
  setPixelValidationResult(null);
  setTokenExpiresAt(null);

  // Clear localStorage
  localStorage.removeItem("facebook_access_token");
  localStorage.removeItem("facebook_user");
  localStorage.removeItem("facebook_pixels");

  // Reload to reflect changes
  setTimeout(() => window.location.reload(), 500);
}, [fetcher]);
```

### 3. Disconnected State Detection

**File**: `app/routes/app.dashboard.tsx`

Updated the effect that checks for saved tokens to:
- Properly detect when no token exists (client or server)
- Set disconnected state explicitly
- Clear all Facebook-related state
- Show "Connect Facebook" button

**Code**:
```typescript
useEffect(() => {
  // If no saved token AND no server token, ensure disconnected state
  if (!savedToken && !hasValidFacebookToken) {
    console.log('[Dashboard] No Facebook connection found - showing Connect button');
    setIsConnectedToFacebook(false);
    setFacebookAccessToken("");
    setFacebookUser(null);
    setFacebookPixels([]);
    return;
  }
  // ... rest of logic
}, [mounted, fetcher, hasValidFacebookToken]);
```

### 4. Disconnected State UI

**File**: `app/routes/app.dashboard.tsx`

Added a card that shows when Facebook is disconnected:
- Shows "Facebook Not Connected" status
- Displays "Disconnected" badge
- Explains benefits of connecting
- Shows prominent "Connect Facebook" button

**UI**:
```
┌─────────────────────────────────────────────────────────────┐
│  [F]  Facebook Not Connected  [Disconnected]                │
│       Connect your Facebook account to enable Meta Pixel    │
│       tracking and catalog sync                             │
│                                          [Connect Facebook] │
└─────────────────────────────────────────────────────────────┘
```

## User Flow

### Disconnect Flow

1. User clicks "Disconnect" button
2. API removes tokens from database for all user's apps
3. Cache is invalidated
4. Local state cleared
5. localStorage cleared
6. Page reloads
7. Dashboard shows "Facebook Not Connected" card
8. "Connect Facebook" button appears

### Reconnect Flow

1. User clicks "Connect Facebook" button
2. OAuth flow starts
3. User authorizes app
4. Token exchanged for long-lived version (60 days)
5. Token saved to database with expiry date
6. Token available for:
   - Event tracking
   - Catalog sync
   - Meta CAPI
   - All pixels/apps
7. Dashboard shows "Facebook Connected" card

## Database Changes

When disconnecting, these fields are cleared:

```sql
UPDATE AppSettings SET
  metaAccessToken = NULL,
  metaTokenExpiresAt = NULL,
  metaPixelId = NULL,
  metaPixelEnabled = FALSE
WHERE appId IN (SELECT id FROM App WHERE userId = ?);
```

When reconnecting, these fields are set:

```sql
UPDATE AppSettings SET
  metaAccessToken = 'EAABsb...',
  metaTokenExpiresAt = '2025-03-28 10:00:00',
  metaPixelId = '123456789',
  metaPixelEnabled = TRUE
WHERE appId IN (SELECT id FROM App WHERE userId = ?);
```

## Cache Invalidation

The disconnect handler calls `invalidateDashboardCache()` which:
- Clears all cached dashboard data
- Forces fresh data fetch on next load
- Ensures UI reflects database state
- Prevents stale token display

## Testing

### Test Disconnect

1. Connect Facebook account
2. Verify token in database:
   ```sql
   SELECT metaAccessToken, metaTokenExpiresAt FROM AppSettings;
   ```
3. Click "Disconnect" in dashboard
4. Verify token removed from database
5. Verify "Connect Facebook" button appears
6. Verify localStorage cleared

### Test Reconnect

1. After disconnecting, click "Connect Facebook"
2. Complete OAuth flow
3. Verify new token in database
4. Verify token expiry date set
5. Verify "Facebook Connected" card appears
6. Send test event - should work with new token

### Test Catalog Integration

1. Disconnect and reconnect Facebook
2. Go to Catalog page
3. Verify catalog can access token
4. Create/sync catalog
5. Verify events sent to Meta with token

## Benefits

✅ **Complete Cleanup**: Tokens removed from both client and server
✅ **Cache Cleared**: No stale data displayed
✅ **Proper UI State**: Shows correct connection status
✅ **Easy Reconnect**: Clear button to connect again
✅ **Catalog Ready**: New token immediately available for catalog
✅ **All Apps Updated**: Token applied to all user's pixels
✅ **Token Expiry Tracked**: New token includes expiry date

## Files Modified

1. `app/routes/api.dashboard.ts` - Added disconnect-facebook intent
2. `app/routes/app.dashboard.tsx` - Updated disconnect handler and UI

## Logs to Monitor

**Disconnect**:
```
[Dashboard API] Disconnecting Facebook for user: user123
[Dashboard API] Removed Facebook token from app: My Pixel
[Dashboard] No Facebook connection found - showing Connect button
```

**Reconnect**:
```
[Facebook OAuth] New token obtained, expires: 2025-03-28T10:00:00Z
[Facebook OAuth] Updated token for app: My Pixel (pixel_123)
[Dashboard] Found saved Facebook token, restoring connection...
```

## Security

- Tokens completely removed from database on disconnect
- No orphaned tokens left in system
- Fresh OAuth required for reconnect
- New long-lived token generated each time
- Token expiry tracked for automatic refresh

## Next Steps

After disconnect and reconnect:
1. ✅ Token saved in database
2. ✅ Token available for catalog
3. ✅ Token available for event tracking
4. ✅ Token expiry tracked
5. ✅ Automatic refresh enabled
6. ✅ UI shows correct status
