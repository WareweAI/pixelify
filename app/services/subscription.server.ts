/**
 * Subscription Management Service
 * Handles subscription lifecycle with proper upgrade/downgrade logic
 */

import db from "../db.server";
import { sendSubscriptionEmail } from "./email.server";

export interface PlanConfig {
  name: string;
  level: number;
  monthlyPrice: number;
  yearlyPrice: number;
  features: string[];
}

export const PLAN_CONFIGS: Record<string, PlanConfig> = {
  Free: {
    name: 'Free',
    level: 0,
    monthlyPrice: 0,
    yearlyPrice: 0,
    features: ['Basic tracking', '1 pixel', 'Limited events']
  },
  Basic: {
    name: 'Basic',
    level: 1,
    monthlyPrice: 9.99,
    yearlyPrice: 99.99,
    features: ['Advanced tracking', '3 pixels', 'Unlimited events', 'Email support']
  },
  Advance: {
    name: 'Advance',
    level: 2,
    monthlyPrice: 29.99,
    yearlyPrice: 299.99,
    features: ['Premium tracking', 'Unlimited pixels', 'Priority support', 'Custom events', 'API access']
  }
};

/**
 * Get plan level for comparison
 */
export function getPlanLevel(planName: string): number {
  return PLAN_CONFIGS[planName]?.level ?? 0;
}

/**
 * Determine transition type
 */
export function getTransitionType(currentPlan: string, newPlan: string): 'upgrade' | 'downgrade' | 'renewal' {
  const currentLevel = getPlanLevel(currentPlan);
  const newLevel = getPlanLevel(newPlan);
  
  if (newLevel > currentLevel) return 'upgrade';
  if (newLevel < currentLevel) return 'downgrade';
  return 'renewal';
}

/**
 * Calculate plan expiry date
 */
export function calculateEndDate(startDate: Date, billingCycle: 'monthly' | 'yearly'): Date {
  const endDate = new Date(startDate);
  
  if (billingCycle === 'monthly') {
    endDate.setMonth(endDate.getMonth() + 1);
  } else {
    endDate.setFullYear(endDate.getFullYear() + 1);
  }
  
  return endDate;
}

/**
 * Get price for plan and billing cycle
 */
export function getPlanPrice(planName: string, billingCycle: 'monthly' | 'yearly'): number {
  const config = PLAN_CONFIGS[planName];
  if (!config) return 0;
  
  return billingCycle === 'monthly' ? config.monthlyPrice : config.yearlyPrice;
}

/**
 * Create or update subscription with proper transition logic
 */
