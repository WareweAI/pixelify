/**
 * Cron job endpoint for subscription management
 * Should be called daily to:
 * 1. Activate pending subscriptions
 * 2. Expire old subscriptions
 * 
 * Setup in your cron service (e.g., Vercel Cron, GitHub Actions):
 * Schedule: 0 0 * * * (daily at midnight)
 * URL: POST /api/cron/subscriptions
 * Header: Authorization: Bearer YOUR_CRON_SECRET
 */

import type { ActionFunctionArgs } from "react-router";
import { activatePendingSubscriptions, expireSubscriptions } from "../services/subscription.server";

export const action = async ({ request }: ActionFunctionArgs) => {
  // Verify cron secret
  const authHeader = request.headers.get("Authorization");
  const cronSecret = process.env.CRON_SECRET;

  if (!cronSecret) {
    console.error("[Cron] CRON_SECRET not configured");
    return Response.json({ error: "Cron secret not configured" }, { status: 500 });
  }

  if (authHeader !== `Bearer ${cronSecret}`) {
    console.error("[Cron] Invalid authorization");
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  console.log("[Cron] Starting subscription management tasks");

  try {
    // Activate pending subscriptions
    console.log("[Cron] Activating pending subscriptions...");
    await activatePendingSubscriptions();

    // Expire old subscriptions
    console.log("[Cron] Expiring old subscriptions...");
    await expireSubscriptions();

    console.log("[Cron] Subscription management tasks completed successfully");

    return Response.json({
      success: true,
      message: "Subscription management tasks completed",
      timestamp: new Date().toISOString()
    });

  } catch (error) {
    console.error("[Cron] Error in subscription management:", error);
    
    return Response.json({
      success: false,
      error: error instanceof Error ? error.message : "Unknown error",
      timestamp: new Date().toISOString()
    }, { status: 500 });
  }
};

// Prevent GET requests
export const loader = async () => {
  return Response.json({ error: "Method not allowed. Use POST." }, { status: 405 });
};
