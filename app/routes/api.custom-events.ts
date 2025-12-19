import type { LoaderFunctionArgs } from "react-router";
import db from "~/db.server";

export async function loader({ request }: LoaderFunctionArgs) {
  const url = new URL(request.url);
  const appId = url.searchParams.get("appId");
  const shop = url.searchParams.get("shop");

  console.log("[Custom Events API] Request:", { appId, shop });

  if (!appId) {
    return Response.json({ success: false, error: "App ID required" }, { status: 400 });
  }

  try {
    // Find the app by appId (not id)
    const app = await db.app.findFirst({
      where: { appId: appId },
      include: { customEvents: true }
    });

    if (!app) {
      console.log("[Custom Events API] App not found:", appId);
      return Response.json({ success: false, error: "App not found" }, { status: 404 });
    }

    console.log("[Custom Events API] Found app with", app.customEvents.length, "custom events");

    // Return active custom events
    const activeEvents = app.customEvents
      .filter(event => event.isActive)
      .map(event => ({
        id: event.id,
        name: event.name,
        buttonText: event.buttonText,
        buttonColor: event.buttonColor,
        textColor: event.textColor,
        data: event.eventData ? JSON.parse(event.eventData) : {}
      }));

    return Response.json({
      success: true,
      events: activeEvents,
      appId: app.id
    });

  } catch (error) {
    console.error("[Custom Events API] Error:", error);
    return Response.json({ success: false, error: "Database error" }, { status: 500 });
  }
}

// Prevent empty chunk warning by providing a default export
export default function ApiCustomEventsRoute() {
  return null;
}