export async function createSubscription(params: {
  appId: string;
  planName: string;
  billingCycle: 'monthly' | 'yearly';
  shopifySubscriptionId?: string;
}): Promise<{
  subscription: any;
  transitionType: 'upgrade' | 'downgrade' | 'renewal';
  effectiveImmediately: boolean;
}> {
  const { appId, planName, billingCycle, shopifySubscriptionId } = params;
  
  console.log(`[Subscription] Creating subscription for ${appId}: ${planName} (${billingCycle})`);

  // Get app and current subscription
  const app = await db.app.findUnique({
    where: { id: appId },
    include: {
      subscriptions: {
        where: {
          OR: [
            { isCurrentPlan: true },
            { isPendingPlan: true, status: 'pending' }
          ]
        },
        orderBy: { createdAt: 'desc' }
      }
    }
  });

  if (!app) {
    throw new Error('App not found');
  }

  // Find current active subscription and any pending subscription
  const currentSubscription = app.subscriptions.find(s => s.isCurrentPlan);
  const pendingSubscription = app.subscriptions.find(s => s.isPendingPlan && s.status === 'pending');
  
  // Determine the actual current plan (what user has access to now)
  const currentPlan = currentSubscription?.planName || app.plan || 'Free';
  const currentPlanEndDate = currentSubscription?.endDate || new Date();
  
  console.log(`[Subscription] Current active plan: ${currentPlan} (expires: ${currentPlanEndDate.toISOString()})`);
  if (pendingSubscription) {
    console.log(`[Subscription] Pending plan found: ${pendingSubscription.planName} (starts: ${pendingSubscription.startDate.toISOString()})`);
  }
  const transitionType = getTransitionType(currentPlan, planName);
  const planLevel = getPlanLevel(planName);
  
  const now = new Date();
  let startDate: Date;
  let endDate: Date;
  let isCurrentPlan: boolean;
  let isPendingPlan: boolean;
  let effectiveImmediately: boolean;

  console.log(`[Subscription] Transition: ${currentPlan} → ${planName} (${transitionType})`);

  if (transitionType === 'upgrade') {
    // UPGRADE: Activate immediately
    startDate = now;
    endDate = calculateEndDate(startDate, billingCycle);
    isCurrentPlan = true;
    isPendingPlan = false;
    effectiveImmediately = true;

    console.log(`[Subscription] Upgrade - starts immediately`);
    console.log(`[Subscription] Start: ${startDate.toISOString()}`);
    console.log(`[Subscription] End: ${endDate.toISOString()}`);

    // Cancel any pending downgrade
    if (pendingSubscription) {
      console.log(`[Subscription] Cancelling pending downgrade: ${pendingSubscription.planName}`);
      await db.subscription.update({
        where: { id: pendingSubscription.id },
        data: {
          status: 'cancelled',
          cancelledAt: now,
          isPendingPlan: false
        }
      });

      await db.subscriptionHistory.create({
        data: {
          appId,
          subscriptionId: pendingSubscription.id,
          eventType: 'cancelled',
          fromPlan: pendingSubscription.planName,
          toPlan: planName,
          metadata: { reason: 'user_upgraded_before_activation' }
        }
      });
    }

    // Deactivate current subscription
    if (currentSubscription) {
      await db.subscription.update({
        where: { id: currentSubscription.id },
        data: {
          isCurrentPlan: false,
          status: 'cancelled',
          cancelledAt: now
        }
      });

      // Log history
      await db.subscriptionHistory.create({
        data: {
          appId,
          subscriptionId: currentSubscription.id,
          eventType: 'cancelled',
          fromPlan: currentPlan,
          toPlan: planName,
          metadata: { reason: 'upgraded' }
        }
      });
    }

    // Update app plan immediately
    await db.app.update({
      where: { id: appId },
      data: { plan: planName }
    });

  } else if (transitionType === 'downgrade') {
    // DOWNGRADE: Schedule for after current plan expires
    // Use the current active plan's end date, not any pending plan
    const currentEndDate = currentSubscription?.endDate || now;
    startDate = currentEndDate > now ? currentEndDate : now;
    endDate = calculateEndDate(startDate, billingCycle);
    isCurrentPlan = false;
    isPendingPlan = true;
    effectiveImmediately = false;

    console.log(`[Subscription] Downgrade - scheduled for after current plan expires`);
    console.log(`[Subscription] Current plan expires: ${currentEndDate.toISOString()}`);
    console.log(`[Subscription] New plan starts: ${startDate.toISOString()}`);
    console.log(`[Subscription] New plan ends: ${endDate.toISOString()}`);

    // Cancel any existing pending downgrade (user changed their mind)
    if (pendingSubscription) {
      console.log(`[Subscription] Replacing pending downgrade: ${pendingSubscription.planName} → ${planName}`);
      await db.subscription.update({
        where: { id: pendingSubscription.id },
        data: {
          status: 'cancelled',
          cancelledAt: now,
          isPendingPlan: false
        }
      });

      await db.subscriptionHistory.create({
        data: {
          appId,
          subscriptionId: pendingSubscription.id,
          eventType: 'cancelled',
          fromPlan: pendingSubscription.planName,
          toPlan: planName,
          metadata: { reason: 'user_changed_downgrade_plan' }
        }
      });
    }

    // Keep current subscription active
    // Pending subscription will be activated by cron job

  } else {
    // RENEWAL: Extend current plan
    startDate = now;
    endDate = calculateEndDate(startDate, billingCycle);
    isCurrentPlan = true;
    isPendingPlan = false;
    effectiveImmediately = true;

    console.log(`[Subscription] Renewal - extends current plan`);

    if (currentSubscription) {
      await db.subscription.update({
        where: { id: currentSubscription.id },
        data: {
          isCurrentPlan: false,
          status: 'expired'
        }
      });
    }
  }

  // Create new subscription
  const subscription = await db.subscription.create({
    data: {
      appId,
      shopifySubscriptionId,
      planName,
      planLevel,
      billingCycle,
      status: isCurrentPlan ? 'active' : 'pending',
      startDate,
      endDate,
      isCurrentPlan,
      isPendingPlan,
      transitionType,
      replacesSubscriptionId: currentSubscription?.id
    }
  });

  // Log history
  await db.subscriptionHistory.create({
    data: {
      appId,
      subscriptionId: subscription.id,
      eventType: isCurrentPlan ? 'activated' : 'created',
      fromPlan: currentPlan,
      toPlan: planName,
      metadata: {
        billingCycle,
        transitionType,
        effectiveImmediately,
        cancelledPendingPlan: pendingSubscription?.planName
      }
    }
  });

  // Send email notification
  if (app.shopEmail) {
    console.log(`[Subscription] Sending ${transitionType} email to ${app.shopEmail}`);
    try {
      const emailSent = await sendSubscriptionEmail({
        email: app.shopEmail,
        shopName: app.name,
        type: transitionType,
        fromPlan: currentPlan,
        toPlan: planName,
        startDate,
        endDate,
        billingCycle,
        appId,
        currentPlanExpiresAt: transitionType === 'downgrade' ? currentSubscription?.endDate : undefined
      });
      
      if (emailSent) {
        console.log(`[Subscription] ✅ Email sent successfully`);
      } else {
        console.log(`[Subscription] ⚠️ Email sending returned false`);
      }
    } catch (emailError) {
      console.error(`[Subscription] ❌ Email sending failed:`, emailError);
      // Don't throw - subscription should still be created even if email fails
    }
  } else {
    console.log(`[Subscription] ⚠️ No shop email configured, skipping email notification`);
  }

  console.log(`[Subscription] Created subscription ${subscription.id}`);

  return {
    subscription,
    transitionType,
    effectiveImmediately
  };
}

