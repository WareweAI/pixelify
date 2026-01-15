# Facebook App Setup Checklist

## Critical: App Must Be "Live" for Catalog Management

### Check Your App Status

1. Go to [Facebook Developers](https://developers.facebook.com/apps)
2. Select your app (ID: 1751098928884384)
3. Check the top banner - it should say **"Live"** not "Development Mode"

**If it says "Development Mode":**
- Only developers/testers can use the app
- Catalog permissions may not work properly
- You need to switch to Live mode

### Switch to Live Mode

1. In your app dashboard, click **App Mode** toggle (top right)
2. Switch from "Development" to "Live"
3. Confirm the switch

---

## Required Permissions Setup

### 1. Add Permissions to Your App

1. Go to **App Dashboard** → **App Review** → **Permissions and Features**
2. Find these permissions and click **Request**:
   - `ads_management` - Usually auto-approved
   - `ads_read` - Usually auto-approved
   - `business_management` - Usually auto-approved
   - `catalog_management` - **Requires review**
   - `pages_read_engagement` - Usually auto-approved

### 2. Submit for Review (catalog_management)

The `catalog_management` permission requires Facebook review:

1. Click **Request** next to `catalog_management`
2. Fill out the form:
   - **How will you use this permission?**
     "Our app syncs Shopify products to Facebook Catalogs for Dynamic Product Ads. Users need this to create and manage their product catalogs."
   
   - **Provide step-by-step instructions:**
     ```
     1. User installs our Shopify app
     2. User connects their Facebook account
     3. User goes to Catalog page
     4. User creates a new catalog or connects existing one
     5. User syncs their Shopify products to Facebook Catalog
     6. Products appear in Facebook Commerce Manager
     ```
   
   - **Provide test credentials:**
     - Test Facebook account email
     - Test Facebook account password
     - Test Shopify store URL
   
   - **Screencast/Screenshots:**
     - Record a video showing the catalog sync flow
     - Or provide screenshots of each step

3. Submit for review
4. Wait 1-3 business days for approval

---

## Temporary Solution: Use System User Token

While waiting for Facebook approval, users can use System User tokens:

### Why System User Tokens Work:

- ✅ Bypass OAuth permission requirements
- ✅ Work even if app is in Development mode
- ✅ Never expire
- ✅ Full access to Business Manager assets

### How Users Get System User Token:

1. Go to [Facebook Business Settings](https://business.facebook.com/settings/system-users)
2. Create System User (Admin role)
3. Assign app, catalogs, pixels to System User
4. Generate token with all permissions
5. Paste token in your app's Dashboard

**This works immediately** - no waiting for Facebook approval!

---

## OAuth Flow (After Approval)

Once `catalog_management` is approved:

### Update OAuth Scopes

Your OAuth URL should request:
```
https://www.facebook.com/v18.0/dialog/oauth?
  client_id=YOUR_APP_ID
  &redirect_uri=YOUR_CALLBACK_URL
  &scope=ads_management,ads_read,business_management,catalog_management,pages_read_engagement
  &state=RETURN_URL
```

### Test OAuth Flow

1. User clicks "Connect with Facebook"
2. Facebook shows permission dialog
3. User sees: "Allow [Your App] to manage your catalogs"
4. User clicks "Continue"
5. Token is saved with catalog_management permission

---

## Verification Steps

### 1. Check App Mode
```
App Dashboard → Settings → Basic
Look for: "App Mode: Live" (green)
```

### 2. Check Permission Status
```
App Dashboard → App Review → Permissions and Features
catalog_management: Should show "Approved" (green checkmark)
```

### 3. Test Token
```
1. Get token from OAuth or System User
2. Go to: https://developers.facebook.com/tools/debug/accesstoken/
3. Paste token
4. Check "Scopes" includes: catalog_management
```

---

## Common Issues

### Issue: "Permission not granted"

**Cause:** App is in Development mode or permission not approved

**Solution:**
- Switch app to Live mode
- OR use System User token
- OR wait for permission approval

### Issue: "This permission is not available"

**Cause:** Permission not added to app

**Solution:**
- Go to App Review → Permissions and Features
- Request catalog_management permission
- Submit for review

### Issue: "App not approved for this permission"

**Cause:** Facebook hasn't approved your request yet

**Solution:**
- Check review status in App Dashboard
- Provide more details if requested
- Use System User token while waiting

---

## Recommended Approach

### For Production:

**Option 1: System User Token (Immediate)**
- ✅ Works right now
- ✅ No Facebook approval needed
- ✅ Never expires
- ✅ Best for production

**Option 2: OAuth (After Approval)**
- ⏳ Requires Facebook approval (1-3 days)
- ⏳ App must be Live
- ✅ Better user experience
- ⚠️ Tokens expire in 60 days

### Recommendation:

1. **Now**: Guide users to use System User tokens
2. **Later**: Submit app for review to get catalog_management approved
3. **Future**: Offer both options (OAuth for quick start, System User for production)

---

## Summary

**Why users need System User tokens:**
- Your app's `catalog_management` permission needs Facebook approval
- Until approved, OAuth won't include this permission
- System User tokens bypass this requirement

**What to do:**
1. Submit your app for `catalog_management` review
2. While waiting, guide users to use System User tokens
3. Once approved, OAuth will work automatically

**Timeline:**
- System User: Works immediately ✅
- OAuth: 1-3 days after Facebook approval ⏳
