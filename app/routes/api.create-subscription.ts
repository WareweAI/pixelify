import { ActionFunctionArgs, LoaderFunctionArgs } from "react-router";
import { authenticate } from "../shopify.server";
import db from "../db.server";

// This is an API route - only POST requests are allowed
export const loader = async ({ request }: LoaderFunctionArgs) => {
  return Response.json({ error: "Method not allowed. Use POST." }, { status: 405 });
};

export const action = async ({ request }: ActionFunctionArgs) => {
  const { session, admin } = await authenticate.admin(request);

  const formData = await request.formData();
  const planName = formData.get("planName") as string;
  const billingCycle = (formData.get("billingCycle") as string) || 'monthly';

  if (!planName || planName === 'Free') {
    return { success: false, error: 'Invalid plan' };
  }

  console.log(`[Create Subscription] Creating ${planName} subscription (${billingCycle}) for ${session.shop}`);

  try {
    // Get app to store subscription info later
    const app = await db.app.findFirst({
      where: { appId: session.shop }
    });

    if (!app) {
      console.error('[Create Subscription] App not found');
      return { success: false, error: 'App not found' };
    }

    // Create Shopify subscription
    const response = await admin.graphql(`
      mutation appSubscriptionCreate($name: String!, $lineItems: [AppSubscriptionLineItemInput!]!, $returnUrl: URL!) {
        appSubscriptionCreate(
          name: $name, 
          lineItems: $lineItems, 
          returnUrl: $returnUrl
        ) {
          confirmationUrl
          userErrors {
            field
            message
          }
          appSubscription {
            id
            name
            status
            createdAt
            currentPeriodEnd
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
    `, {
      variables: {
        name: planName,
        returnUrl: `${process.env.SHOPIFY_APP_URL}/app/dashboard`,
        lineItems: [{
          plan: {
            appRecurringPricingDetails: {
              interval: billingCycle === 'yearly' ? 'ANNUAL' : 'EVERY_30_DAYS',
              price: {
                amount: billingCycle === 'yearly' 
                  ? (planName === 'Basic' ? 99.99 : 299.99)
                  : (planName === 'Basic' ? 9.99 : 29.99),
                currencyCode: 'USD'
              }
            }
          }
        }]
      }
    });

    const data = await response.json();

    console.log('[Create Subscription] Shopify response:', JSON.stringify(data, null, 2));

    if (data.data?.appSubscriptionCreate?.confirmationUrl) {
      const confirmationUrl = data.data.appSubscriptionCreate.confirmationUrl;
      const shopifySubscription = data.data.appSubscriptionCreate.appSubscription;

      console.log('[Create Subscription] Subscription created successfully');
      console.log('[Create Subscription] Shopify Subscription ID:', shopifySubscription?.id);
      console.log('[Create Subscription] Status:', shopifySubscription?.status);
      console.log('[Create Subscription] Confirmation URL:', confirmationUrl);

      // Store pending subscription info (will be activated by webhook)
      // The webhook will call our createSubscription service when status becomes ACTIVE
      
      return { 
        success: true, 
        confirmationUrl,
        subscriptionId: shopifySubscription?.id,
        status: shopifySubscription?.status
      };
    } else {
      const errors = data.data?.appSubscriptionCreate?.userErrors || [];
      console.error('[Create Subscription] Errors:', errors);
      return { 
        success: false, 
        error: errors.length > 0 ? errors[0].message : 'Failed to create subscription' 
      };
    }
  } catch (error: any) {
    console.error('[Create Subscription] Error:', error);
    return { success: false, error: error.message };
  }
};