/**
 * Activate pending subscriptions (run via cron)
 */
export async function activatePendingSubscriptions(): Promise<void> {
  const now = new Date();
  
  console.log(`[Subscription] Checking for pending subscriptions at ${now.toISOString()}`);

  // Find pending subscriptions that should start now
  const pendingSubscriptions = await db.subscription.findMany({
    where: {
      isPendingPlan: true,
      status: 'pending',
      startDate: {
        lte: now
      }
    },
    include: {
      app: true
    }
  });

  console.log(`[Subscription] Found ${pendingSubscriptions.length} subscriptions to activate`);

  for (const subscription of pendingSubscriptions) {
    console.log(`[Subscription] Activating subscription ${subscription.id} for app ${subscription.appId}`);

    // Deactivate current subscription
    await db.subscription.updateMany({
      where: {
        appId: subscription.appId,
        isCurrentPlan: true
      },
      data: {
        isCurrentPlan: false,
        status: 'expired'
      }
    });

    // Activate pending subscription
    await db.subscription.update({
      where: { id: subscription.id },
      data: {
        isCurrentPlan: true,
        isPendingPlan: false,
        status: 'active'
      }
    });

    // Update app plan
    await db.app.update({
      where: { id: subscription.appId },
      data: { plan: subscription.planName }
    });

    // Log history
    await db.subscriptionHistory.create({
      data: {
        appId: subscription.appId,
        subscriptionId: subscription.id,
        eventType: 'activated',
        fromPlan: subscription.app.plan,
        toPlan: subscription.planName,
        metadata: { activatedAt: now.toISOString() }
      }
    });

    // Send activation email
    if (subscription.app.shopEmail) {
      await sendSubscriptionEmail({
        email: subscription.app.shopEmail,
        shopName: subscription.app.name,
        type: 'activated',
        fromPlan: subscription.app.plan,
        toPlan: subscription.planName,
        startDate: subscription.startDate,
        endDate: subscription.endDate,
        billingCycle: subscription.billingCycle as 'monthly' | 'yearly',
        appId: subscription.appId
      });
    }

    console.log(`[Subscription] Activated subscription ${subscription.id}`);
  }
}

