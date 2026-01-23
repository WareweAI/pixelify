# Managed Pricing Discounts Guide

## Important: Your App Uses Managed Pricing

Your app uses Shopify's managed pricing model, which means:
- ✅ Billing is handled automatically through Shopify App Store
- ✅ Users can subscribe/unsubscribe easily
- ❌ You CANNOT use the Billing API to create charges or apply discounts programmatically

## How to Offer Discounts with Managed Pricing

### Option 1: Create Discount Codes in Partner Dashboard (Recommended)

1. Go to [Shopify Partner Dashboard](https://partners.shopify.com/)
2. Navigate to **Apps** → Select your app
3. Go to **Pricing** section
4. Click **Create discount code** or **Promotional pricing**
5. Set up your discount:
   - Discount percentage (e.g., 50% off)
   - Duration (e.g., first 3 months)
   - Code name (e.g., LAUNCH50)
6. Save and share the code with users

### Option 2: Display Discount Information in Your App

Update your pricing page to show available discount codes:

```tsx
<Banner tone="success">
  <p>
    <strong>Special Offer!</strong> Use code <code>LAUNCH50</code> for 50% off your first 3 months!
  </p>
  <p>
    Apply this code when subscribing through the Shopify pricing portal.
  </p>
</Banner>
```

### Option 3: Promotional Pricing Periods

In Partner Dashboard, you can set:
- Free trial periods (e.g., 14 days free)
- Introductory pricing (e.g., $9.99 for first month, then $20.99)
- Seasonal promotions

## What You CANNOT Do with Managed Pricing

❌ Create charges programmatically via Billing API
❌ Apply discounts via GraphQL mutations
❌ Customize billing cycles per user
❌ Offer user-specific pricing

## If You Need Programmatic Billing Control

You would need to:
1. Remove managed pricing from your app in Partner Dashboard
2. Implement API-based billing using `@shopify/shopify-app-react-router`
3. Handle all billing logic in your code
4. Resubmit app for review

**Note:** Most apps should stick with managed pricing as it's simpler and provides better user experience.

## Current Implementation

Your app currently redirects users to Shopify's pricing portal:
```
https://admin.shopify.com/store/{store}/charges/{app}/pricing_plans
```

Users can see and apply any discount codes you've created in Partner Dashboard at this URL.
