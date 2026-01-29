// API endpoint to update page tracking settings for Facebook pixels
import type { ActionFunctionArgs, LoaderFunctionArgs } from "react-router";
import { getShopifyInstance } from "../shopify.server";
import prisma from "../db.server";
import { cache } from "~/lib/cache.server";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type",
  "X-Content-Type-Options": "nosniff",
};

// Handle OPTIONS preflight requests for CORS
export async function action({ request }: ActionFunctionArgs) {
  if (request.method === "OPTIONS") {
    return new Response(null, { status: 204, headers: corsHeaders });
  }

  if (request.method !== "POST") {
    return new Response("Method not allowed", { status: 405, headers: corsHeaders });
  }

  try {
    const shopify = getShopifyInstance();
    const { session } = await shopify.authenticate.admin(request);
    const shop = session.shop;

    const formData = await request.formData();
    const appId = formData.get("appId") as string;
    const trackingPages = formData.get("trackingPages") as string; // "all", "selected", "excluded"
    const selectedPages = formData.get("selectedPages") as string; // JSON array of page values

    console.log(`[Page Tracking Settings] Updating settings for app: ${appId}`);
    console.log(`[Page Tracking Settings] Tracking mode: ${trackingPages}`);
    console.log(`[Page Tracking Settings] Selected pages: ${selectedPages}`);

    if (!appId) {
      return Response.json(
        { error: "Missing app ID" },
        { status: 400, headers: corsHeaders }
      );
    }

    // Find the app and verify it belongs to this user
    const user = await prisma.user.findUnique({
      where: { storeUrl: shop },
    });

    if (!user) {
      return Response.json(
        { error: "User not found" },
        { status: 404, headers: corsHeaders }
      );
    }

    const app = await prisma.app.findFirst({
      where: { 
        appId,
        userId: user.id 
      },
      include: { settings: true },
    });

    if (!app) {
      return Response.json(
        { error: "App not found" },
        { status: 404, headers: corsHeaders }
      );
    }

    // Parse selected pages JSON
    let selectedPagesArray: string[] = [];
    if (selectedPages) {
      try {
        selectedPagesArray = JSON.parse(selectedPages);
      } catch (error) {
        console.error("[Page Tracking Settings] Error parsing selectedPages:", error);
        return Response.json(
          { error: "Invalid selectedPages format" },
          { status: 400, headers: corsHeaders }
        );
      }
    }

    // Update or create app settings
    if (app.settings) {
      await prisma.appSettings.update({
        where: { id: app.settings.id },
        data: {
          trackingPages,
          // Store selected pages in the existing fields based on page type
          selectedCollections: JSON.stringify(selectedPagesArray.filter(page => page.startsWith('/collections/') && !page.includes('*'))),
          selectedProducts: JSON.stringify(selectedPagesArray.filter(page => page.startsWith('/products/') && !page.includes('*'))),
          // For other pages, we'll need to add a new field or store them differently
          // For now, store all selected pages in selectedProductTags as a temporary solution
          selectedProductTags: JSON.stringify(selectedPagesArray.filter(page => 
            !page.startsWith('/collections/') && 
            !page.startsWith('/products/') && 
            page !== 'all'
          )),
        },
      });
      console.log(`[Page Tracking Settings] ✅ Updated settings for app: ${app.name}`);
    } else {
      await prisma.appSettings.create({
        data: {
          appId: app.id,
          trackingPages,
          selectedCollections: JSON.stringify(selectedPagesArray.filter(page => page.startsWith('/collections/') && !page.includes('*'))),
          selectedProducts: JSON.stringify(selectedPagesArray.filter(page => page.startsWith('/products/') && !page.includes('*'))),
          selectedProductTags: JSON.stringify(selectedPagesArray.filter(page => 
            !page.startsWith('/collections/') && 
            !page.startsWith('/products/') && 
            page !== 'all'
          )),
        },
      });
      console.log(`[Page Tracking Settings] ✅ Created settings for app: ${app.name}`);
    }

    // Clear cache for this app and shop
    const cacheKey = `app-settings:${shop}:${appId}`;
    cache.delete(cacheKey);
    console.log(`[Page Tracking Settings] Cleared cache: ${cacheKey}`);

    // Also clear dashboard cache
    cache.invalidatePattern(`dashboard:${shop}:`);

    return Response.json({
      success: true,
      message: "Page tracking settings updated successfully",
      data: {
        appId,
        trackingPages,
        selectedPages: selectedPagesArray,
        timestamp: new Date().toISOString(),
      },
    }, { 
      headers: {
        ...corsHeaders,
        "Cache-Control": "no-cache, no-store, must-revalidate",
      }
    });

  } catch (error) {
    console.error("[Page Tracking Settings] Error:", error);
    
    return Response.json({
      error: "Failed to update page tracking settings",
      details: String(error),
    }, { 
      status: 500, 
      headers: corsHeaders 
    });
  }
}

export async function loader({ request }: LoaderFunctionArgs) {
  try {
    const shopify = getShopifyInstance();
    const { session } = await shopify.authenticate.admin(request);
    const shop = session.shop;

    const url = new URL(request.url);
    const appId = url.searchParams.get("appId");

    if (!appId) {
      return Response.json(
        { error: "Missing app ID" },
        { status: 400, headers: corsHeaders }
      );
    }

    // Find the app and get its page tracking settings
    const user = await prisma.user.findUnique({
      where: { storeUrl: shop },
    });

    if (!user) {
      return Response.json(
        { error: "User not found" },
        { status: 404, headers: corsHeaders }
      );
    }

    const app = await prisma.app.findFirst({
      where: { 
        appId,
        userId: user.id 
      },
      include: { settings: true },
    });

    if (!app) {
      return Response.json(
        { error: "App not found" },
        { status: 404, headers: corsHeaders }
      );
    }

    // Parse and reconstruct selected pages
    let selectedPages: string[] = [];
    if (app.settings) {
      try {
        const collections = app.settings.selectedCollections ? JSON.parse(app.settings.selectedCollections) : [];
        const products = app.settings.selectedProducts ? JSON.parse(app.settings.selectedProducts) : [];
        const otherPages = app.settings.selectedProductTags ? JSON.parse(app.settings.selectedProductTags) : [];
        selectedPages = [...collections, ...products, ...otherPages];
      } catch (error) {
        console.error("[Page Tracking Settings] Error parsing stored pages:", error);
      }
    }

    return Response.json({
      success: true,
      data: {
        appId,
        trackingPages: app.settings?.trackingPages || "all",
        selectedPages,
        hasSettings: !!app.settings,
      },
    }, { 
      headers: {
        ...corsHeaders,
        "Cache-Control": "no-cache, no-store, must-revalidate",
      }
    });

  } catch (error) {
    console.error("[Page Tracking Settings] Error loading settings:", error);
    
    return Response.json({
      error: "Failed to load page tracking settings",
      details: String(error),
    }, { 
      status: 500, 
      headers: corsHeaders 
    });
  }
}

export default function PageTrackingSettingsRoute() {
  return null;
}
