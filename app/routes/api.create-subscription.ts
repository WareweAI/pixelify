import { ActionFunctionArgs, LoaderFunctionArgs } from "react-router";
import { authenticate } from "../shopify.server";
import { sendPlanPurchaseEmail } from "../services/email.server";
import db from "../db.server";

// This is an API route - only POST requests are allowed
export const loader = async ({ request }: LoaderFunctionArgs) => {
  return Response.json({ error: "Method not allowed. Use POST." }, { status: 405 });
};

export const action = async ({ request }: ActionFunctionArgs) => {
  const { session, admin } = await authenticate.admin(request);

  const formData = await request.formData();
  const planName = formData.get("planName") as string;

  if (!planName || planName === 'Free') {
    return { success: false, error: 'Invalid plan' };
  }

  try {
    const response = await admin.graphql(`
      mutation appSubscriptionCreate($name: String!, $lineItems: [AppSubscriptionLineItemInput!]!) {
        appSubscriptionCreate(name: $name, lineItems: $lineItems, returnUrl: "${process.env.SHOPIFY_APP_URL}/app/dashboard") {
          confirmationUrl
          userErrors {
            field
            message
          }
        }
      }
    `, {
      variables: {
        name: planName,
        lineItems: [{
          plan: {
            appRecurringPricingDetails: {
              pricingPlan: {
                name: planName
              }
            }
          }
        }]
      }
    });

    const data = await response.json();

    if (data.data?.appSubscriptionCreate?.confirmationUrl) {
      // Send purchase email - TODO: Implement email sending
      // if (session.email) {
      //   await sendPlanPurchaseEmail(session.email, session.shop, planName);
      // }

      // Update app plan in database (though actual subscription happens later)
      // For now, set it to the plan being purchased
      await db.app.updateMany({
        where: { appId: session.shop },
        data: { plan: planName },
      });

      return { success: true, confirmationUrl: data.data.appSubscriptionCreate.confirmationUrl };
    } else {
      return { success: false, error: data.data?.appSubscriptionCreate?.userErrors || 'Failed to create subscription' };
    }
  } catch (error: any) {
    console.error('Error creating subscription:', error);
    return { success: false, error: error.message };
  }
};