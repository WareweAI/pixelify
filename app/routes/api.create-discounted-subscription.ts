import type { ActionFunctionArgs } from "react-router";
import { authenticate } from "../shopify.server";

export const action = async ({ request }: ActionFunctionArgs) => {
  const { billing, session } = await authenticate.admin(request);
  
  const formData = await request.formData();
  const planName = formData.get("planName") as string;
  const discountPercentage = parseFloat(formData.get("discountPercentage") as string) || 0;
  const discountDurationMonths = parseInt(formData.get("discountDurationMonths") as string) || 0;

  if (!planName) {
    return { error: "Plan name is required" };
  }

  try {
    // Define plan prices
    const planPrices: Record<string, { monthly: number; yearly: number }> = {
      "Basic": { monthly: 20.99, yearly: 209.99 },
      "Advance": { monthly: 55.99, yearly: 559.99 },
    };

    const plan = planPrices[planName];
    if (!plan) {
      return { error: "Invalid plan name" };
    }

    // Calculate discounted price
    const basePrice = plan.monthly;
    const discountedPrice = discountPercentage > 0 
      ? basePrice * (1 - discountPercentage / 100) 
      : basePrice;

    console.log(`[Subscription] Creating ${planName} plan: $${basePrice} -> $${discountedPrice.toFixed(2)} (${discountPercentage}% off for ${discountDurationMonths} months)`);

    // Create subscription with discount
    const billingCheck = await billing.require({
      plans: [planName],
      onFailure: async () => {
        // Create the subscription charge
        const response = await billing.request({
          plan: planName,
          isTest: process.env.NODE_ENV !== "production",
          returnUrl: `${process.env.SHOPIFY_APP_URL}/app/billing-callback`,
        });

        return response;
      },
    });

    // If discount is applied, we need to use GraphQL to create a custom charge
    if (discountPercentage > 0 && discountDurationMonths > 0) {
      const { admin } = await authenticate.admin(request);
      
      // Create app subscription with discount using GraphQL
      const mutation = `
        mutation CreateAppSubscription($name: String!, $lineItems: [AppSubscriptionLineItemInput!]!, $returnUrl: URL!, $test: Boolean) {
          appSubscriptionCreate(
            name: $name
            lineItems: $lineItems
            returnUrl: $returnUrl
            test: $test
          ) {
            appSubscription {
              id
              name
              status
              currentPeriodEnd
              trialDays
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
        name: `${planName} Plan (${discountPercentage}% off for ${discountDurationMonths} months)`,
        returnUrl: `${process.env.SHOPIFY_APP_URL}/app/billing-callback`,
        test: process.env.NODE_ENV !== "production",
        lineItems: [
          {
            plan: {
              appRecurringPricingDetails: {
                price: {
                  amount: discountedPrice,
                  currencyCode: "USD"
                },
                interval: "EVERY_30_DAYS",
                discount: discountPercentage > 0 ? {
                  durationLimitInIntervals: discountDurationMonths,
                  value: {
                    percentage: discountPercentage / 100
                  }
                } : undefined
              }
            }
          }
        ]
      };

      const response = await admin.graphql(mutation, { variables });
      const data = await response.json();

      if (data.data?.appSubscriptionCreate?.userErrors?.length > 0) {
        console.error('[Subscription] Errors:', data.data.appSubscriptionCreate.userErrors);
        return { 
          error: data.data.appSubscriptionCreate.userErrors[0].message 
        };
      }

      const confirmationUrl = data.data?.appSubscriptionCreate?.confirmationUrl;
      
      if (confirmationUrl) {
        return { 
          success: true, 
          confirmationUrl,
          message: `Subscription created with ${discountPercentage}% discount for ${discountDurationMonths} months`
        };
      }
    }

    return { 
      success: true, 
      hasActivePayment: billingCheck.hasActivePayment,
      message: "Subscription created successfully"
    };

  } catch (error: any) {
    console.error('[Subscription] Error:', error);
    return { 
      error: error.message || "Failed to create subscription" 
    };
  }
};
