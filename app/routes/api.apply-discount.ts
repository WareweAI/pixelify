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

  if (!code) {
    return { success: false, message: 'Discount code is required' };
  }

  try {
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

    // Extract percentage
    const percentage = discount.customerGets?.value?.percentage;
    if (!percentage || percentage <= 0 || percentage > 100) {
      return { success: false, message: 'Invalid discount configuration. Please contact support.' };
    }

    // Get current active subscriptions
    const subscriptionResponse = await admin.graphql(`
      query {
        appInstallation {
          activeSubscriptions {
            id
            name
            status
            lineItems {
              id
              plan {
                pricingDetails {
                  ... on AppRecurringPricing {
                    interval
                    price {
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
    `);

    const subscriptionData = await subscriptionResponse.json();

    // Check for GraphQL errors
    if ((subscriptionData as any).errors) {
      console.error('GraphQL errors fetching subscriptions:', (subscriptionData as any).errors);
      return { success: false, message: 'Unable to access subscription information. Please try again later.' };
    }

    const activeSubscriptions = subscriptionData.data?.appInstallation?.activeSubscriptions || [];

    if (activeSubscriptions.length === 0) {
      return { success: false, message: 'No active subscription found. Please ensure you have an active plan before applying discounts.' };
    }

    if (activeSubscriptions.length > 1) {
      return { success: false, message: 'Multiple active subscriptions found. Please contact support to apply discounts manually.' };
    }

    // Get the current subscription details
    const currentSubscription = activeSubscriptions[0];
    const currentLineItem = currentSubscription.lineItems[0];

    // Extract current pricing details
    const currentPricing = currentLineItem.plan.pricingDetails;
    const currentPrice = currentPricing.price;
    const currentInterval = currentPricing.interval;

    // Create a new subscription with the same plan but with discount applied
    const createResponse = await admin.graphql(`
      mutation appSubscriptionCreate($name: String!, $lineItems: [AppSubscriptionLineItemInput!]!, $replacementBehavior: AppSubscriptionReplacementBehavior!) {
        appSubscriptionCreate(name: $name, lineItems: $lineItems, replacementBehavior: $replacementBehavior, returnUrl: "${process.env.SHOPIFY_APP_URL}/app/pricing") {
          confirmationUrl
          userErrors {
            field
            message
          }
        }
      }
    `, {
      variables: {
        name: currentSubscription.name,
        replacementBehavior: "APPLY_IMMEDIATELY",
        lineItems: [{
          plan: {
            appRecurringPricingDetails: {
              interval: currentInterval,
              price: {
                amount: currentPrice.amount,
                currencyCode: currentPrice.currencyCode
              },
              discount: {
                value: {
                  percentage: percentage
                },
                durationLimitInIntervals: 12 // Apply for 12 billing cycles
              }
            }
          }
        }]
      }
    });

    const createData = await createResponse.json();

    // Check for GraphQL errors
    if ((createData as any).errors) {
      console.error('GraphQL errors creating subscription:', (createData as any).errors);
      return { success: false, message: 'Failed to apply discount. Please try again later.' };
    }

    if (createData.data?.appSubscriptionCreate?.userErrors?.length > 0) {
      const errorMessage = createData.data.appSubscriptionCreate.userErrors[0].message;
      console.error('Subscription creation user errors:', createData.data.appSubscriptionCreate.userErrors);
      return {
        success: false,
        message: `Unable to apply discount: ${errorMessage}`
      };
    }

    if (createData.data?.appSubscriptionCreate?.confirmationUrl) {
      // Return the confirmation URL so the user can approve the change
      return {
        success: true,
        message: `${percentage}% discount applied successfully! Please confirm the subscription change to activate your discount.`,
        confirmationUrl: createData.data.appSubscriptionCreate.confirmationUrl
      };
    }

    // If we get here, something unexpected happened
    console.error('Unexpected response from subscription creation:', createData);
    return { success: false, message: 'Unexpected error occurred. Please contact support.' };

    return {
      success: true,
      message: `${percentage}% discount applied to your subscription!`
    };

  } catch (error: any) {
    console.error('Error applying discount:', error);
    return { success: false, message: error.message };
  }
};