import type { ActionFunctionArgs } from "react-router";
import { getShopifyInstance } from "../shopify.server";
import db from "../db.server";
import { sendPlanUpgradeEmail, sendPlanDowngradeEmail } from "../services/email.server";

function getPlanNameFromSubscription(subscription: any) {
  console.log("🔍 Subscription data for mapping:", {
    name: subscription.name,
    status: subscription.status
  });

  const planMap: Record<string, string> = {
    'Free': 'Free',
    'Basic': 'Basic',
    'Advance': 'Advance'
  };

  let internalPlanName = planMap[subscription.name] || 'Free';

  console.log(`🎯 FINAL MAPPING: ${subscription.name} (status: ${subscription.status}) → ${internalPlanName}`);
  return internalPlanName;
}

function getPlanLevel(planName: string): number {
  const levels: Record<string, number> = {
    'Free': 0,
    'Basic': 1,
    'Advance': 2
  };
  return levels[planName] || 0;
}

function isUpgrade(oldPlan: string, newPlan: string): boolean {
  return getPlanLevel(newPlan) > getPlanLevel(oldPlan);
}

function isDowngrade(oldPlan: string, newPlan: string): boolean {
  return getPlanLevel(newPlan) < getPlanLevel(oldPlan);
}

export const action = async ({ request }: ActionFunctionArgs) => {
  const shopify = getShopifyInstance();
  const { payload, session, topic, shop } = await shopify.authenticate.webhook(request);

  console.log(`🔄 Received ${topic} webhook for ${shop}`);

  if (!session) {
    console.error("❌ No session found for subscription update webhook");
    return new Response("No session", { status: 400 });
  }

  try {
    console.log("🔍 Subscription update payload:", JSON.stringify(payload, null, 2));

    // Get current app from database
    const app = await db.app.findFirst({
      where: { appId: session.shop },
    });

    if (!app) {
      console.error("❌ App not found for shop:", session.shop);
      return new Response("App not found", { status: 404 });
    }

    const subscription = payload.app_subscription;
    if (!subscription) {
      console.error("❌ No app_subscription in webhook payload");
      return new Response("No subscription data", { status: 400 });
    }

    console.log('🔍 Mapping plan name...');
    const internalPlanName = getPlanNameFromSubscription(subscription);

    // Normalize old plan name
    const oldPlan = getPlanNameFromSubscription({ name: app.plan });
    const isPlanChange = oldPlan !== internalPlanName;
    console.log(`📊 Plan change: ${oldPlan} → ${internalPlanName} (${isPlanChange ? 'YES' : 'NO'})`);

    // Use shop email from database
    let shopEmail = app.shopEmail;

    // If no email stored, try to fetch from Shopify
    if (!shopEmail && (session as any).accessToken) {
      try {
        const response = await fetch(
          `https://${shop}/admin/api/2025-10/graphql.json`,
          {
            method: "POST",
            headers: {
              "X-Shopify-Access-Token": (session as any).accessToken,
              "Content-Type": "application/json",
              Accept: "application/json",
            },
            body: JSON.stringify({
              query: `
                query shopEmail {
                  shop {
                    email
                  }
                }
              `,
            }),
          },
        );

        const result = await response.json();

        if (!result.errors && result.data?.shop?.email) {
          shopEmail = result.data.shop.email;
          // Update the stored email
          await db.app.update({
            where: { id: app.id },
            data: { shopEmail },
          });
          console.log(`📧 Fetched and stored email: ${shopEmail}`);
        } else {
          console.error(
            "❌ Failed to fetch shop email from Shopify Admin GraphQL API:",
            result.errors || result,
          );
        }
      } catch (error) {
        console.error("❌ Error calling Shopify Admin GraphQL API for shop email:", error);
      }
    }

    const shopName = session.shop;

    // Handle different subscription statuses
    if (subscription.status === 'CANCELLED' || subscription.status === 'EXPIRED') {
      console.log(`🔄 Subscription ${subscription.status} - processing downgrade to free`);

      if (shopEmail && isPlanChange) {
        console.log(`📧 Sending downgrade email: ${oldPlan} → Free to ${shopEmail}`);
        await sendPlanDowngradeEmail(shopEmail, shopName, oldPlan, 'Free');
      }

      // Update plan to Free
      await db.app.update({
        where: { id: app.id },
        data: { plan: 'Free' },
      });

      console.log(`✅ Downgrade to free completed`);

    } else if (subscription.status === 'ACTIVE') {
      console.log(`🔄 Subscription active - processing plan change`);

      if (shopEmail && isPlanChange) {
        if (isUpgrade(oldPlan, internalPlanName)) {
          console.log(`📧 Sending upgrade email: ${oldPlan} → ${internalPlanName} to ${shopEmail}`);
          await sendPlanUpgradeEmail(shopEmail, shopName, oldPlan, internalPlanName);
        } else if (isDowngrade(oldPlan, internalPlanName)) {
          console.log(`📧 Sending downgrade email: ${oldPlan} → ${internalPlanName} to ${shopEmail}`);
          await sendPlanDowngradeEmail(shopEmail, shopName, oldPlan, internalPlanName);
        } else {
          // Same level plan change (shouldn't happen, but handle gracefully)
          console.log(`📧 Sending upgrade email (same level): ${oldPlan} → ${internalPlanName} to ${shopEmail}`);
          await sendPlanUpgradeEmail(shopEmail, shopName, oldPlan, internalPlanName);
        }
      }

      // Update the plan in database
      await db.app.update({
        where: { id: app.id },
        data: { plan: internalPlanName },
      });

      console.log(`✅ Active subscription update completed`);
    }

    console.log(`✅ SUCCESS: Webhook processing completed for ${shop}`);
    console.log(`📧 Email status: ${shopEmail && isPlanChange ? `SENT to ${shopEmail}` : "NOT SENT"}`);
    console.log(`🔄 Plan change: ${oldPlan} → ${internalPlanName}`);

    return new Response("OK", { status: 200 });

  } catch (error) {
    console.error("❌ WEBHOOK ERROR:", error);
    // Return 200 to prevent Shopify retries
    return new Response("OK", { status: 200 });
  }
};

export default function WebhookAppSubscriptionsUpdate() {
  return null;
}