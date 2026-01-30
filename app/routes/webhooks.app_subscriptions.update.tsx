import type { ActionFunctionArgs } from "react-router";
import { getShopifyInstance } from "../shopify.server";
import db from "../db.server";
import { sendPlanUpgradeEmail, sendPlanDowngradeEmail } from "../services/email.server";

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

    // Import server functions inside action
    const { createSubscription, getPlanLevel } = await import("../services/subscription.server");

    // Helper functions
    function getPlanNameFromSubscription(subscription: any) {
      console.log("🔍 Subscription data for mapping:", {
        name: subscription.name,
        status: subscription.status,
        line_items: subscription.line_items
      });

      const planMap: Record<string, string> = {
        'Free': 'Free',
        'Basic': 'Basic',
        'Advance': 'Advance',
      };

      let internalPlanName = planMap[subscription.name] || 'Free';

      if (internalPlanName === 'Free' && subscription.status === 'ACTIVE' && subscription.line_items) {
        const lineItem = subscription.line_items[0];
        if (lineItem && lineItem.title) {
          const title = lineItem.title.toLowerCase();
          if (title.includes('basic')) {
            internalPlanName = 'Basic';
          } else if (title.includes('advance') || title.includes('advanced')) {
            internalPlanName = 'Advance';
          }
        }
      }

      console.log(`🎯 FINAL MAPPING: "${subscription.name}" (status: ${subscription.status}) → ${internalPlanName}`);
      return internalPlanName;
    }

    function getBillingCycleFromSubscription(subscription: any): 'monthly' | 'yearly' {
      if (subscription.line_items && subscription.line_items.length > 0) {
        const lineItem = subscription.line_items[0];
        if (lineItem.plan?.pricing_details?.interval === 'ANNUAL') {
          return 'yearly';
        }
      }
      return 'monthly';
    }

    function getPriceFromSubscription(subscription: any): number {
      if (subscription.line_items && subscription.line_items.length > 0) {
        const lineItem = subscription.line_items[0];
        if (lineItem.price) {
          return parseFloat(lineItem.price.amount || '0');
        }
      }
      return 0;
    }

    // Get user first
    const user = await db.user.findUnique({
      where: { storeUrl: session.shop },
    });

    if (!user) {
      console.error("❌ User not found for shop:", session.shop);
      return new Response("User not found", { status: 404 });
    }

    // Get current app from database
    const app = await db.app.findFirst({
      where: { userId: user.id },
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
    const oldPlan = app.plan || 'Free';
    const isPlanChange = oldPlan !== internalPlanName;
    
    console.log(`📊 Plan change: ${oldPlan} → ${internalPlanName} (${isPlanChange ? 'YES' : 'NO'})`);

    // Extract subscription details
    const shopifySubscriptionId = subscription.id?.toString();
    const billingCycle = getBillingCycleFromSubscription(subscription);
    const price = getPriceFromSubscription(subscription);
    
    // Parse dates from Shopify
    const createdAt = subscription.created_at ? new Date(subscription.created_at) : new Date();
    const billingOn = subscription.billing_on ? new Date(subscription.billing_on) : null;
    const trialEndsOn = subscription.trial_ends_on ? new Date(subscription.trial_ends_on) : null;

    console.log('📅 Subscription dates:', {
      createdAt: createdAt.toISOString(),
      billingOn: billingOn?.toISOString(),
      trialEndsOn: trialEndsOn?.toISOString(),
      billingCycle,
      price
    });

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

    const shopName = app.name || session.shop;

    // Handle different subscription statuses
    if (subscription.status === 'CANCELLED' || subscription.status === 'EXPIRED') {
      console.log(`🔄 Subscription ${subscription.status} - processing downgrade to free`);

      // Cancel active subscription in our system
      const currentSubscription = await db.subscription.findFirst({
        where: {
          appId: app.id,
          isCurrentPlan: true
        }
      });

      if (currentSubscription) {
        await db.subscription.update({
          where: { id: currentSubscription.id },
          data: {
            status: subscription.status === 'CANCELLED' ? 'cancelled' : 'expired',
            cancelledAt: new Date(),
            isCurrentPlan: false
          }
        });

        // Log history
        await db.subscriptionHistory.create({
          data: {
            appId: app.id,
            subscriptionId: currentSubscription.id,
            eventType: subscription.status === 'CANCELLED' ? 'cancelled' : 'expired',
            fromPlan: oldPlan,
            toPlan: 'Free'
          }
        });
      }

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

      if (isPlanChange) {
        // Create subscription using our service
        const result = await createSubscription({
          appId: app.id,
          planName: internalPlanName,
          billingCycle,
          shopifySubscriptionId
        });

        console.log(`✅ Subscription created: ${result.subscription.id}`);
        console.log(`📊 Transition type: ${result.transitionType}`);
        console.log(`⚡ Effective immediately: ${result.effectiveImmediately}`);
        console.log(`📅 Start date: ${result.subscription.startDate.toISOString()}`);
        console.log(`📅 End date: ${result.subscription.endDate.toISOString()}`);

        // Email is sent by createSubscription service
      } else {
        console.log(`ℹ️ No plan change detected, skipping subscription creation`);
      }

      console.log(`✅ Active subscription update completed`);
    } else if (subscription.status === 'PENDING') {
      console.log(`⏳ Subscription pending - waiting for activation`);
      // Don't create subscription yet, wait for ACTIVE status
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