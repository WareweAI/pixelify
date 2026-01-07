// Track API endpoint - receives events from the pixel
import type { ActionFunctionArgs, LoaderFunctionArgs } from 'react-router';
import prisma from '~/db.server';
import { parseUserAgent, getDeviceType } from '~/services/device.server';
import { getGeoData } from '~/services/geo.server';
import { forwardToMeta } from '~/services/meta-capi.server';

export async function action({ request }: ActionFunctionArgs) {
  console.log('[Track] Incoming request method:', request.method, 'URL:', request.url);

  // CORS preflight
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

  // Only POST allowed for actual tracking
  if (request.method !== 'POST') {
    console.log('[Track] Method not allowed:', request.method);
    return Response.json(
      { error: 'Method not allowed' },
      {
        status: 405,
        headers: {
          'Access-Control-Allow-Origin': '*',
          'Access-Control-Allow-Methods': 'POST, OPTIONS',
          'Access-Control-Allow-Headers': 'Content-Type',
        },
      },
    );
  }

  // Handle database connection issues
  try {
    await prisma.$queryRaw`SELECT 1`;
  } catch (dbError) {
    console.error('[Track] Database connection error:', dbError);
    return Response.json(
      {
        success: false,
        error: 'Database temporarily unavailable',
      },
      {
        status: 503,
        headers: {
          'Access-Control-Allow-Origin': '*',
          'Access-Control-Allow-Methods': 'POST, OPTIONS',
          'Access-Control-Allow-Headers': 'Content-Type',
        },
      },
    );
  }

  try {
    const body = await request.json();
    console.log('[Track] Received data keys:', Object.keys(body));
    console.log('[Track] Full data:', JSON.stringify(body, null, 2));

    let data: any;
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
      console.log('[Track] Missing required fields:', {
        appId: !!appId,
        eventName: !!eventName,
      });
      return Response.json(
        { error: 'Missing required fields' },
        {
          status: 400,
          headers: {
            'Access-Control-Allow-Origin': '*',
            'Access-Control-Allow-Methods': 'POST, OPTIONS',
            'Access-Control-Allow-Headers': 'Content-Type',
          },
        },
      );
    }

    // Find app
    console.log(`[Track] Looking up app: ${appId}`);
    const app = await prisma.app.findUnique({
      where: { appId },
      include: { settings: true },
    });

    if (!app) {
      console.log(`[Track] App not found: ${appId}`);

      const anyApp = await prisma.app.findFirst({
        select: { appId: true, name: true },
      });

      if (anyApp) {
        console.log(
          `[Track] Available app example: ${anyApp.appId} (${anyApp.name})`,
        );
      } else {
        console.log('[Track] No apps found in database');
      }

      return Response.json(
        { error: 'App not found' },
        {
          status: 404,
          headers: {
            'Access-Control-Allow-Origin': '*',
            'Access-Control-Allow-Methods': 'POST, OPTIONS',
            'Access-Control-Allow-Headers': 'Content-Type',
          },
        },
      );
    }

    console.log(`[Track] App found: ${app.name} (${app.id})`);
    console.log('[Track] App settings:', {
      recordIp: app.settings?.recordIp,
      recordLocation: app.settings?.recordLocation,
      recordSession: app.settings?.recordSession,
    });

    // Get user agent and IP
    const userAgent = request.headers.get('user-agent') || '';
    const ip =
      request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ||
      request.headers.get('x-real-ip') ||
      '0.0.0.0';

    // Parse device info
    const deviceInfo = parseUserAgent(userAgent);
    const deviceType = getDeviceType(userAgent, screenWidth);

    // Get geo data
    const geoData = app.settings?.recordLocation ? await getGeoData(ip) : null;

    // Create event
    console.log('[Track] Creating event with data:', {
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
        customData:
          customData || properties
            ? JSON.parse(JSON.stringify(customData || properties))
            : null,
      },
    });

    console.log(
      `[Track] Event created successfully: ${event.id} for app ${app.id}`,
    );

    // Update or create session
    let newSessionCreated = false;
    if (sessionId && app.settings?.recordSession !== false) {
      console.log(`[Track] Processing session: ${sessionId}`);

      try {
        const existingSession = await prisma.analyticsSession.findUnique({
          where: { sessionId },
        });

        if (existingSession) {
          console.log(
            `[Track] Updating existing session: ${existingSession.id}`,
          );
          await prisma.analyticsSession.update({
            where: { id: existingSession.id },
            data: {
              lastSeen: new Date(),
              pageviews:
                eventName === 'pageview' ? { increment: 1 } : undefined,
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
          console.log('[Track] New session created successfully');
        }
      } catch (sessionError) {
        console.error('[Track] Session processing error:', sessionError);
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
        pageviews:
          eventName === 'pageview' ? { increment: 1 } : undefined,
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

    // Forward ALL events to Meta CAPI (server-side) to bypass adblockers
    // Both regular events (pageview, click, etc.) and custom events are sent to Facebook CAPI
    // Skip CAPI for test events if no test event code is configured
    const isTestEvent = customData?.test_event === true;
    const skipCapiForTest = isTestEvent && !app.settings?.metaTestEventCode;
    if (app.settings?.metaPixelEnabled && app.settings?.metaVerified && !skipCapiForTest) {
      try {
        // Check if this is a custom event to get Meta event mapping
        const customEvent = await prisma.customEvent.findFirst({
          where: {
            appId: app.id,
            name: eventName,
            isActive: true,
          },
        });

        // Default event name mapping for standard e-commerce events
        const defaultEventMapping: Record<string, string> = {
          // Page tracking
          'pageview': 'PageView',
          'page_view': 'PageView',
          'PageView': 'PageView',
          
          // E-commerce events
          'viewContent': 'ViewContent',
          'view_content': 'ViewContent',
          'ViewContent': 'ViewContent',
          
          'addToCart': 'AddToCart',
          'add_to_cart': 'AddToCart',
          'AddToCart': 'AddToCart',
          
          'initiateCheckout': 'InitiateCheckout',
          'initiate_checkout': 'InitiateCheckout',
          'InitiateCheckout': 'InitiateCheckout',
          
          'purchase': 'Purchase',
          'Purchase': 'Purchase',
          
          'addPaymentInfo': 'AddPaymentInfo',
          'add_payment_info': 'AddPaymentInfo',
          'AddPaymentInfo': 'AddPaymentInfo',
          
          // Lead generation
          'lead': 'Lead',
          'Lead': 'Lead',
          'contact': 'Contact',
          'Contact': 'Contact',
          
          // Engagement
          'search': 'Search',
          'Search': 'Search',
        };

        // Use Meta event name from custom event mapping if available, 
        // otherwise use default mapping, 
        // otherwise use the original event name
        let metaEventName = eventName;
        if (customEvent?.metaEventName) {
          metaEventName = customEvent.metaEventName;
        } else if (defaultEventMapping[eventName]) {
          metaEventName = defaultEventMapping[eventName];
        }

        // Parse event data if provided
        let eventData = properties || {};
        if (customEvent?.eventData) {
          try {
            const parsedEventData = JSON.parse(customEvent.eventData);
            eventData = { ...parsedEventData, ...eventData };
          } catch (e) {
            console.error('[Track] Error parsing custom event data:', e);
          }
        }

        // Add e-commerce data if available
        if (value) eventData.value = value;
        if (currency) eventData.currency = currency;
        if (productId) eventData.product_id = productId;
        if (productName) eventData.product_name = productName;
        if (quantity) eventData.quantity = quantity;

        // Add custom data from the request
        if (customData) {
          const processedCustomData = { ...customData };
          // Ensure value is a number for CAPI
          if (processedCustomData.value !== undefined) {
            const numValue = parseFloat(processedCustomData.value);
            processedCustomData.value = isNaN(numValue) ? undefined : numValue;
          }
          eventData = { ...eventData, ...processedCustomData };
        }

        console.log(`[Track] Preparing to send to Facebook CAPI:`, {
          originalEvent: eventName,
          metaEvent: metaEventName,
          pixelId: app.settings.metaPixelId,
          hasAccessToken: !!app.settings.metaAccessToken,
          eventDataKeys: Object.keys(eventData),
          isCustomEvent: !!customEvent,
          mappingUsed: customEvent?.metaEventName ? 'custom' : (defaultEventMapping[eventName] ? 'default' : 'none')
        });

        await forwardToMeta({
          pixelId: app.settings.metaPixelId!,
          accessToken: app.settings.metaAccessToken!,
          testEventCode: app.settings.metaTestEventCode || undefined,
          event: {
            eventName: metaEventName,
            eventTime: Math.floor(Date.now() / 1000),
            eventSourceUrl: url,
            actionSource: 'website',
            userData: {
              clientIpAddress: ip,
              clientUserAgent: userAgent,
              externalId: fingerprint || visitorId,
            },
            customData: Object.keys(eventData).length > 0 ? eventData : undefined,
          },
        });
        
        const eventType = customEvent ? 'CUSTOM' : 'DEFAULT';
        console.log(`[Track] ✅ SUCCESS: ${eventType} Event "${eventName}" sent to Facebook CAPI as "${metaEventName}" (adblocker-proof)`);
      } catch (error) {
        console.error(`[Track] ❌ FAILED: Meta CAPI forwarding error for event "${eventName}":`, error);
        
        // Log detailed error information for debugging
        console.error('[Track] Meta CAPI Error Details:', {
          eventName,
          pixelId: app.settings?.metaPixelId,
          hasAccessToken: !!app.settings?.metaAccessToken,
          metaVerified: app.settings?.metaVerified,
          metaPixelEnabled: app.settings?.metaPixelEnabled,
          errorMessage: error instanceof Error ? error.message : 'Unknown error',
          errorStack: error instanceof Error ? error.stack : undefined
        });
      }
    } else {
      const reasons = [];
      if (!app.settings?.metaPixelEnabled) reasons.push('Meta Pixel not enabled');
      if (!app.settings?.metaVerified) reasons.push('Meta Pixel not verified');
      if (!app.settings?.metaPixelId) reasons.push('No Meta Pixel ID');
      if (!app.settings?.metaAccessToken) reasons.push('No Meta Access Token');
      
      console.log(`[Track] ⚠️ SKIPPED: Meta CAPI not sent for event "${eventName}" - Reasons: ${reasons.join(', ')}`);
    }

    console.log(
      `[Track] Successfully processed event ${eventName} for app ${app.id}`,
    );
    return Response.json(
      { success: true, eventId: event.id },
      {
        headers: {
          'Access-Control-Allow-Origin': '*',
          'Access-Control-Allow-Methods': 'POST, OPTIONS',
          'Access-Control-Allow-Headers': 'Content-Type',
        },
      },
    );
  } catch (error: any) {
    console.error('[Track] API error:', error);
    console.error(
      '[Track] Error stack:',
      error instanceof Error ? error.stack : 'No stack trace',
    );

    return Response.json(
      {
        success: false,
        error:
          process.env.NODE_ENV === 'development'
            ? error.message
            : 'Internal error',
      },
      {
        status: 500,
        headers: {
          'Access-Control-Allow-Origin': '*',
          'Access-Control-Allow-Methods': 'POST, OPTIONS',
          'Access-Control-Allow-Headers': 'Content-Type',
        },
      },
    );
  }
}

// Loader: handle GET requests for image pixel fallback and OPTIONS
export async function loader({ request }: LoaderFunctionArgs) {
  const corsHeaders = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type',
  };

  // Handle OPTIONS preflight
  if (request.method === 'OPTIONS') {
    return new Response(null, { status: 204, headers: corsHeaders });
  }

  // Handle GET requests for image pixel tracking
  const url = new URL(request.url);
  const eventParam = url.searchParams.get('e');
  const dataParam = url.searchParams.get('d');

  if (eventParam && dataParam) {
    try {
      // Decode base64 data
      const decodedData = JSON.parse(atob(dataParam));
      
      // Process the event similar to POST
      const { appId, eventName } = decodedData;
      
      if (appId && eventName) {
        const app = await prisma.app.findUnique({
          where: { appId },
          include: { settings: true },
        });

        if (app) {
          const userAgent = request.headers.get('user-agent') || '';
          const ip = request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() || '0.0.0.0';
          const deviceInfo = parseUserAgent(userAgent);
          const deviceType = getDeviceType(userAgent, decodedData.screenWidth);
          const geoData = app.settings?.recordLocation ? await getGeoData(ip) : null;

          await prisma.event.create({
            data: {
              appId: app.id,
              eventName: decodedData.eventName,
              url: decodedData.url || null,
              referrer: decodedData.referrer || null,
              sessionId: decodedData.sessionId || null,
              fingerprint: decodedData.fingerprint || null,
              ipAddress: app.settings?.recordIp ? ip : null,
              userAgent,
              browser: deviceInfo.browser,
              browserVersion: deviceInfo.browserVersion,
              os: deviceInfo.os,
              osVersion: deviceInfo.osVersion,
              deviceType,
              screenWidth: decodedData.screenWidth || null,
              screenHeight: decodedData.screenHeight || null,
              pageTitle: decodedData.pageTitle || null,
              utmSource: decodedData.utmSource || null,
              utmMedium: decodedData.utmMedium || null,
              utmCampaign: decodedData.utmCampaign || null,
              utmTerm: decodedData.utmTerm || null,
              utmContent: decodedData.utmContent || null,
              city: geoData?.city || null,
              country: geoData?.country || null,
              customData: decodedData.customData || null,
            },
          });
        }
      }
    } catch (e) {
      console.error('[Track GET] Error processing image pixel:', e);
    }
  }

  // Return 1x1 transparent GIF for image pixel requests
  const gif = Buffer.from('R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7', 'base64');
  return new Response(gif, {
    headers: {
      'Content-Type': 'image/gif',
      'Cache-Control': 'no-store, no-cache, must-revalidate',
      ...corsHeaders,
    },
  });
}

export default function TrackAPI() {
  return null;
}