/**
 * Expire subscriptions (run via cron)
 */
export async function expireSubscriptions(): Promise<void> {
  const now = new Date();
  
  console.log(`[Subscription] Checking for expired subscriptions at ${now.toISOString()}`);

  const expiredSubscriptions = await db.subscription.findMany({
    where: {
      isCurrentPlan: true,
      status: 'active',
      endDate: {
        lte: now
      }
    },
    include: {
      app: true
    }
  });

  console.log(`[Subscription] Found ${expiredSubscriptions.length} expired subscriptions`);

  for (const subscription of expiredSubscriptions) {
    console.log(`[Subscription] Expiring subscription ${subscription.id} for app ${subscription.appId}`);

    // Mark as expired
    await db.subscription.update({
      where: { id: subscription.id },
      data: {
        isCurrentPlan: false,
        status: 'expired'
      }
    });

    // Downgrade to Free
    await db.app.update({
      where: { id: subscription.appId },
      data: { plan: 'Free' }
    });

    // Log history
    await db.subscriptionHistory.create({
      data: {
        appId: subscription.appId,
        subscriptionId: subscription.id,
        eventType: 'expired',
        fromPlan: subscription.planName,
        toPlan: 'Free'
      }
    });

    // Send expiry email
    if (subscription.app.shopEmail) {
      await sendSubscriptionEmail({
        email: subscription.app.shopEmail,
        shopName: subscription.app.name,
        type: 'expired',
        fromPlan: subscription.planName,
        toPlan: 'Free',
        startDate: subscription.startDate,
        endDate: subscription.endDate,
        billingCycle: subscription.billingCycle as 'monthly' | 'yearly',
        appId: subscription.appId
      });
    }
  }
}

/**
 * Get current active subscription
 */
export async function getCurrentSubscription(appId: string) {
  return await db.subscription.findFirst({
    where: {
      appId,
      isCurrentPlan: true
    },
    orderBy: {
      createdAt: 'desc'
    }
  });
}

/**
 * Get pending subscription
 */
export async function getPendingSubscription(appId: string) {
  return await db.subscription.findFirst({
    where: {
      appId,
      isPendingPlan: true,
      status: 'pending'
    },
    orderBy: {
      startDate: 'asc'
    }
  });
}

/**
 * Cancel subscription
 */
export async function cancelSubscription(subscriptionId: string): Promise<void> {
  const subscription = await db.subscription.findUnique({
    where: { id: subscriptionId },
    include: { app: true }
  });

  if (!subscription) {
    throw new Error('Subscription not found');
  }

  const now = new Date();

  await db.subscription.update({
    where: { id: subscriptionId },
    data: {
      status: 'cancelled',
      cancelledAt: now,
      isCurrentPlan: false,
      isPendingPlan: false
    }
  });

  // Log history
  await db.subscriptionHistory.create({
    data: {
      appId: subscription.appId,
      subscriptionId: subscription.id,
      eventType: 'cancelled',
      fromPlan: subscription.planName,
      toPlan: 'Free'
    }
  });

  // Send cancellation email
  if (subscription.app.shopEmail) {
    await sendSubscriptionEmail({
      email: subscription.app.shopEmail,
      shopName: subscription.app.name,
      type: 'cancelled',
      fromPlan: subscription.planName,
      toPlan: 'Free',
      startDate: subscription.startDate,
      endDate: subscription.endDate,
      billingCycle: subscription.billingCycle as 'monthly' | 'yearly',
      appId: subscription.appId
    });
  }
}
