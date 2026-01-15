// API endpoint to get pixel ID for a shop - STRICT DOMAIN MATCHING
import type { LoaderFunctionArgs, ActionFunctionArgs } from "react-router";
import prisma from "~/db.server";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type",
  "X-Content-Type-Options": "nosniff",
};

// Helper function to normalize domain - handles https://, trailing /, www, etc.
function normalizeDomain(domain: string | null | undefined): string | null {
  if (!domain) return null;
  return domain
    .toLowerCase()
    .trim()
    .replace(/^https?:\/\//, '')  // Remove http:// or https://
    .replace(/^www\./, '')         // Remove www.
    .replace(/\/+$/, '')           // Remove trailing slashes
    .trim();
}

// Handle OPTIONS preflight requests for CORS
export async function action({ request }: ActionFunctionArgs) {
  if (request.method === "OPTIONS") {
    return new Response(null, { status: 204, headers: corsHeaders });
  }
  return new Response("Method not allowed", { status: 405, headers: corsHeaders });
}

export async function loader({ request }: LoaderFunctionArgs) {
  const url = new URL(request.url);
  const shop = url.searchParams.get("shop");
  const domain = url.searchParams.get("domain");

  if (!shop) {
    return Response.json(
      { error: "Missing shop parameter" },
      { status: 400, headers: corsHeaders }
    );
  }

  try {
    const user = await prisma.user.findUnique({
      where: { storeUrl: shop },
    });

    if (!user) {
      console.log(`[API Get Pixel ID] User not found for shop: ${shop}`);
      return Response.json(
        { error: "No pixel found for this shop", shop },
        { status: 404, headers: corsHeaders }
      );
    }

    const normalizedRequestDomain = normalizeDomain(domain);
    console.log(`[API Get Pixel ID] Looking for pixel assigned to domain: "${normalizedRequestDomain}"`);

    // Get all apps for this user using raw SQL to ensure we get websiteDomain
    const allApps = await prisma.$queryRaw`
      SELECT 
        a."id",
        a."appId",
        a."name",
        a."enabled",
        a."websiteDomain",
        s."metaPixelId",
        s."metaPixelEnabled",
        s."metaAccessToken",
        s."autoTrackPageviews",
        s."autoTrackClicks",
        s."autoTrackScroll",
        s."autoTrackViewContent",
        s."autoTrackAddToCart",
        s."autoTrackInitiateCheckout",
        s."autoTrackPurchase",
        s."customEventsEnabled"
      FROM "App" a
      LEFT JOIN "AppSettings" s ON s."appId" = a."id"
      WHERE a."userId" = ${user.id}
      ORDER BY a."createdAt" DESC
    ` as any[];

    console.log(`[API Get Pixel ID] Found ${allApps.length} pixels for user`);
    console.log(`[API Get Pixel ID] Pixels:`, allApps.map((a: any) => `${a.name}: "${a.websiteDomain}"`).join(', '));

    // Find pixel with matching domain (normalize stored domain too)
    let matchedApp = null;
    for (const app of allApps) {
      const normalizedStoredDomain = normalizeDomain(app.websiteDomain);
      console.log(`[API Get Pixel ID] Checking pixel "${app.name}": websiteDomain="${app.websiteDomain}", normalized="${normalizedStoredDomain}", requested="${normalizedRequestDomain}"`);
      
      if (normalizedStoredDomain && normalizedRequestDomain && 
          normalizedStoredDomain === normalizedRequestDomain && app.enabled) {
        matchedApp = app;
        console.log(`[API Get Pixel ID] ✅ MATCH FOUND: "${app.name}" for domain "${normalizedRequestDomain}"`);
        break;
      }
    }

    // STRICT MODE: If no domain match found, return error - NO FALLBACK
    if (!matchedApp) {
      console.log(`[API Get Pixel ID] ❌ No pixel assigned to domain: "${normalizedRequestDomain}"`);
      
      return Response.json(
        { 
          error: "No pixel assigned to this domain",
          domain: normalizedRequestDomain,
          domainMatch: false,
          message: "This domain is not assigned to any pixel. Please assign a pixel to this domain in your dashboard.",
          trackingDisabled: true,
          availableAssignments: allApps.map((a: any) => ({
            name: a.name,
            websiteDomain: a.websiteDomain,
            normalizedDomain: normalizeDomain(a.websiteDomain)
          }))
        },
        { status: 404, headers: corsHeaders }
      );
    }

    console.log(`[API Get Pixel ID] ✅ Using pixel: ${matchedApp.appId} (${matchedApp.name}) for domain: ${normalizedRequestDomain}, stored domain: ${matchedApp.websiteDomain}`);

    // Get custom events if enabled
    let customEvents: any[] = [];
    if (matchedApp.customEventsEnabled !== false) {
      customEvents = await prisma.customEvent.findMany({
        where: { appId: matchedApp.id, isActive: true },
        select: { name: true, selector: true, eventType: true, metaEventName: true },
      });
    }

    return Response.json(
      {
        pixelId: matchedApp.appId,
        appName: matchedApp.name,
        metaPixelId: matchedApp.metaPixelId || null,
        enabled: matchedApp.metaPixelEnabled ?? true,
        websiteDomain: matchedApp.websiteDomain,
        domainMatch: true,
        currentDomain: normalizedRequestDomain,
        config: {
          autoPageviews: matchedApp.autoTrackPageviews ?? true,
          autoClicks: matchedApp.autoTrackClicks ?? true,
          autoScroll: matchedApp.autoTrackScroll ?? false,
          autoViewContent: matchedApp.autoTrackViewContent ?? true,
          autoAddToCart: matchedApp.autoTrackAddToCart ?? true,
          autoInitiateCheckout: matchedApp.autoTrackInitiateCheckout ?? true,
          autoPurchase: matchedApp.autoTrackPurchase ?? true,
        },
        customEvents,
      },
      { headers: corsHeaders }
    );
  } catch (error) {
    console.error("[API Get Pixel ID] Error:", error);
    return Response.json(
      { error: "Internal error", details: error instanceof Error ? error.message : String(error) },
      { status: 500, headers: corsHeaders }
    );
  }
}

export default function GetPixelIdRoute() {
  return null;
}
