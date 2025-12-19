import { UAParser } from 'ua-parser-js';

export interface DeviceData {
  browser: string | null;
  browserVersion: string | null;
  os: string | null;
  osVersion: string | null;
  device: string | null;
  deviceType: 'desktop' | 'mobile' | 'tablet' | null;
  deviceVendor: string | null;
}

// Parse user agent and return device info
export function parseUserAgent(userAgent: string | null): DeviceData {
  return parseDevice(userAgent);
}

// Get device type based on user agent and screen width
export function getDeviceType(userAgent: string | null, screenWidth?: number): string | null {
  const deviceData = parseDevice(userAgent);
  
  // If we have screen width, use it to determine device type
  if (screenWidth) {
    if (screenWidth < 768) return 'mobile';
    if (screenWidth < 1024) return 'tablet';
    return 'desktop';
  }
  
  return deviceData.deviceType;
}

export function parseDevice(userAgent: string | null): DeviceData {
  if (!userAgent) {
    return nullDeviceData();
  }

  try {
    const parser = new UAParser(userAgent);
    const result = parser.getResult();

    // Determine device type
    let deviceType: 'desktop' | 'mobile' | 'tablet' | null = null;
    const deviceTypeRaw = result.device.type;
    
    if (deviceTypeRaw === 'mobile') {
      deviceType = 'mobile';
    } else if (deviceTypeRaw === 'tablet') {
      deviceType = 'tablet';
    } else if (result.browser.name) {
      // If it's a browser but no device type, assume desktop
      deviceType = 'desktop';
    }

    return {
      browser: result.browser.name || null,
      browserVersion: result.browser.version || null,
      os: result.os.name || null,
      osVersion: result.os.version || null,
      device: result.device.model || null,
      deviceType,
      deviceVendor: result.device.vendor || null,
    };
  } catch (error) {
    console.error('Device parsing error:', error);
    return nullDeviceData();
  }
}

function nullDeviceData(): DeviceData {
  return {
    browser: null,
    browserVersion: null,
    os: null,
    osVersion: null,
    device: null,
    deviceType: null,
    deviceVendor: null,
  };
}

// Bot detection
export function isBot(userAgent: string | null): boolean {
  if (!userAgent) return false;
  
  const botPatterns = [
    /bot/i,
    /spider/i,
    /crawl/i,
    /slurp/i,
    /mediapartners/i,
    /googlebot/i,
    /bingbot/i,
    /yandex/i,
    /baiduspider/i,
    /facebookexternalhit/i,
    /twitterbot/i,
    /rogerbot/i,
    /linkedinbot/i,
    /embedly/i,
    /quora link preview/i,
    /showyoubot/i,
    /outbrain/i,
    /pinterest/i,
    /slackbot/i,
    /vkShare/i,
    /W3C_Validator/i,
    /whatsapp/i,
    /lighthouse/i,
    /headless/i,
    /phantom/i,
    /selenium/i,
    /webdriver/i,
  ];
  
  return botPatterns.some(pattern => pattern.test(userAgent));
}


