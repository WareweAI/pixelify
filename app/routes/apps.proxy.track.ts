// Direct route for /apps/proxy/track
import type { ActionFunctionArgs } from "react-router";
import prisma from "~/db.server";
import { parseUserAgent, getDeviceType } from "~/services/device.server";
import { getGeoData } from "~/services/geo.server";
import { forwardToMeta } from "~/services/meta-capi.server";

export async function action({ request }: ActionFunctionArgs) {
  const url = new URL(request.url);
  const shop = url.searchParams.get("shop");

  console.log(`[App Proxy] POST track, shop: ${shop}`);

  // Quick database health check with timeout
  try {
    await Promise.race([
      prisma.$queryRaw`SELECT 1`,
      new Promise((_, reject) => setTimeout(() => reject(new Error('DB timeout')), 3000))
    ]);
  } catch (dbError) {
    console.error('[App Proxy track] Database connection error:', dbError);
    return Response.json(
      { success: false, error: 'Database temporarily unavailable' },
      { 
        status: 503,
        headers: {
          'Access-Control-Allow-Origin': '*',
          'Retry-After': '5'
        }
      }
    );
  }

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

      // Log available apps for debugging
      const allApps = await prisma.app.findMany({
        select: { appId: true, name: true },
        take: 10,
      });
      console.log(`[App Proxy track] Available apps:`, allApps.map(a => `${a.appId} (${a.name})`).join(', '));

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

    // Forward ALL events to Meta CAPI (server-side) to bypass adblockers
    if (app.settings?.metaPixelEnabled && app.settings?.metaVerified && app.settings?.metaAccessToken) {
      // Check if token is expired
      const now = new Date();
      const tokenExpiresAt = app.settings.metaTokenExpiresAt;
      const isTokenExpired = tokenExpiresAt && now > tokenExpiresAt;

      if (isTokenExpired) {
        console.warn('[App Proxy track] Facebook access token expired, skipping CAPI send. User needs to re-authenticate.');
      } else {
        try {

          // Check if this is a custom event to get Meta event mapping
          const customEvent = await prisma.customEvent.findFirst({
            where: {
              appId: app.id,
              name: eventName,
              isActive: true,
            },
          });

          // Use Meta event name from custom event mapping if available, otherwise map the event name
          let metaEventName = eventName;
          if (customEvent?.metaEventName) {
            metaEventName = customEvent.metaEventName;
          }

          // Parse event data if provided
          let eventData = body.customData || {};
          if (customEvent?.eventData) {
            try {
              const parsedEventData = JSON.parse(customEvent.eventData);
              eventData = { ...parsedEventData, ...eventData };
            } catch (e) {
              console.error('[App Proxy track] Error parsing custom event data:', e);
            }
          }

          await forwardToMeta({
            pixelId: app.settings.metaPixelId!,
            accessToken: app.settings.metaAccessToken!,
            testEventCode: app.settings.metaTestEventCode || undefined,
            event: {
              eventName: metaEventName,
              eventTime: Math.floor(Date.now() / 1000),
              eventSourceUrl: body.url,
              actionSource: 'website',
              userData: {
                clientIpAddress: ip,
                clientUserAgent: userAgent,
                externalId: body.visitorId,
              },
              customData: Object.keys(eventData).length > 0 ? eventData : undefined,
            },
          });
          console.log(`[App Proxy track] Event "${eventName}" sent to Facebook CAPI as "${metaEventName}" (adblocker-proof)`);
        } catch (metaError) {
          console.error('[App Proxy track] Meta CAPI forwarding error:', metaError);
        }
      }
    }

    return Response.json({ success: true, eventId: event.id });
  } catch (error) {
    console.error("[App Proxy track] Error:", error);
    
    // Check if it's a connection pool error
    const errorMessage = error instanceof Error ? error.message : String(error);
    if (errorMessage.includes('connection pool') || errorMessage.includes('MaxClientsInSessionMode')) {
      return Response.json(
        { success: false, error: 'Database temporarily unavailable' },
        { 
          status: 503,
          headers: {
            'Access-Control-Allow-Origin': '*',
            'Retry-After': '5'
          }
        }
      );
    }
    
    return Response.json({ error: "Failed to track event" }, { status: 500 });
  }
}

export default function AppsProxyTrack() {
  return null;
}
