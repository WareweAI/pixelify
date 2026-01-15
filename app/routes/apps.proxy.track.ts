// Direct route for /apps/proxy/track - STRICT DOMAIN MATCHING
import type { ActionFunctionArgs } from "react-router";
import prisma from "~/db.server";
import { parseUserAgent, getDeviceType } from "~/services/device.server";
import { getGeoData } from "~/services/geo.server";
import { forwardToMeta, refreshMetaAccessToken } from "~/services/meta-capi.server";

// Helper function to normalize domain
function normalizeDomain(domain: string | null | undefined): string | null {
  if (!domain) return null;
  return domain
    .toLowerCase()
    .trim()
    .replace(/^https?:\/\//, '')
    .replace(/^www\./, '')
    .replace(/\/+$/, '')
    .trim();
}

export async function action({ request }: ActionFunctionArgs) {
  const url = new URL(request.url);
  const shop = url.searchParams.get("shop");

  console.log(`[App Proxy] POST track, shop: ${shop}`);

  // Quick database health check
  try {
    await Promise.race([
      prisma.$queryRaw`SELECT 1`,
      new Promise((_, reject) => setTimeout(() => reject(new Error('DB timeout')), 3000))
    ]);
  } catch (dbError) {
    console.error('[App Proxy track] Database connection error:', dbError);
    return Response.json(
      { success: false, error: 'Database temporarily unavailable' },
      { status: 503, headers: { 'Access-Control-Allow-Origin': '*', 'Retry-After': '5' } }
    );
  }

  try {
    const body = await request.json();
    const { appId, eventName } = body;

    // Get the domain from the event URL for website-specific tracking
    let eventDomain = null;
    try {
      if (body.url) {
        eventDomain = new URL(body.url).hostname;
      }
    } catch (e) {
      eventDomain = null;
    }
    const normalizedDomain = normalizeDomain(eventDomain);

    console.log(`[App Proxy track] appId: ${appId}, eventName: ${eventName}, domain: ${normalizedDomain}`);

    if (!eventName) {
      return Response.json({ error: "Missing eventName" }, { status: 400 });
    }

    // Find app by appId using raw SQL to ensure we get websiteDomain
    let app: any = null;
    if (appId) {
      const apps = await prisma.$queryRaw`
        SELECT 
          a."id",
          a."appId",
          a."name",
          a."enabled",
          a."websiteDomain",
          a."userId",
          s."metaPixelId",
          s."metaPixelEnabled",
          s."metaAccessToken",
          s."metaTokenExpiresAt",
          s."metaTestEventCode",
          s."recordIp",
          s."recordLocation",
          s."customEventsEnabled"
        FROM "App" a
        LEFT JOIN "AppSettings" s ON s."appId" = a."id"
        WHERE a."appId" = ${appId}
        LIMIT 1
      ` as any[];
      
      if (apps.length > 0) {
        app = apps[0];
        console.log(`[App Proxy track] Found app by appId: ${app.name}, websiteDomain: "${app.websiteDomain}"`);
      }
    }

    // STRICT DOMAIN MATCHING: Verify the app is assigned to this domain
    if (app && normalizedDomain) {
      const appNormalizedDomain = normalizeDomain(app.websiteDomain);
      console.log(`[App Proxy track] Domain check: stored="${appNormalizedDomain}", event="${normalizedDomain}"`);
      
      if (!appNormalizedDomain) {
        console.log(`[App Proxy track] ❌ Pixel "${app.name}" has no domain assigned`);
        return Response.json({ 
          error: "Pixel has no domain assigned",
          message: "This pixel is not assigned to any domain. Please assign a domain in your dashboard.",
          trackingDisabled: true
        }, { status: 403 });
      }
      
      if (appNormalizedDomain !== normalizedDomain) {
        console.log(`[App Proxy track] ❌ Domain mismatch: pixel assigned to "${appNormalizedDomain}", event from "${normalizedDomain}"`);
        return Response.json({ 
          error: "Domain mismatch",
          message: "This pixel is not assigned to this domain. Event blocked.",
          trackingDisabled: true
        }, { status: 403 });
      }
      
      console.log(`[App Proxy track] ✅ Domain match confirmed: "${normalizedDomain}"`);
    }

    // If no app found by appId, try to find by domain assignment (STRICT)
    if (!app && shop && normalizedDomain) {
      const user = await prisma.user.findUnique({ where: { storeUrl: shop } });
      if (user) {
        // Get all apps using raw SQL
        const allApps = await prisma.$queryRaw`
          SELECT 
            a."id",
            a."appId",
            a."name",
            a."enabled",
            a."websiteDomain",
            a."userId",
            s."metaPixelId",
            s."metaPixelEnabled",
            s."metaAccessToken",
            s."metaTokenExpiresAt",
            s."metaTestEventCode",
            s."recordIp",
            s."recordLocation",
            s."customEventsEnabled"
          FROM "App" a
          LEFT JOIN "AppSettings" s ON s."appId" = a."id"
          WHERE a."userId" = ${user.id} AND a."enabled" = true
          ORDER BY a."createdAt" DESC
        ` as any[];
        
        // Find matching domain
        for (const a of allApps) {
          const appNormalizedDomain = normalizeDomain(a.websiteDomain);
          if (appNormalizedDomain && appNormalizedDomain === normalizedDomain) {
            app = a;
            console.log(`[App Proxy track] ✅ Found pixel "${a.name}" for domain "${normalizedDomain}"`);
            break;
          }
        }
        
        if (!app) {
          console.log(`[App Proxy track] ❌ No pixel assigned to domain: "${normalizedDomain}"`);
          return Response.json({ 
            error: "No pixel assigned to this domain",
            domain: normalizedDomain,
            trackingDisabled: true
          }, { status: 403 });
        }
      }
    }

    if (!app) {
      console.log(`[App Proxy track] App not found: ${appId}`);
      return Response.json({ error: "App not found" }, { status: 404 });
    }

    // Check if app is enabled
    if (!app.enabled) {
      console.log(`[App Proxy track] Pixel "${app.name}" is disabled`);
      return Response.json({ error: "Pixel is disabled", trackingDisabled: true }, { status: 403 });
    }

    const userAgent = request.headers.get("user-agent") || "";
    const ip = request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || "0.0.0.0";
    const deviceInfo = parseUserAgent(userAgent);
    const deviceType = getDeviceType(userAgent, body.screenWidth);
    const geoData = app.recordLocation ? await getGeoData(ip) : null;

    // Create event
    const event = await prisma.event.create({
      data: {
        appId: app.id,
        eventName,
        url: body.url || null,
        referrer: body.referrer || null,
        sessionId: body.sessionId || null,
        fingerprint: body.visitorId || null,
        ipAddress: app.recordIp ? ip : null,
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

    console.log(`[App Proxy track] ✅ Event created: ${event.id} for pixel: ${app.name} (domain: ${app.websiteDomain})`);

    // Update session
    if (body.sessionId) {
      try {
        const existingSession = await prisma.analyticsSession.findUnique({
          where: { sessionId: body.sessionId },
        });

        if (existingSession) {
          await prisma.analyticsSession.update({
            where: { id: existingSession.id },
            data: { lastSeen: new Date(), pageviews: eventName === 'pageview' ? { increment: 1 } : undefined },
          });
        } else {
          await prisma.analyticsSession.create({
            data: {
              appId: app.id,
              sessionId: body.sessionId,
              fingerprint: body.visitorId || 'unknown',
              ipAddress: app.recordIp ? ip : null,
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
      update: { pageviews: eventName === 'pageview' ? { increment: 1 } : undefined, updatedAt: new Date() },
      create: { appId: app.id, date: today, pageviews: eventName === 'pageview' ? 1 : 0, uniqueUsers: 1, sessions: 1 },
    });

    // Forward to Meta CAPI if configured
    if (app.metaPixelEnabled && app.metaAccessToken) {
      const now = new Date();
      const tokenExpiresAt = app.metaTokenExpiresAt;
      const isTokenExpired = tokenExpiresAt && now > new Date(tokenExpiresAt);

      let accessToken = app.metaAccessToken;

      // Try to refresh expired token
      if (isTokenExpired) {
        try {
          const refreshResult = await refreshMetaAccessToken(app.metaAccessToken);
          if (refreshResult.success && refreshResult.newToken) {
            await prisma.appSettings.update({
              where: { appId: app.id },
              data: { metaAccessToken: refreshResult.newToken, metaTokenExpiresAt: refreshResult.expiresAt },
            });
            accessToken = refreshResult.newToken;
          } else {
            console.warn(`[App Proxy track] Token refresh failed, skipping CAPI`);
          }
        } catch (e) {
          console.error(`[App Proxy track] Token refresh error:`, e);
        }
      }

      if (!isTokenExpired || accessToken !== app.metaAccessToken) {
        try {
          const customEvent = await prisma.customEvent.findFirst({
            where: { appId: app.id, name: eventName, isActive: true },
          });

          let metaEventName = customEvent?.metaEventName || eventName;
          let eventData = body.customData || {};
          
          if (customEvent?.eventData) {
            try {
              eventData = { ...JSON.parse(customEvent.eventData), ...eventData };
            } catch (e) {}
          }

          await forwardToMeta({
            pixelId: app.metaPixelId!,
            accessToken,
            testEventCode: app.metaTestEventCode || undefined,
            event: {
              eventName: metaEventName,
              eventTime: Math.floor(Date.now() / 1000),
              eventSourceUrl: body.url,
              actionSource: 'website',
              userData: { clientIpAddress: ip, clientUserAgent: userAgent, externalId: body.visitorId },
              customData: Object.keys(eventData).length > 0 ? eventData : undefined,
            },
          });

          console.log(`[App Proxy track] ✅ CAPI sent successfully`);
        } catch (metaError) {
          console.error(`[App Proxy track] CAPI error:`, metaError);
        }
      }
    }

    return Response.json({ 
      success: true, 
      eventId: event.id,
      pixelName: app.name,
      websiteDomain: app.websiteDomain,
      domainMatch: true
    });
  } catch (error) {
    console.error("[App Proxy track] Error:", error);
    const errorMessage = error instanceof Error ? error.message : String(error);
    
    if (errorMessage.includes('connection pool')) {
      return Response.json({ success: false, error: 'Database temporarily unavailable' }, { status: 503 });
    }
    
    return Response.json({ error: "Failed to track event" }, { status: 500 });
  }
}

export default function AppsProxyTrack() {
  return null;
}
