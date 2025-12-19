// Track API endpoint - receives events from the pixel
import type { ActionFunctionArgs } from 'react-router';
import prisma from '~/db.server';
import { parseUserAgent, getDeviceType } from '~/services/device.server';
import { getGeoData } from '~/services/geo.server';
import { forwardToMeta } from '~/services/meta-capi.server';

export async function action({ request }: ActionFunctionArgs) {
  console.log('[Track] Incoming request method:', request.method, 'URL:', request.url);

  if (request.method === 'OPTIONS') {
    console.log('[Track] Handling OPTIONS preflight');
    return new Response(null, {
      status: 200,
      headers: {
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Methods': 'POST, OPTIONS',
        'Access-Control-Allow-Headers': 'Content-Type',
      },
    });
  }

  if (request.method !== 'POST') {
    console.log('[Track] Method not allowed:', request.method);
    return Response.json({ error: 'Method not allowed' }, { status: 405 });
  }

  // Handle database connection issues
  try {
    // Test database connection first
    await prisma.$queryRaw`SELECT 1`;
  } catch (dbError) {
    console.error('[Track] Database connection error:', dbError);
    return Response.json({
      success: false,
      error: 'Database temporarily unavailable'
    }, { status: 503 });
  }

  try {
    const body = await request.json();
    console.log('[Track] Received data keys:', Object.keys(body));
    console.log('[Track] Full data:', JSON.stringify(body, null, 2));

    let data;
    if (body.query && body.variables) {
      // GraphQL format
      console.log('[Track] Processing as GraphQL');
      data = body.variables.input;
    } else {
      // Direct JSON format
      data = body;
    }

    const {
      appId,
      eventName,
      url,
      referrer,
      sessionId,
      visitorId,
      fingerprint,
      screenWidth,
      screenHeight,
      language,
      properties,
      // Additional fields from pixel script
      pageTitle,
      utmSource,
      utmMedium,
      utmCampaign,
      utmTerm,
      utmContent,
      value,
      currency,
      productId,
      productName,
      quantity,
      customData,
    } = data;

    console.log(`[Track] Processing event: ${eventName} for app: ${appId}`);

    if (!appId || !eventName) {
      console.log('[Track] Missing required fields:', { appId: !!appId, eventName: !!eventName });
      return Response.json({ error: 'Missing required fields' }, { status: 400 });
    }

    // Find app
    console.log(`[Track] Looking up app: ${appId}`);
    const app = await prisma.app.findUnique({
      where: { appId },
      include: { settings: true },
    });

    if (!app) {
      console.log(`[Track] App not found: ${appId}`);

      // Try to find any app to see what IDs exist
      const anyApp = await prisma.app.findFirst({
        select: { appId: true, name: true },
      });

      if (anyApp) {
        console.log(`[Track] Available app example: ${anyApp.appId} (${anyApp.name})`);
      } else {
        console.log("[Track] No apps found in database");
      }

      return Response.json({ error: 'App not found' }, { status: 404 });
    }

    console.log(`[Track] App found: ${app.name} (${app.id})`);
    console.log(`[Track] App settings:`, {
      recordIp: app.settings?.recordIp,
      recordLocation: app.settings?.recordLocation,
      recordSession: app.settings?.recordSession,
    });

    // Get user agent and IP
    const userAgent = request.headers.get('user-agent') || '';
    const ip = request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ||
                request.headers.get('x-real-ip') ||
                '0.0.0.0';

    // Parse device info
    const deviceInfo = parseUserAgent(userAgent);
    const deviceType = getDeviceType(userAgent, screenWidth);

    // Get geo data
    const geoData = app.settings?.recordLocation ? await getGeoData(ip) : null;

    // Create event
    console.log(`[Track] Creating event with data:`, {
      appId: app.id,
      eventName,
      sessionId,
      fingerprint,
      deviceType,
      geoData: geoData ? { city: geoData.city, country: geoData.country } : null,
    });

    console.log('[Track] Creating event in database...');
    const event = await prisma.event.create({
      data: {
        appId: app.id,
        eventName,
        url: url || null,
        referrer: referrer || null,
        sessionId: sessionId || null,
        fingerprint: fingerprint || null,
        ipAddress: app.settings?.recordIp ? ip : null,
        userAgent,
        browser: deviceInfo.browser,
        browserVersion: deviceInfo.browserVersion,
        os: deviceInfo.os,
        osVersion: deviceInfo.osVersion,
        deviceType,
        screenWidth: screenWidth || null,
        screenHeight: screenHeight || null,
        pageTitle: pageTitle || null,
        // UTM parameters
        utmSource: utmSource || null,
        utmMedium: utmMedium || null,
        utmCampaign: utmCampaign || null,
        utmTerm: utmTerm || null,
        utmContent: utmContent || null,
        // E-commerce data
        value: value ? parseFloat(value) : null,
        currency: currency || null,
        productId: productId || null,
        productName: productName || null,
        quantity: quantity ? parseInt(quantity) : null,
        // Geo data
        city: geoData?.city || null,
        region: geoData?.region || null,
        country: geoData?.country || null,
        countryCode: geoData?.countryCode || null,
        timezone: geoData?.timezone || null,
        // Custom data
        customData: customData || properties ? JSON.parse(JSON.stringify(customData || properties)) : null,
      },
    });

    console.log(`[Track] Event created successfully: ${event.id} for app ${app.id}`);

    // Update or create session
    let newSessionCreated = false;
    if (sessionId && app.settings?.recordSession !== false) {
      console.log(`[Track] Processing session: ${sessionId}`);

      try {
        const existingSession = await prisma.analyticsSession.findUnique({
          where: { sessionId },
        });

        if (existingSession) {
          console.log(`[Track] Updating existing session: ${existingSession.id}`);
          await prisma.analyticsSession.update({
            where: { id: existingSession.id },
            data: {
              lastSeen: new Date(),
              pageviews: eventName === 'pageview' ? { increment: 1 } : undefined,
            },
          });
        } else {
          console.log(`[Track] Creating new session for: ${sessionId}`);
          await prisma.analyticsSession.create({
            data: {
              appId: app.id,
              sessionId,
              fingerprint: fingerprint || visitorId || 'unknown',
              ipAddress: app.settings?.recordIp ? ip : null,
              userAgent,
              browser: deviceInfo.browser,
              os: deviceInfo.os,
              deviceType,
              country: geoData?.country || null,
              pageviews: eventName === 'pageview' ? 1 : 0,
            },
          });
          newSessionCreated = true;
          console.log(`[Track] New session created successfully`);
        }
      } catch (sessionError) {
        console.error('[Track] Session processing error:', sessionError);
        // Continue without failing the entire request
      }
    }

    // Update daily stats
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    await prisma.dailyStats.upsert({
      where: {
        appId_date: { appId: app.id, date: today },
      },
      update: {
        pageviews: eventName === 'pageview' ? { increment: 1 } : undefined,
        sessions: newSessionCreated ? { increment: 1 } : undefined,
        uniqueUsers: newSessionCreated ? { increment: 1 } : undefined,
        updatedAt: new Date(),
      },
      create: {
        appId: app.id,
        date: today,
        pageviews: eventName === 'pageview' ? 1 : 0,
        uniqueUsers: newSessionCreated ? 1 : 0,
        sessions: newSessionCreated ? 1 : 0,
      },
    });

    // Forward to Meta if enabled
    if (app.settings?.metaPixelEnabled && app.settings?.metaVerified) {
      try {
        await forwardToMeta({
          pixelId: app.settings.metaPixelId!,
          accessToken: app.settings.metaAccessToken!,
          testEventCode: app.settings.metaTestEventCode || undefined,
          event: {
            eventName,
            eventTime: Math.floor(Date.now() / 1000),
            eventSourceUrl: url,
            actionSource: 'website',
            userData: {
              clientIpAddress: ip,
              clientUserAgent: userAgent,
              externalId: fingerprint || visitorId,
            },
            customData: properties,
          },
        });
      } catch (error) {
        console.error('Meta forwarding error:', error);
        // Don't fail the request if Meta forwarding fails
      }
    }

    console.log(`[Track] Successfully processed event ${eventName} for app ${app.id}`);
    return Response.json({ success: true, eventId: event.id }, {
      headers: {
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Methods': 'POST, OPTIONS',
        'Access-Control-Allow-Headers': 'Content-Type',
      },
    });
  } catch (error: any) {
    console.error('[Track] API error:', error);
    console.error('[Track] Error stack:', error instanceof Error ? error.stack : 'No stack trace');

    // Return success to avoid breaking the pixel, but log the error
    return Response.json({
      success: false,
      error: process.env.NODE_ENV === 'development' ? error.message : 'Internal error'
    }, {
      status: 500,
      headers: {
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Methods': 'POST, OPTIONS',
        'Access-Control-Allow-Headers': 'Content-Type',
      },
    });
  }
}

// Also allow GET for beacon fallback (some browsers)
export async function loader({ request }: ActionFunctionArgs) {
  return Response.json({ error: 'Use POST method' }, { status: 405 });
}


export default function TrackAPI() {
  return null;
}