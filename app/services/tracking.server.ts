// Core tracking service

import prisma from '~/db.server';
import { getGeoData } from './geo.server';
import { parseDevice, isBot } from './device.server';
import { sendToMetaCAPI, mapToMetaEvent } from './meta-capi.server';

export interface TrackingPayload {
  appId: string;
  eventName: string;
  url?: string;
  referrer?: string;
  pageTitle?: string;
  fingerprint?: string;
  sessionId?: string;
  
  // Screen data
  screenWidth?: number;
  screenHeight?: number;
  scrollDepth?: number;
  clickX?: number;
  clickY?: number;
  
  // UTM params
  utmSource?: string;
  utmMedium?: string;
  utmCampaign?: string;
  utmTerm?: string;
  utmContent?: string;
  
  // E-commerce
  value?: number;
  currency?: string;
  productId?: string;
  productName?: string;
  quantity?: number;
  
  // User data for Meta
  email?: string;
  phone?: string;
  firstName?: string;
  lastName?: string;
  fbc?: string; // Facebook click ID (_fbc cookie)
  fbp?: string; // Facebook browser ID (_fbp cookie)
  
  // Custom data
  customData?: Record<string, unknown>;
}

export interface TrackingContext {
  ip: string;
  userAgent: string | null;
}

export async function trackEvent(
  payload: TrackingPayload,
  context: TrackingContext
): Promise<{ success: boolean; eventId?: string; error?: string }> {
  try {
    // Skip bot traffic
    if (isBot(context.userAgent)) {
      return { success: true }; // Silently ignore bots
    }

    // Validate app exists and get app token
    const app = await prisma.app.findUnique({
      where: { appId: payload.appId },
      select: { id: true, settings: true },
    });

    if (!app) {
      return { success: false, error: 'Invalid app ID' };
    }

    // Get geo and device data in parallel
    const [geoData, deviceData] = await Promise.all([
      getGeoData(context.ip),
      Promise.resolve(parseDevice(context.userAgent)),
    ]);

    // Create event
    const event = await prisma.event.create({
      data: {
        appId: app.id,
        eventName: payload.eventName,
        url: payload.url,
        referrer: payload.referrer,
        userAgent: context.userAgent,
        ipAddress: app.settings?.recordIp ? context.ip : null,
        
        // Geo data
        country: geoData.country,
        countryCode: geoData.countryCode,
        region: geoData.region,
        city: app.settings?.recordLocation ? geoData.city : null,
        zip: app.settings?.recordLocation ? geoData.zip : null,
        lat: app.settings?.recordLocation ? geoData.lat : null,
        lon: app.settings?.recordLocation ? geoData.lon : null,
        timezone: geoData.timezone,
        isp: geoData.isp,
        
        // Device data
        browser: deviceData.browser,
        browserVersion: deviceData.browserVersion,
        os: deviceData.os,
        osVersion: deviceData.osVersion,
        device: deviceData.device,
        deviceType: deviceData.deviceType,
        deviceVendor: deviceData.deviceVendor,
        
        fingerprint: payload.fingerprint,
        sessionId: payload.sessionId,
        
        // UTM params
        utmSource: payload.utmSource,
        utmMedium: payload.utmMedium,
        utmCampaign: payload.utmCampaign,
        utmTerm: payload.utmTerm,
        utmContent: payload.utmContent,
        
        // Page data
        pageTitle: payload.pageTitle,
        screenWidth: payload.screenWidth,
        screenHeight: payload.screenHeight,
        scrollDepth: payload.scrollDepth,
        clickX: payload.clickX,
        clickY: payload.clickY,
        
        // E-commerce
        value: payload.value,
        currency: payload.currency,
        productId: payload.productId,
        productName: payload.productName,
        quantity: payload.quantity,
        
        customData: payload.customData ? JSON.parse(JSON.stringify(payload.customData)) : undefined,
      },
    });

    // Update analytics session if sessionId provided
    if (payload.sessionId && app.settings?.recordSession) {
      await updateAnalyticsSession(app.id, payload.sessionId, {
        fingerprint: payload.fingerprint,
        ipAddress: context.ip,
        userAgent: context.userAgent,
        browser: deviceData.browser,
        os: deviceData.os,
        deviceType: deviceData.deviceType,
        country: geoData.country,
        isPageview: payload.eventName === 'pageview',
      });
    }

    // Update daily stats for pageviews
    if (payload.eventName === 'pageview') {
      await updateDailyStats(app.id, payload.fingerprint);
    }

    // Forward to Meta Pixel CAPI if enabled
    if (app.settings?.metaPixelEnabled && app.settings?.metaPixelId && app.settings?.metaAccessToken) {
      forwardToMeta(app.settings, {
        eventName: payload.eventName,
        url: payload.url,
        ipAddress: context.ip,
        userAgent: context.userAgent,
        email: payload.email,
        phone: payload.phone,
        firstName: payload.firstName,
        lastName: payload.lastName,
        city: geoData.city,
        state: geoData.region,
        zip: geoData.zip,
        countryCode: geoData.countryCode,
        fingerprint: payload.fingerprint,
        fbc: payload.fbc,
        fbp: payload.fbp,
        value: payload.value,
        currency: payload.currency,
        productId: payload.productId,
        productName: payload.productName,
        quantity: payload.quantity,
        customData: payload.customData,
      }).catch((err) => {
        console.error('Meta CAPI forward error:', err);
      });
    }

    return { success: true, eventId: event.id };
  } catch (error) {
    console.error('Tracking error:', error);
    return { success: false, error: 'Internal error' };
  }
}

async function updateAnalyticsSession(
  appId: string,
  sessionId: string,
  data: {
    fingerprint?: string;
    ipAddress?: string;
    userAgent?: string | null;
    browser?: string | null;
    os?: string | null;
    deviceType?: string | null;
    country?: string | null;
    isPageview: boolean;
  }
) {
  try {
    await prisma.analyticsSession.upsert({
      where: { sessionId },
      create: {
        appId,
        sessionId,
        fingerprint: data.fingerprint,
        ipAddress: data.ipAddress,
        userAgent: data.userAgent,
        browser: data.browser,
        os: data.os,
        deviceType: data.deviceType,
        country: data.country,
        pageviews: data.isPageview ? 1 : 0,
      },
      update: {
        lastSeen: new Date(),
        pageviews: data.isPageview ? { increment: 1 } : undefined,
      },
    });
  } catch (error) {
    console.error('Analytics session update error:', error);
  }
}

async function updateDailyStats(appId: string, fingerprint?: string) {
  try {
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    await prisma.dailyStats.upsert({
      where: {
        appId_date: { appId, date: today },
      },
      create: {
        appId,
        date: today,
        pageviews: 1,
        uniqueUsers: fingerprint ? 1 : 0,
        sessions: 1,
      },
      update: {
        pageviews: { increment: 1 },
        updatedAt: new Date(),
      },
    });
  } catch (error) {
    console.error('Daily stats update error:', error);
  }
}

// Forward event to Meta Conversions API
async function forwardToMeta(
  settings: {
    metaPixelId: string | null;
    metaAccessToken: string | null;
    metaTestEventCode?: string | null;
  },
  eventData: Parameters<typeof mapToMetaEvent>[0]
) {
  if (!settings.metaPixelId || !settings.metaAccessToken) {
    return;
  }

  const metaEvent = mapToMetaEvent(eventData);
  
  const result = await sendToMetaCAPI(
    settings.metaPixelId,
    settings.metaAccessToken,
    [metaEvent],
    settings.metaTestEventCode || undefined
  );

  if (!result.success) {
    console.error('Meta CAPI error:', result.error);
  }
}


