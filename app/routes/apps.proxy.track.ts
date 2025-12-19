// Direct route for /apps/proxy/track
import type { ActionFunctionArgs } from "react-router";
import prisma from "~/db.server";
import { parseUserAgent, getDeviceType } from "~/services/device.server";
import { getGeoData } from "~/services/geo.server";

export async function action({ request }: ActionFunctionArgs) {
  const url = new URL(request.url);
  const shop = url.searchParams.get("shop");

  console.log(`[App Proxy] POST track, shop: ${shop}`);

  try {
    const body = await request.json();
    const { appId, eventName } = body;

    console.log(`[App Proxy track] appId: ${appId}, eventName: ${eventName}`);

    if (!appId || !eventName) {
      return Response.json({ error: "Missing required fields" }, { status: 400 });
    }

    const app = await prisma.app.findUnique({
      where: { appId },
      include: { settings: true },
    });

    if (!app) {
      console.log(`[App Proxy track] App not found: ${appId}`);
      return Response.json({ error: "App not found" }, { status: 404 });
    }

    const userAgent = request.headers.get("user-agent") || "";
    const ip = request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || "0.0.0.0";
    const deviceInfo = parseUserAgent(userAgent);
    const deviceType = getDeviceType(userAgent, body.screenWidth);
    const geoData = app.settings?.recordLocation ? await getGeoData(ip) : null;

    const event = await prisma.event.create({
      data: {
        appId: app.id,
        eventName,
        url: body.url || null,
        referrer: body.referrer || null,
        sessionId: body.sessionId || null,
        fingerprint: body.visitorId || null,
        ipAddress: app.settings?.recordIp ? ip : null,
        userAgent,
        browser: deviceInfo.browser,
        browserVersion: deviceInfo.browserVersion,
        os: deviceInfo.os,
        osVersion: deviceInfo.osVersion,
        deviceType,
        screenWidth: body.screenWidth || null,
        screenHeight: body.screenHeight || null,
        pageTitle: body.pageTitle || null,
        utmSource: body.utmSource || null,
        utmMedium: body.utmMedium || null,
        utmCampaign: body.utmCampaign || null,
        city: geoData?.city || null,
        country: geoData?.country || null,
        customData: body.customData || null,
      },
    });

    console.log(`[App Proxy track] Event created: ${event.id}`);

    // Update session
    if (body.sessionId) {
      try {
        const existingSession = await prisma.analyticsSession.findUnique({
          where: { sessionId: body.sessionId },
        });

        if (existingSession) {
          await prisma.analyticsSession.update({
            where: { id: existingSession.id },
            data: {
              lastSeen: new Date(),
              pageviews: eventName === 'pageview' ? { increment: 1 } : undefined,
            },
          });
        } else {
          await prisma.analyticsSession.create({
            data: {
              appId: app.id,
              sessionId: body.sessionId,
              fingerprint: body.visitorId || 'unknown',
              ipAddress: app.settings?.recordIp ? ip : null,
              userAgent,
              browser: deviceInfo.browser,
              os: deviceInfo.os,
              deviceType,
              country: geoData?.country || null,
              pageviews: eventName === 'pageview' ? 1 : 0,
            },
          });
        }
      } catch (sessionError) {
        console.error('[App Proxy track] Session error:', sessionError);
      }
    }

    // Update daily stats
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    await prisma.dailyStats.upsert({
      where: { appId_date: { appId: app.id, date: today } },
      update: {
        pageviews: eventName === 'pageview' ? { increment: 1 } : undefined,
        updatedAt: new Date(),
      },
      create: {
        appId: app.id,
        date: today,
        pageviews: eventName === 'pageview' ? 1 : 0,
        uniqueUsers: 1,
        sessions: 1,
      },
    });

    return Response.json({ success: true, eventId: event.id });
  } catch (error) {
    console.error("[App Proxy track] Error:", error);
    return Response.json({ error: "Failed to track event" }, { status: 500 });
  }
}

