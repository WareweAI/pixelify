import type { ActionFunctionArgs } from "react-router";
import { authenticate } from "~/shopify.server";
import prisma from "~/db.server";

export async function action({ request }: ActionFunctionArgs) {
  if (request.method !== "POST") {
    return new Response(
      JSON.stringify({ error: "Method not allowed" }),
      { status: 405, headers: { "Content-Type": "application/json" } }
    );
  }

  try {
    const { session } = await authenticate.admin(request);
    const shop = session.shop;

    const body = await request.json();
    const {
      pixelId,
      accessToken,
      eventName,
      testEventCode,
      userData,
      customData,
    } = body;

    if (!pixelId || !accessToken || !eventName) {
      return new Response(
        JSON.stringify({
          error: "pixelId, accessToken, and eventName are required",
        }),
        { status: 400, headers: { "Content-Type": "application/json" } }
      );
    }

    // Build the test event payload
    const eventData = {
      action_source: "website",
      event_id: `test_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
      event_name: eventName,
      event_time: Math.floor(Date.now() / 1000),
      user_data: {
        client_ip_address: "254.254.254.254",
        client_user_agent:
          "Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:63.0) Gecko/20100101 Firefox/63.0",
        em: "f660ab912ec121d1b1e928a0bb4bc61b15f5ad44d5efdc4e1c92a25e99b8e44a",
        ...(userData || {}),
      },
      ...(customData || {}),
    };

    console.log(
      `[Test Event] Sending test event to Facebook: ${eventName}`,
      eventData
    );

    // Send to Facebook Conversions API
    const facebookUrl = `https://graph.facebook.com/v18.0/${pixelId}/events`;

    const params = new URLSearchParams({
      data: JSON.stringify([eventData]),
      access_token: accessToken,
      ...(testEventCode && { test_event_code: testEventCode }),
    });

    const response = await fetch(facebookUrl, {
      method: "POST",
      headers: {
        "Content-Type": "application/x-www-form-urlencoded",
      },
      body: params.toString(),
    });

    const data = await response.json() as any;

    console.log(`[Test Event] Facebook response:`, data);

    if (data.error) {
      console.error(`[Test Event] Facebook API error:`, data.error);
      return new Response(
        JSON.stringify({
          success: false,
          error: data.error.message || "Failed to send test event",
          code: data.error.code,
          details: data.error,
        }),
        { status: 400, headers: { "Content-Type": "application/json" } }
      );
    }

    // Log successful test event
    console.log(`[Test Event] ✅ Test event sent successfully:`, {
      pixelId,
      eventName,
      eventId: eventData.event_id,
      timestamp: new Date().toISOString(),
      response: data,
    });

    return new Response(
      JSON.stringify({
        success: true,
        message: `Test event "${eventName}" sent successfully`,
        eventId: eventData.event_id,
        response: data,
        details: {
          pixelId,
          eventName,
          testEventCode,
          sentAt: new Date().toISOString(),
        },
      }),
      { status: 200, headers: { "Content-Type": "application/json" } }
    );
  } catch (error) {
    console.error("[Test Event] Error:", error);
    return new Response(
      JSON.stringify({
        success: false,
        error: error instanceof Error ? error.message : "Unknown error",
      }),
      { status: 500, headers: { "Content-Type": "application/json" } }
    );
  }
}
