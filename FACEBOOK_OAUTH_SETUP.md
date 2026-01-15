# Facebook OAuth Setup - Action Items

## ⚠️ CRITICAL: Complete These Steps for OAuth to Work

### 1. Switch App to Live Mode ✅ REQUIRED

**Why:** Development mode apps can't request advanced permissions from real users.

**How:**
1. Go to https://developers.facebook.com/apps/1751098928884384
2. Click the toggle at top right
3. Switch from "Development" to "Live"
4. Confirm

**Status:** ⏳ Do this NOW

---

### 2. Submit for catalog_management Permission ✅ REQUIRED

**Why:** This permission requires Facebook approval before OAuth can include it.

**How:**
1. Go to **App Review** → **Permissions and Features**
2. Find `catalog_management`
3. Click **Request Advanced Access**
4. Fill out form (see template below)
5. Submit

**Timeline:** 1-3 business days for approval

**Status:** ⏳ Do this NOW

---

### 3. Add OAuth Redirect URI ✅ REQUIRED

**Why:** Facebook needs to know where to send users after authorization.

**How:**
1. Go to **Facebook Login** → **Settings**
2. Add to **Valid OAuth Redirect URIs**:
   ```
   https://pixelify-red.vercel.app/auth/facebook/callback
   ```
3. Save

**Status:** ⏳ Do this NOW

---

### 4. Complete App Information ✅ REQUIRED

**Why:** Facebook requires these before approving permissions.

**How:**
1. Go to **Settings** → **Basic**
2. Fill in:
   - App Icon (1024x1024px)
   - Privacy Policy URL
   - Terms of Service URL
   - App Category: "Business and Pages" or "E-commerce"
3. Save

**Status:** ⏳ Do this NOW

---

## Permission Request Template

When requesting `catalog_management`, use this:

### How will you use this permission?

```
Our Shopify app (Pixelify) helps merchants sync their store products to Facebook 
Catalogs for Dynamic Product Ads. We need catalog_management permission to:

1. Create product catalogs on behalf of merchants
2. Sync product data (title, price, images, availability) from Shopify to Facebook
3. Update product information when merchants change prices or inventory
4. Enable merchants to run Dynamic Product Ads and retargeting campaigns

The permission is essential for our core functionality - without it, merchants 
cannot use Facebook Catalogs for their advertising campaigns.
```

### Provide step-by-step instructions

```
1. Merchant installs Pixelify app from Shopify App Store
2. Merchant opens the app and navigates to "Catalog" page
3. Merchant clicks "Connect with Facebook" button
4. OAuth flow opens, requesting permissions including catalog_management
5. Merchant authorizes the app
6. Merchant returns to app, clicks "Create Catalog"
7. App creates a catalog in merchant's Facebook Business Manager
8. Merchant clicks "Sync Products"
9. App fetches products from Shopify and uploads to Facebook Catalog
10. Products appear in Facebook Commerce Manager
11. Merchant can now create Dynamic Product Ads using the catalog
```

### Screencast/Screenshots

**Record a video showing:**
1. Clicking "Connect with Facebook"
2. Facebook permission dialog (showing catalog_management)
3. Creating a catalog
4. Syncing products
5. Products appearing in Facebook Commerce Manager

**Or provide screenshots of each step**

---

## Testing After Approval

### 1. Test OAuth Flow

```bash
# User clicks "Connect with Facebook"
# Should see permission dialog with:
- Manage your business
- Manage your catalogs ← Should appear
- Manage ads
- Read engagement data
```

### 2. Verify Token

```bash
# After OAuth, check token at:
https://developers.facebook.com/tools/debug/accesstoken/

# Should show:
- Scopes: ads_management, ads_read, business_management, catalog_management
- Expires: 60 days from now
- Valid: Yes
```

### 3. Test Catalog Creation

```bash
# In your app:
1. Go to Catalog page
2. Click "Create New Catalog"
3. Should work without errors
4. Catalog should appear in Facebook Commerce Manager
```

---

## Current Status Checklist

- [ ] App switched to Live mode
- [ ] OAuth redirect URI added
- [ ] App icon uploaded
- [ ] Privacy Policy URL added
- [ ] Terms of Service URL added
- [ ] catalog_management permission requested
- [ ] Waiting for Facebook approval (1-3 days)

---

## What Happens After Approval

### ✅ OAuth Will Work Automatically

Once approved:
1. Users click "Connect with Facebook"
2. Facebook shows permission dialog with catalog_management
3. Users authorize
4. Token is saved with all permissions
5. Catalog features work immediately
6. No manual token entry needed!

### ⚠️ Token Expiry

OAuth tokens expire in 60 days:
- App automatically exchanges for long-lived token (60 days)
- Users need to reconnect every 60 days
- Consider adding auto-refresh logic later

---

## Troubleshooting

### "Permission not granted" error

**Cause:** App not approved yet or not in Live mode

**Solution:**
1. Check app is in Live mode
2. Check permission status in App Review
3. Wait for approval if pending

### "Invalid redirect URI" error

**Cause:** Callback URL not registered

**Solution:**
1. Add `https://pixelify-red.vercel.app/auth/facebook/callback` to Valid OAuth Redirect URIs
2. Save and try again

### "App not found" error

**Cause:** App ID mismatch

**Solution:**
1. Verify FACEBOOK_APP_ID in .env matches your app
2. Should be: 1751098928884384

---

## Summary

**To make OAuth work with catalog_management:**

1. ✅ Switch app to Live mode (5 minutes)
2. ✅ Add OAuth redirect URI (2 minutes)
3. ✅ Complete app information (10 minutes)
4. ✅ Submit for catalog_management review (15 minutes)
5. ⏳ Wait for Facebook approval (1-3 days)
6. ✅ Test OAuth flow
7. 🎉 Users can connect with one click!

**Total time:** ~30 minutes of work + 1-3 days waiting for approval

After approval, OAuth will work perfectly and users won't need to create System User tokens!
