import type { ActionFunctionArgs } from "react-router";
import { getShopifyInstance } from "../shopify.server";

/**
 * API Route for Pixel Operations
 * Handles toggle server-side API and send test events
 */
export const action = async ({ request }: ActionFunctionArgs) => {
  const prisma = (await import("../db.server")).default;
  
  const shopify = getShopifyInstance();
  if (!shopify?.authenticate) {
    return Response.json({ error: "Shopify not configured" }, { status: 500 });
  }

  let session;
  try {
    const authResult = await shopify.authenticate.admin(request);
    session = authResult.session;
  } catch (error) {
    if (error instanceof Response) throw error;
    return Response.json({ error: "Authentication failed" }, { status: 401 });
  }

  const shop = session.shop;
  const formData = await request.formData();
  const intent = formData.get("intent") as string;

  const user = await prisma.user.findUnique({ where: { storeUrl: shop } });
  if (!user) return Response.json({ error: "User not found" }, { status: 404 });

  // Toggle Server-Side API
  if (intent === "toggle-server-side") {
    const pixelId = formData.get("pixelId") as string;
    const enabled = formData.get("enabled") === "true";

    if (!pixelId) {
      return Response.json({ error: "Pixel ID required" }, { status: 400 });
    }

    try {
      const app = await prisma.app.findFirst({
        where: { id: pixelId, userId: user.id },
        include: { settings: true },
      });

      if (!app) {
        return Response.json({ error: "Pixel not found" }, { status: 404 });
      }

      // Update metaPixelEnabled status
      if (app.settings) {
        await prisma.appSettings.update({
          where: { id: app.settings.id },
          data: { metaPixelEnabled: enabled },
        });
      }

      return Response.json({
        success: true,
        message: `Server-Side API ${enabled ? "enabled" : "disabled"}`,
      });
    } catch (error: any) {
      console.error("[Pixel API] Toggle error:", error);
      return Response.json({ error: error.message }, { status: 500 });
    }
  }

  // Send Test Event
  if (intent === "send-test-event") {
    const pixelId = formData.get("pixelId") as string;
    const eventName = formData.get("eventName") as string;

    if (!pixelId || !eventName) {
      return Response.json({ error: "Missing required fields" }, { status: 400 });
    }

    try {
      const app = await prisma.app.findFirst({
        where: { id: pixelId, userId: user.id },
        include: { settings: true },
      });

      if (!app || !app.settings) {
        return Response.json({ error: "Pixel not found" }, { status: 404 });
      }

      const { metaPixelId, metaTestEventCode } = app.settings;

      if (!metaPixelId) {
        return Response.json({ 
          error: "Meta Pixel ID is required. Please configure it first." 
        }, { status: 400 });
      }

      if (!metaTestEventCode) {
        return Response.json({ 
          error: "Test Event Code not found. Please generate one in Meta Events Manager." 
        }, { status: 400 });
      }

      // Get valid access token using the token refresh service
      const { getValidTokenForUser, isTokenExpiredError, getTokenExpiredMessage } = await import("~/services/facebook-sdk-token.server");
      const accessToken = await getValidTokenForUser(user.id);

      if (!accessToken) {
        return Response.json({
          testResult: {
            success: false,
            message: "No valid Facebook access token found. Please reconnect Facebook in Dashboard.",
          },
        });
      }

      // Prepare event data for Facebook Conversions API
      const eventData = {
        data: [
          {
            event_name: eventName,
            event_time: Math.floor(Date.now() / 1000),
            event_id: `test_${Date.now()}`,
            action_source: "website",
            user_data: {
              client_ip_address: "254.254.254.254", // Test IP
              client_user_agent: "Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:63.0) Gecko/20100101 Firefox/63.0",
            },
          },
        ],
        test_event_code: metaTestEventCode,
      };

      console.log(`[Test Event] Sending to pixel ${metaPixelId}:`, JSON.stringify(eventData, null, 2));

      // Send to Facebook Conversions API
      const response = await fetch(
        `https://graph.facebook.com/v18.0/${metaPixelId}/events`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            ...eventData,
            access_token: accessToken,
          }),
        }
      );

      const result = await response.json();

      console.log(`[Test Event] Facebook response:`, JSON.stringify(result, null, 2));

      if (result.error) {
        // Check if token expired
        if (isTokenExpiredError(result.error)) {
          return Response.json({
            testResult: {
              success: false,
              message: getTokenExpiredMessage(),
            },
          });
        }

        return Response.json({
          testResult: {
            success: false,
            message: `Facebook API Error: ${result.error.message}`,
          },
        });
      }

      // Check if event was received
      const eventsReceived = result.events_received || 0;
      const fbtrace = result.fbtrace_id || "N/A";

      if (eventsReceived > 0) {
        return Response.json({
          testResult: {
            success: true,
            message: `✅ Test event sent successfully! Events received: ${eventsReceived}. Trace ID: ${fbtrace}. Check Meta Events Manager → Test Events tab with code: ${metaTestEventCode}`,
          },
        });
      } else {
        return Response.json({
          testResult: {
            success: false,
            message: `⚠️ Event sent but not received by Facebook. Trace ID: ${fbtrace}. Please check your pixel configuration.`,
          },
        });
      }
    } catch (error: any) {
      console.error("[Test Event] Error:", error);
      return Response.json({
        testResult: {
          success: false,
          message: `Error: ${error.message}`,
        },
      });
    }
  }

  return Response.json({ error: "Invalid action" }, { status: 400 });
};
