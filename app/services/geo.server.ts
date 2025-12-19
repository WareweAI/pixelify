// Geo lookup service using IP-API (free tier: 45 requests/minute)

export interface GeoData {
  country: string | null;
  countryCode: string | null;
  region: string | null;
  city: string | null;
  zip: string | null;
  lat: number | null;
  lon: number | null;
  timezone: string | null;
  isp: string | null;
}

const geoCache = new Map<string, { data: GeoData; timestamp: number }>();
const CACHE_TTL = 1000 * 60 * 60; // 1 hour

export async function getGeoData(ip: string): Promise<GeoData> {
  // Skip private/local IPs
  if (isPrivateIP(ip)) {
    return nullGeoData();
  }

  // Check cache
  const cached = geoCache.get(ip);
  if (cached && Date.now() - cached.timestamp < CACHE_TTL) {
    return cached.data;
  }

  try {
    const response = await fetch(
      `http://ip-api.com/json/${ip}?fields=status,country,countryCode,region,city,zip,lat,lon,timezone,isp`
    );
    
    if (!response.ok) {
      console.error(`Geo lookup failed for ${ip}: ${response.status}`);
      return nullGeoData();
    }

    const data = await response.json();
    
    if (data.status !== 'success') {
      return nullGeoData();
    }

    const geoData: GeoData = {
      country: data.country || null,
      countryCode: data.countryCode || null,
      region: data.region || null,
      city: data.city || null,
      zip: data.zip || null,
      lat: data.lat || null,
      lon: data.lon || null,
      timezone: data.timezone || null,
      isp: data.isp || null,
    };

    // Cache the result
    geoCache.set(ip, { data: geoData, timestamp: Date.now() });
    
    // Cleanup old cache entries periodically
    if (geoCache.size > 10000) {
      cleanupCache();
    }

    return geoData;
  } catch (error) {
    console.error(`Geo lookup error for ${ip}:`, error);
    return nullGeoData();
  }
}

function nullGeoData(): GeoData {
  return {
    country: null,
    countryCode: null,
    region: null,
    city: null,
    zip: null,
    lat: null,
    lon: null,
    timezone: null,
    isp: null,
  };
}

function isPrivateIP(ip: string): boolean {
  // IPv4 private ranges
  const privateRanges = [
    /^127\./,           // Loopback
    /^10\./,            // Class A private
    /^172\.(1[6-9]|2\d|3[01])\./,  // Class B private
    /^192\.168\./,      // Class C private
    /^169\.254\./,      // Link-local
    /^::1$/,            // IPv6 loopback
    /^fc00:/,           // IPv6 private
    /^fe80:/,           // IPv6 link-local
  ];
  
  return privateRanges.some(range => range.test(ip));
}

function cleanupCache() {
  const now = Date.now();
  for (const [key, value] of geoCache.entries()) {
    if (now - value.timestamp > CACHE_TTL) {
      geoCache.delete(key);
    }
  }
}



