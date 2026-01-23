# How to Use Shopify Discount Selector

## What This Does

Fetches discount codes that merchants have created in their Shopify admin (not app billing discounts) and allows them to select which discount codes to use/display.

## API Endpoint

**File:** `app/routes/api.shopify-discounts.ts`

### Available Intents:

1. **fetch-discounts** - Fetches code-based discounts (discount codes)
2. **fetch-automatic-discounts** - Fetches automatic discounts

## Component

**File:** `app/components/DiscountSelector.tsx`

A modal that displays all discount codes from the merchant's Shopify store with:
- Search/filter functionality
- Active vs Inactive discounts
- Discount value display
- Status badges
- Multi-select checkboxes

## Usage Example

### 1. Import the Component

```tsx
import { DiscountSelector } from "~/components/DiscountSelector";
```

### 2. Add State

```tsx
const [showDiscountSelector, setShowDiscountSelector] = useState(false);
const [selectedDiscountCodes, setSelectedDiscountCodes] = useState<string[]>([]);
```

### 3. Add Button to Open Modal

```tsx
<Button onClick={() => setShowDiscountSelector(true)}>
  {selectedDiscountCodes.length > 0 
    ? `Selected ${selectedDiscountCodes.length} discount codes` 
    : "Select Discount Codes"}
</Button>
```

### 4. Add the Component

```tsx
<DiscountSelector
  open={showDiscountSelector}
  onClose={() => setShowDiscountSelector(false)}
  onSelectDiscounts={(codes) => {
    setSelectedDiscountCodes(codes);
    console.log("Selected discount codes:", codes);
  }}
  initialSelectedDiscounts={selectedDiscountCodes}
/>
```

## Full Example

```tsx
import { useState } from "react";
import { Button, Card, BlockStack, Text } from "@shopify/polaris";
import { DiscountSelector } from "~/components/DiscountSelector";

export default function MyPage() {
  const [showDiscountSelector, setShowDiscountSelector] = useState(false);
  const [selectedDiscountCodes, setSelectedDiscountCodes] = useState<string[]>([]);

  return (
    <Card>
      <BlockStack gap="400">
        <Text as="h2" variant="headingMd">
          Apply Discount Codes
        </Text>
        
        <Button onClick={() => setShowDiscountSelector(true)}>
          {selectedDiscountCodes.length > 0 
            ? `Selected ${selectedDiscountCodes.length} discount codes` 
            : "Select Discount Codes"}
        </Button>

        {selectedDiscountCodes.length > 0 && (
          <Text as="p" tone="subdued">
            Selected codes: {selectedDiscountCodes.join(", ")}
          </Text>
        )}
      </BlockStack>

      <DiscountSelector
        open={showDiscountSelector}
        onClose={() => setShowDiscountSelector(false)}
        onSelectDiscounts={setSelectedDiscountCodes}
        initialSelectedDiscounts={selectedDiscountCodes}
      />
    </Card>
  );
}
```

## What Data is Returned

Each discount includes:
- `id` - Shopify discount ID
- `title` - Discount title
- `codes` - Array of discount codes (e.g., ["SUMMER50", "SAVE50"])
- `status` - ACTIVE, EXPIRED, SCHEDULED
- `startsAt` - Start date
- `endsAt` - End date
- `discountValue` - "50%" or "10 USD"
- `discountType` - "percentage" or "fixed"
- `usageLimit` - Max number of uses
- `appliesOncePerCustomer` - Boolean

## Use Cases

1. **Display available discounts to customers**
2. **Track which discount codes are being used**
3. **Apply specific discounts to certain products/collections**
4. **Show promotional codes in your app**
5. **Validate discount codes before checkout**

## Notes

- Only fetches discounts from the merchant's Shopify store
- Does NOT create or modify discounts
- Merchants must create discount codes in Shopify Admin first
- Inactive/expired discounts are shown but disabled for selection
