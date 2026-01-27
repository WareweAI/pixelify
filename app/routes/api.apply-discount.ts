import { ActionFunctionArgs, LoaderFunctionArgs } from "react-router";
import { authenticate } from "../shopify.server";

// This is an API route - only POST requests are allowed
export const loader = async ({ request }: LoaderFunctionArgs) => {
  return Response.json({ error: "Method not allowed. Use POST." }, { status: 405 });
};

export const action = async ({ request }: ActionFunctionArgs) => {
  const { session, admin } = await authenticate.admin(request);

  const formData = await request.formData();
  const code = formData.get("code") as string;
  const planName = formData.get("planName") as string || "Basic";

  if (!code) {
    return { success: false, message: 'Discount code is required' };
  }

  try {
    // Validate the discount code exists in Shopify
    const discountResponse = await admin.graphql(`
      query discountCode($code: String!) {
        codeDiscountNodeByCode(code: $code) {
          id
          codeDiscount {
            ... on DiscountCodeBasic {
              title
              codes(first: 1) {
                nodes {
                  code
                }
              }
              status
              customerGets {
                value {
                  ... on DiscountPercentage {
                    percentage
                  }
                  ... on DiscountAmount {
                    amount {
                      amount
                      currencyCode
                    }
                  }
                }
              }
            }
          }
        }
      }
    `, {
      variables: { code }
    });

    const discountData = await discountResponse.json();

    if ((discountData as any).errors) {
      console.error('GraphQL errors validating discount:', (discountData as any).errors);
      return { success: false, message: 'Unable to validate discount code. Please try again later.' };
    }

    if (!discountData.data?.codeDiscountNodeByCode?.codeDiscount) {
      return { success: false, message: 'Discount code not found. Please check the code and try again.' };
    }

    const discount = discountData.data.codeDiscountNodeByCode.codeDiscount;

    // Check if it's active
    if (discount.status !== 'ACTIVE') {
      return { success: false, message: 'This discount code is no longer active or has expired.' };
    }

    // Extract discount value
    const customerGets = discount.customerGets?.value;
    let discountPercentage = 0;
    
    if (customerGets?.percentage !== undefined) {
      // Percentage is returned as decimal (0.1 = 10%, 0.2 = 20%)
      discountPercentage = customerGets.percentage * 100;
    } else if (customerGets?.amount) {
      return { success: false, message: 'Fixed amount discounts are not supported for app subscriptions. Please use percentage-based discounts.' };
    } else {
      return { success: false, message: 'Invalid discount configuration. Please contact support.' };
    }

    if (discountPercentage <= 0 || discountPercentage > 100) {
      return { success: false, message: `Invalid discount percentage: ${discountPercentage}%. Must be between 1-100%.` };
    }

    console.log(`[Apply Discount] Code: ${code}, Percentage: ${discountPercentage}%`);

    // Define plan prices
    const planPrices: Record<string, number> = {
      "Basic": 20.99,
      "Advance": 55.99,
    };

    const basePrice = planPrices[planName] || 20.99;
    const discountedPrice = basePrice * (1 - discountPercentage / 100);

    console.log(`[Apply Discount] Plan: ${planName}, Base: $${basePrice}, Discounted: $${discountedPrice.toFixed(2)}`);

    // Create app subscription with discount using GraphQL
    const mutation = `
      mutation AppSubscriptionCreate($name: String!, $returnUrl: URL!, $test: Boolean, $lineItems: [AppSubscriptionLineItemInput!]!) {
        appSubscriptionCreate(
          name: $name
          returnUrl: $returnUrl
          test: $test
          lineItems: $lineItems
        ) {
          appSubscription {
            id
            name
            status
            test
          }
          confirmationUrl
          userErrors {
            field
            message
          }
        }
      }
    `;

    const variables = {
      name: `${planName} Plan - ${discountPercentage}% off with ${code}`,
      returnUrl: `${process.env.SHOPIFY_APP_URL}/app/billing-callback`,
      test: process.env.NODE_ENV !== "production",
      lineItems: [
        {
          plan: {
            appRecurringPricingDetails: {
              price: {
                amount: basePrice,
                currencyCode: "USD"
              },
              interval: "EVERY_30_DAYS",
              discount: {
                value: {
                  percentage: discountPercentage / 100 // Convert back to decimal (20% = 0.2)
                },
                durationLimitInIntervals: 12 // Apply discount for 12 months
              }
            }
          }
        }
      ]
    };

    console.log('[Apply Discount] Creating subscription with variables:', JSON.stringify(variables, null, 2));

    const response = await admin.graphql(mutation, { variables });
    const data = await response.json();

    console.log('[Apply Discount] Response:', JSON.stringify(data, null, 2));

    if (data.data?.appSubscriptionCreate?.userErrors?.length > 0) {
      const errors = data.data.appSubscriptionCreate.userErrors;
      console.error('[Apply Discount] User errors:', errors);
      return { 
        success: false,
        message: `Unable to apply discount: ${errors[0].message}` 
      };
    }

    if ((data as any).errors) {
      console.error('[Apply Discount] GraphQL errors:', (data as any).errors);
      return { 
        success: false,
        message: 'Failed to create subscription with discount. Please try again.' 
      };
    }

    const confirmationUrl = data.data?.appSubscriptionCreate?.confirmationUrl;
    
    if (confirmationUrl) {
      return { 
        success: true, 
        confirmationUrl,
        message: `✅ ${discountPercentage}% discount applied! Redirecting to confirm subscription...`,
        percentage: discountPercentage,
        code: code
      };
    }

    return {
      success: false,
      message: 'Failed to create subscription. Please try again or contact support.'
    };

  } catch (error: any) {
    console.error('[Apply Discount] Error:', error);
    return { 
      success: false, 
      message: error.message || 'An error occurred while applying the discount code.' 
    };
  }
};
