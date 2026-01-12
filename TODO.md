# Custom Events Plan Upgrade Fix

## Issue
Users upgrading from free to paid plans were still seeing the demo interface in the custom events page instead of the full interface.

## Root Cause
The webhook that handles subscription updates was not properly mapping plan names from Shopify's subscription data to the internal plan names used in the app.

## Changes Made

### 1. Enhanced Plan Mapping in Webhook
- **File**: `app/routes/webhooks.app_subscriptions.update.tsx`
- **Change**: Improved the `getPlanNameFromSubscription` function to handle more flexible plan mapping
- **Details**:
  - Added support for various naming conventions (case variations, common Shopify patterns)
  - Added fallback logic to infer plan from line items when subscription name doesn't match
  - Enhanced logging for better debugging

### 2. Verified Custom Events Logic
- **File**: `app/routes/app.custom-events.tsx`
- **Verification**: Confirmed the logic `isFreePlan: app.plan === 'Free'` is correct
- **File**: `app/routes/app.debug-events.tsx`
- **Verification**: Confirmed free plan restrictions for custom event testing are correct

## Testing Steps
1. Test webhook with various subscription payloads
2. Verify plan updates in database
3. Check custom events page shows full interface for paid plans
4. Test debug events restrictions for free plans

## Expected Behavior After Fix
- Free plan users: See demo interface in custom events page
- Paid plan users: See full custom events interface with create/edit/delete functionality
- Plan upgrades: Immediately reflect in the UI after webhook processing
