// API endpoint to refresh Facebook access tokens
// Can be called manually or by a cron job
import type { ActionFunctionArgs } from "react-router";
import { refreshAllExpiringTokens } from "~/services/facebook-token-refresh.server";

export const action = async ({ request }: ActionFunctionArgs) => {
  // Only allow POST requests
  if (request.method !== "POST") {
    return new Response("Method not allowed", { status: 405 });
  }

  // Optional: Add authentication/authorization here
  // For example, check for a secret token in headers
  const authHeader = request.headers.get("Authorization");
  const cronSecret = process.env.CRON_SECRET;

  if (cronSecret && authHeader !== `Bearer ${cronSecret}`) {
    return new Response("Unauthorized", { status: 401 });
  }

  try {
    console.log("[Token Refresh API] Starting token refresh...");
    const result = await refreshAllExpiringTokens();

    return Response.json({
      success: true,
      message: "Token refresh completed",
      ...result,
    });
  } catch (error) {
    console.error("[Token Refresh API] Error:", error);
    return Response.json(
      {
        success: false,
        error: error instanceof Error ? error.message : "Unknown error",
      },
      { status: 500 }
    );
  }
};
