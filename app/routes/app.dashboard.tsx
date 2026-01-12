import { useState, useCallback, useEffect } from "react";
import type { ActionFunctionArgs, LoaderFunctionArgs } from "react-router";
import { useLoaderData, useFetcher, useSearchParams } from "react-router";
import { getShopifyInstance } from "../shopify.server";
import prisma from "../db.server";
import { generateRandomPassword } from "~/lib/crypto.server";
import { createAppWithSettings, renameApp, deleteAppWithData } from "~/services/app.service.server";
import {
  Page,
  Card,
  Button,
  TextField,
  Layout,
  Text,
  BlockStack,
  InlineStack,
  Banner,
  RadioButton,
  Icon,
  Select,
  Modal,
  Divider,
  Badge,
  DataTable,
} from "@shopify/polaris";
import { CheckIcon, ConnectIcon, ExportIcon } from "@shopify/polaris-icons";

export const loader = async ({ request }: LoaderFunctionArgs) => {
  const shopify = getShopifyInstance();

  if (!shopify?.authenticate) {
    console.error("Shopify not configured in app.dashboard loader");
    throw new Response("Shopify configuration not found", { status: 500 });
  }

  let session, admin;
  try {
    const authResult = await shopify.authenticate.admin(request);
    session = authResult.session;
    admin = authResult.admin;
  } catch (error) {
    // If it's a redirect response (302), re-throw it for proper redirect handling
    if (error instanceof Response && error.status === 302) {
      throw error;
    }
    console.error("Authentication error:", error);
    // Otherwise, treat as database/server error
    throw new Response("Unable to authenticate. Database connection may be unavailable. Please try again later.", { status: 503 });
  }
  const shop = session.shop;
  
  // Handle charge approval redirect AFTER authentication
  const chargeId = new URL(request.url).searchParams.get('charge_id');
  if (chargeId) {
    console.log(`✅ Charge approved for shop ${shop}, charge_id: ${chargeId}`);
    
    // Fetch current subscription from Shopify to update plan
    try {
      const response = await admin.graphql(`
        query {
          appInstallation {
            activeSubscriptions {
              id
              name
              status
            }
          }
        }
      `);

      const data = await response.json() as any;
      const activeSubscriptions = data?.data?.appInstallation?.activeSubscriptions || [];

      if (activeSubscriptions.length > 0) {
        const activeSubscription = activeSubscriptions.find((sub: any) =>
          sub.status === 'ACTIVE' || sub.status === 'active'
        );

        if (activeSubscription) {
          // Only recognize Free, Basic, and Advance plans
          const shopifyPlanName = activeSubscription.name;
          let currentPlan = 'Free';
          
          if (shopifyPlanName === 'Free' || shopifyPlanName === 'Basic' || shopifyPlanName === 'Advance') {
            currentPlan = shopifyPlanName;
          }

          // Update plan in database
          const user = await prisma.user.findUnique({ where: { storeUrl: shop } });
          if (user) {
            await prisma.app.updateMany({
              where: { userId: user.id },
              data: { plan: currentPlan },
            });
            console.log(`✅ Updated plan to ${currentPlan} after charge approval`);
          }
        }
      }
    } catch (error: any) {
      console.error('⚠️ Failed to update plan after charge approval:', error);
    }
    
    // Redirect to dashboard without charge_id to avoid showing it in URL
    const { redirect } = await import("react-router");
    throw redirect("/app/dashboard");
  }
  const url = new URL(request.url);
  const purchaseOffset = parseInt(url.searchParams.get('purchaseOffset') || '0');
  const purchaseLimit = 10;

  let user = await prisma.user.findUnique({
    where: { storeUrl: shop },
  });

  if (!user) {
    user = await prisma.user.create({
      data: {
        storeUrl: shop,
        password: generateRandomPassword(),
      },
    });
  }

  const apps = await prisma.app.findMany({
    where: { userId: user.id },
    include: {
      _count: {
        select: { events: true, analyticsSessions: true },
      },
      settings: true,
    },
    orderBy: { createdAt: "desc" },
  });

  // Calculate aggregated dashboard stats
  const totalPixels = apps.length;
  const totalEvents = apps.reduce((sum: any, app: { _count: { events: any; }; }) => sum + app._count.events, 0);
  const totalSessions = apps.reduce((sum: any, app: { _count: { analyticsSessions: any; }; }) => sum + app._count.analyticsSessions, 0);

  // Get recent purchase events across all apps (last 7 days)
  const sevenDaysAgo = new Date();
  sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);

  // Get total count for pagination
  const totalPurchaseEvents = await prisma.event.count({
    where: {
      app: {
        userId: user.id,
      },
      eventName: "Purchase",
      createdAt: { gte: sevenDaysAgo },
    },
  });

  const recentPurchaseEvents = await prisma.event.findMany({
    where: {
      app: {
        userId: user.id,
      },
      eventName: "Purchase",
      createdAt: { gte: sevenDaysAgo },
    },
    orderBy: { createdAt: "desc" },
    take: purchaseLimit,
    skip: purchaseOffset,
    include: {
      app: {
        select: { name: true, appId: true },
      },
    },
  });

  // Calculate today's stats
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const todayEvents = await prisma.event.count({
    where: {
      app: {
        userId: user.id,
      },
      createdAt: { gte: today },
    },
  });

  return {
    apps,
    hasPixels: apps.length > 0,
    stats: {
      totalPixels,
      totalEvents,
      totalSessions,
      todayEvents,
    },
    recentPurchaseEvents: recentPurchaseEvents.map((e: any) => ({
      id: e.id,
      orderId: e.customData?.order_id || e.productId || '-',
      value: e.value || (typeof e.customData?.value === 'number' ? e.customData.value : parseFloat(e.customData?.value) || null),
      currency: e.currency || e.customData?.currency || 'USD',
      pixelId: e.app.appId,
      source: e.utmSource || '-',
      purchaseTime: e.createdAt,
    })),
    totalPurchaseEvents,
    purchaseOffset,
    purchaseLimit,
  };
};

export const action = async ({ request }: ActionFunctionArgs) => {
  const shopify = getShopifyInstance();
  
  if (!shopify?.authenticate) {
    throw new Response("Shopify configuration not found", { status: 500 });
  }

  const { session } = await shopify.authenticate.admin(request);
  const shop = session.shop;
  const formData = await request.formData();
  const intent = formData.get("intent") as string;

  const user = await prisma.user.findUnique({ where: { storeUrl: shop } });
  if (!user) {
    return { error: "User not found" };
  }

  if (intent === "create-pixel") {
    const pixelName = formData.get("pixelName") as string;
    const pixelId = formData.get("pixelId") as string;
    const accessToken = formData.get("accessToken") as string;

    if (!pixelName || !pixelId) {
      return { error: "Pixel name and Facebook Pixel ID are required" };
    }

    if (!accessToken) {
      return { error: "Access token is required to validate the pixel" };
    }

    // Check if pixel already exists for this user
    const existingPixel = await prisma.appSettings.findFirst({
      where: {
        metaPixelId: pixelId,
        app: {
          userId: user.id
        }
      },
      include: {
        app: {
          select: { name: true }
        }
      }
    });

    if (existingPixel) {
      return { error: `Pixel "${pixelId}" already exists in your app as "${existingPixel.app.name}". Each pixel can only be added once.` };
    }

    try {
      // Validate the pixel exists and user has access
      const validateResponse = await fetch(`https://graph.facebook.com/v24.0/${pixelId}?access_token=${accessToken}`);
      const validateData = await validateResponse.json();

      if (validateData.error) {
        return { error: `Pixel validation failed: ${validateData.error.message}` };
      }

      // Create new pixel
      const app = await prisma.app.create({
        data: {
          userId: user.id,
          name: pixelName,
          appId: `pixel_${Date.now()}`,
          appToken: `token_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`,
        },
      });

      // Create settings for the pixel
      await prisma.appSettings.create({
        data: {
          appId: app.id,
          metaPixelId: pixelId,
          metaAccessToken: accessToken,
          metaPixelEnabled: true,
          metaVerified: true, // Set to true since we validated it
          autoTrackPageviews: true,
          autoTrackClicks: true,
          autoTrackScroll: false,
          recordIp: true,
          recordLocation: true,
          recordSession: true,
        },
      });

      return { success: true, message: "Facebook Pixel validated and created successfully", step: 2 };
    } catch (error) {
      console.error("Error validating pixel:", error);
      return { error: "Failed to validate pixel. Please check your Pixel ID and Access Token." };
    }
  }

  if (intent === "validate-pixel") {
    const pixelId = formData.get("pixelId") as string;
    const accessToken = formData.get("accessToken") as string;
    
    if (!pixelId || !accessToken) {
      return { error: "Pixel ID and access token are required" };
    }

    try {
      // Validate the pixel exists and user has access
      const response = await fetch(`https://graph.facebook.com/v24.0/${pixelId}?access_token=${accessToken}`);
      const data = await response.json();

      if (data.error) {
        return { error: `Pixel validation failed: ${data.error.message}` };
      }

      return { success: true, message: `✅ Pixel validated successfully! Name: ${data.name || 'Unknown'}` };
    } catch (error) {
      console.error("Error validating pixel:", error);
      return { error: "Failed to validate pixel. Please check your Pixel ID and Access Token." };
    }
  }

  if (intent === "create") {
    const name = formData.get("name") as string;
    const metaAppId = formData.get("metaAppId") as string;
    const metaAccessToken = formData.get("metaAccessToken") as string;

    if (!name || !metaAppId) {
      return { error: "App Name and Pixel ID are required" };
    }

    // Check if pixel already exists for this user
    const existingPixel = await prisma.appSettings.findFirst({
      where: {
        metaPixelId: metaAppId,
        app: {
          userId: user.id
        }
      },
      include: {
        app: {
          select: { name: true }
        }
      }
    });

    if (existingPixel) {
      return { error: `Pixel "${metaAppId}" already exists in your app as "${existingPixel.app.name}". Each pixel can only be added once.` };
    }

    try {
      const result = await createAppWithSettings({
        userId: user.id,
        name,
        metaAppId,
        metaAccessToken: metaAccessToken || "",
      });

      // Get app with counts for response
      const app = await prisma.app.findUnique({
        where: { id: result.app.id },
        include: {
          _count: {
            select: { events: true, analyticsSessions: true },
          },
          settings: true,
        },
      });

      return { success: true, app, intent: "create", step: 2, message: "Facebook Pixel created successfully! Now choose your timezone." };
    } catch (error: any) {
      console.error("Create app error:", error);
      return { error: error.message || "Failed to create pixel" };
    }
  }

  if (intent === "rename") {
    const appId = formData.get("appId") as string;
    const newName = formData.get("newName") as string;

    if (!newName) {
      return { error: "Name is required" };
    }

    try {
      await renameApp(appId, newName);
      return { success: true, intent: "rename" };
    } catch (error: any) {
      console.error("Rename error:", error);
      return { error: error.message || "Failed to rename pixel" };
    }
  }

  if (intent === "delete") {
    const appId = formData.get("appId") as string;
    
    try {
      await deleteAppWithData(appId);
      return { success: true, intent: "delete" };
    } catch (error: any) {
      console.error("Delete error:", error);
      return { error: error.message || "Failed to delete pixel" };
    }
  }

  if (intent === "save-timezone") {
    const appId = formData.get("appId") as string;
    const timezone = formData.get("timezone") as string;
    
    if (!appId || !timezone) {
      return { error: "App ID and timezone are required" };
    }

    try {
      // Update the app settings with timezone
      await prisma.appSettings.updateMany({
        where: {
          app: {
            id: appId,
            userId: user.id
          }
        },
        data: {
          timezone: timezone
        }
      });

      return { success: true, message: "Timezone saved successfully!", step: 3 };
    } catch (error: any) {
      console.error("Save timezone error:", error);
      return { error: error.message || "Failed to save timezone" };
    }
  }

  if (intent === "toggle-pixel") {
    const appId = formData.get("appId") as string;
    const enabled = formData.get("enabled") === "true";
    
    if (!appId) {
      return { error: "App ID is required" };
    }

    try {
      // Update the app enabled status
      await prisma.app.update({
        where: {
          id: appId,
          userId: user.id
        },
        data: {
          enabled: enabled
        }
      });

      return { success: true, message: `Pixel ${enabled ? 'enabled' : 'disabled'} successfully!` };
    } catch (error: any) {
      console.error("Toggle pixel error:", error);
      return { error: error.message || "Failed to toggle pixel" };
    }
  }

  if (intent === "fetch-facebook-pixels") {
    const accessToken = formData.get("accessToken") as string;
    
    if (!accessToken) {
      return { error: "Facebook access token is required" };
    }

    try {
      // Step 1: Fetch ad accounts to get business account ID
      console.log("[Dashboard] Fetching Facebook ad accounts for pixels...");
      const adAccountsResponse = await fetch(
        `https://graph.facebook.com/v24.0/me/adaccounts?fields=id,name,business&access_token=${accessToken}`
      );
      const adAccountsData = await adAccountsResponse.json();
      console.log("[Dashboard] Ad accounts response:", adAccountsData);

      if (adAccountsData.error) {
        console.error("[Dashboard] Ad accounts error:", adAccountsData.error);
        return {
          error: `Failed to access Facebook ad accounts. This usually means your access token doesn't have the required permissions (ads_read, business_management) or has expired. Please generate a new token with proper permissions.`
        };
      }

      let businessId: string | null = null;
      let businessName: string | null = null;
      let adAccounts: any[] = [];

      if (adAccountsData.data && adAccountsData.data.length > 0) {
        // Filter to active ad accounts only
        adAccounts = adAccountsData.data.filter((acc: any) => acc.account_status === 1);

        const accountWithBusiness = adAccounts.find((acc: any) => acc.business && acc.business.id);
        if (accountWithBusiness) {
          businessId = accountWithBusiness.business.id;
          businessName = accountWithBusiness.business.name || "Business Manager";
          console.log(`[Dashboard] Using business account: ${businessName} (${businessId})`);
        }
      }

      const pixels: Array<{ id: string; name: string; accountName: string }> = [];

      if (businessId) {
        // Step 2: Fetch pixels from business account: /{businessId}/adspixels
        console.log(`[Dashboard] Fetching pixels from business: ${businessName} (${businessId})`);
        const pixelsResponse = await fetch(
          `https://graph.facebook.com/v24.0/${businessId}/adspixels?fields=id,name,creation_time,last_fired_time&access_token=${accessToken}`
        );
        const pixelsData = await pixelsResponse.json();
        console.log("[Dashboard] Business pixels response:", pixelsData);

        if (pixelsData.error) {
          console.error("[Dashboard] Business pixels error:", pixelsData.error);
        } else if (pixelsData.data) {
          pixelsData.data.forEach((pixel: any) => {
            pixels.push({
              id: pixel.id,
              name: pixel.name,
              accountName: businessName || "Business Manager",
            });
          });
        }
      }

      // Step 2b: If no pixels from business, fetch pixels from individual ad accounts
      if (pixels.length === 0 && adAccounts.length > 0) {
        console.log(`[Dashboard] No pixels from business. Fetching from ${adAccounts.length} ad accounts...`);

        for (const account of adAccounts) {
          try {
            console.log(`[Dashboard] Fetching pixels from ad account: ${account.name} (${account.id})`);
            const pixelsResponse = await fetch(
              `https://graph.facebook.com/v24.0/${account.id}/adspixels?fields=id,name,creation_time,last_fired_time&access_token=${accessToken}`
            );
            const pixelsData = await pixelsResponse.json();

            if (!pixelsData.error && pixelsData.data) {
              pixelsData.data.forEach((pixel: any) => {
                pixels.push({
                  id: pixel.id,
                  name: pixel.name,
                  accountName: account.name,
                });
              });
            }
          } catch (error) {
            console.error(`[Dashboard] Error fetching pixels from account ${account.id}:`, error);
          }
        }
      }

      // Step 3: If no pixels found, provide helpful error message
      if (pixels.length === 0) {
        if (adAccounts.length === 0) {
          return {
            error: "No ad accounts found. You need to create at least one ad account in Facebook Ads Manager to use pixels. Visit https://ads.facebook.com to create an ad account."
          };
        } else {
          return {
            error: "No pixels found in your ad accounts. Create pixels in Facebook Events Manager (https://business.facebook.com/events_manager) and try again."
          };
        }
      }

      console.log(`[Dashboard] Successfully fetched ${pixels.length} pixels from Facebook`);
      console.log("[Dashboard] Pixels:", pixels);

      return { success: true, facebookPixels: pixels };
    } catch (error) {
      console.error("Error fetching Facebook pixels:", error);
      return { error: "Failed to fetch pixels from Facebook. Please check your access token." };
    }
  }

  return { error: "Invalid action" };
};

export default function DashboardPage() {
  const { apps, hasPixels, stats, recentPurchaseEvents, totalPurchaseEvents, purchaseOffset, purchaseLimit } = useLoaderData<typeof loader>();
  const fetcher = useFetcher();
  const [searchParams] = useSearchParams();
  const [mounted, setMounted] = useState(false);
  const [currentStep, setCurrentStep] = useState(1);
  const [inputMethod, setInputMethod] = useState("auto");
  const [showFacebookModal, setShowFacebookModal] = useState(false);
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [showRenameModal, setShowRenameModal] = useState<any>(null);
  const [showDeleteModal, setShowDeleteModal] = useState<any>(null);
  const [showSnippet, setShowSnippet] = useState<string | null>(null);
  const [facebookAccessToken, setFacebookAccessToken] = useState("");
  const [selectedFacebookPixel, setSelectedFacebookPixel] = useState("");
  const [facebookPixels, setFacebookPixels] = useState<Array<{id: string, name: string, accountName: string}>>([]);
  const [isConnectedToFacebook, setIsConnectedToFacebook] = useState(false);
  const [facebookError, setFacebookError] = useState("");
  const [facebookUser, setFacebookUser] = useState<{id: string, name: string, picture?: string | null} | null>(null);
  const [isRefreshingToken, setIsRefreshingToken] = useState(false);
  
  // Pixel validation state
  const [isValidatingPixel, setIsValidatingPixel] = useState(false);
  const [pixelValidationResult, setPixelValidationResult] = useState<{
    valid: boolean;
    pixelName?: string;
    error?: string;
  } | null>(null);
  
  // Timezone state
  const [selectedTimezone, setSelectedTimezone] = useState("GMT+0");
  const [createdAppId, setCreatedAppId] = useState<string | null>(null);
  
  // Comprehensive GMT timezone options (like Omega Pixel)
  const timezoneOptions = [
    { label: "(GMT+0:00) UTC - Coordinated Universal Time", value: "GMT+0" },
    { label: "(GMT+0:00) London, Dublin, Lisbon", value: "GMT+0" },
    { label: "(GMT+1:00) Paris, Berlin, Rome, Madrid", value: "GMT+1" },
    { label: "(GMT+2:00) Cairo, Athens, Helsinki, Kyiv", value: "GMT+2" },
    { label: "(GMT+3:00) Moscow, Istanbul, Riyadh, Nairobi", value: "GMT+3" },
    { label: "(GMT+3:30) Tehran", value: "GMT+3:30" },
    { label: "(GMT+4:00) Dubai, Baku, Tbilisi", value: "GMT+4" },
    { label: "(GMT+4:30) Kabul", value: "GMT+4:30" },
    { label: "(GMT+5:00) Karachi, Tashkent", value: "GMT+5" },
    { label: "(GMT+5:30) Mumbai, New Delhi, Kolkata", value: "GMT+5:30" },
    { label: "(GMT+5:45) Kathmandu", value: "GMT+5:45" },
    { label: "(GMT+6:00) Dhaka, Almaty", value: "GMT+6" },
    { label: "(GMT+6:30) Yangon", value: "GMT+6:30" },
    { label: "(GMT+7:00) Bangkok, Jakarta, Hanoi", value: "GMT+7" },
    { label: "(GMT+8:00) Singapore, Hong Kong, Beijing, Perth", value: "GMT+8" },
    { label: "(GMT+9:00) Tokyo, Seoul", value: "GMT+9" },
    { label: "(GMT+9:30) Adelaide, Darwin", value: "GMT+9:30" },
    { label: "(GMT+10:00) Sydney, Melbourne, Brisbane", value: "GMT+10" },
    { label: "(GMT+11:00) Solomon Islands, New Caledonia", value: "GMT+11" },
    { label: "(GMT+12:00) Auckland, Fiji", value: "GMT+12" },
    { label: "(GMT+13:00) Samoa, Tonga", value: "GMT+13" },
    { label: "(GMT-1:00) Azores, Cape Verde", value: "GMT-1" },
    { label: "(GMT-2:00) Mid-Atlantic", value: "GMT-2" },
    { label: "(GMT-3:00) São Paulo, Buenos Aires", value: "GMT-3" },
    { label: "(GMT-3:30) Newfoundland", value: "GMT-3:30" },
    { label: "(GMT-4:00) Atlantic Time, Caracas", value: "GMT-4" },
    { label: "(GMT-5:00) Eastern Time (US & Canada)", value: "GMT-5" },
    { label: "(GMT-6:00) Central Time (US & Canada), Mexico City", value: "GMT-6" },
    { label: "(GMT-7:00) Mountain Time (US & Canada)", value: "GMT-7" },
    { label: "(GMT-8:00) Pacific Time (US & Canada)", value: "GMT-8" },
    { label: "(GMT-9:00) Alaska", value: "GMT-9" },
    { label: "(GMT-10:00) Hawaii", value: "GMT-10" },
    { label: "(GMT-11:00) Midway Island, Samoa", value: "GMT-11" },
    { label: "(GMT-12:00) International Date Line West", value: "GMT-12" },
  ];
  
  const [pixelForm, setPixelForm] = useState({
    pixelName: "",
    pixelId: "",
    trackingPages: "all",
  });

  // Enhanced create modal state
  const [showEnhancedCreateModal, setShowEnhancedCreateModal] = useState(false);
  const [enhancedCreateStep, setEnhancedCreateStep] = useState(1); // 1: Create, 2: Timezone
  const [enhancedCreateForm, setEnhancedCreateForm] = useState({
    appName: "",
    pixelId: "",
    accessToken: "",
  });

  // Purchase reports search state
  const [purchaseSearchTerm, setPurchaseSearchTerm] = useState("");
  const [currentPurchaseOffset, setCurrentPurchaseOffset] = useState(0);

  // Create form state (for manual pixel creation)
  const [createForm, setCreateForm] = useState({
    name: "",
    metaAppId: "", // Pixel ID
    metaAccessToken: "",
  });

  // Rename form state
  const [renameValue, setRenameValue] = useState("");

  const isLoading = fetcher.state !== "idle";

  // Filter purchase events based on search term
  const filteredPurchaseEvents = recentPurchaseEvents.filter((event: any) => {
    if (!purchaseSearchTerm) return true;

    const searchLower = purchaseSearchTerm.toLowerCase();
    return (
      event.orderId.toLowerCase().includes(searchLower) ||
      event.pixelId.toLowerCase().includes(searchLower) ||
      event.source.toLowerCase().includes(searchLower) ||
      event.currency.toLowerCase().includes(searchLower) ||
      (event.value && event.value.toString().includes(searchLower))
    );
  });

  // Mark component as mounted to prevent hydration mismatch
  useEffect(() => {
    setMounted(true);
  }, []);

  // Sync offset with loader data
  useEffect(() => {
    setCurrentPurchaseOffset(purchaseOffset);
  }, [purchaseOffset]);

  // Function to fetch pixels using Facebook SDK (3-step approach)
  const fetchPixelsWithSDK = useCallback((accessToken: string) => {
    const FB = (window as any).FB;
    if (!FB) {
      console.log('[Facebook SDK] SDK not available for pixel fetch');
      return;
    }

    console.log('[Facebook SDK] Step 1: Fetching user info (/me)...');
    
    // Step 1: Get user ID
    FB.api('/me', 'GET', { fields: 'id,name,picture.type(small)' }, function(userResponse: any) {
      if (userResponse.error) {
        console.error('[Facebook SDK] Error fetching user:', userResponse.error);
        return;
      }
      
      console.log('[Facebook SDK] User ID:', userResponse.id);
      console.log('[Facebook SDK] User Name:', userResponse.name);
      
      // Save user data
      const userData = {
        id: userResponse.id,
        name: userResponse.name,
        picture: userResponse.picture?.data?.url || null
      };
      setFacebookUser(userData);
      localStorage.setItem("facebook_user", JSON.stringify(userData));
      
      // Step 2: Get businesses
      console.log('[Facebook SDK] Step 2: Fetching businesses (/me/businesses)...');
      
      FB.api('/me/businesses', 'GET', {}, function(businessResponse: any) {
        if (businessResponse.error) {
          console.error('[Facebook SDK] Error fetching businesses:', businessResponse.error);
          // Try fallback to ad accounts
          fetchPixelsFromAdAccounts(FB, accessToken);
          return;
        }
        
        console.log('[Facebook SDK] Businesses found:', businessResponse.data?.length || 0);
        
        if (!businessResponse.data || businessResponse.data.length === 0) {
          console.log('[Facebook SDK] No businesses found, trying ad accounts fallback...');
          fetchPixelsFromAdAccounts(FB, accessToken);
          return;
        }
        
        const allPixels: Array<{id: string, name: string, accountName: string}> = [];
        let businessesProcessed = 0;
        
        // Step 3: For each business, get owned_pixels
        businessResponse.data.forEach((business: any) => {
          console.log(`[Facebook SDK] Step 3: Fetching pixels for business: ${business.name} (${business.id})`);
          
          FB.api(`/${business.id}/owned_pixels`, 'GET', { fields: 'id,name' }, function(pixelResponse: any) {
            businessesProcessed++;
            
            if (pixelResponse.error) {
              console.error(`[Facebook SDK] Error fetching pixels for business ${business.id}:`, pixelResponse.error);
            } else if (pixelResponse.data) {
              console.log(`[Facebook SDK] Found ${pixelResponse.data.length} pixels in ${business.name}`);
              
              pixelResponse.data.forEach((pixel: any) => {
                allPixels.push({
                  id: pixel.id,
                  name: pixel.name,
                  accountName: business.name
                });
              });
            }
            
            // When all businesses are processed, update state
            if (businessesProcessed === businessResponse.data.length) {
              console.log(`[Facebook SDK] Total pixels found: ${allPixels.length}`);
              console.log('[Facebook SDK] Pixels:', allPixels);
              
              if (allPixels.length > 0) {
                setFacebookPixels(allPixels);
                localStorage.setItem("facebook_pixels", JSON.stringify(allPixels));
              } else {
                // Fallback to ad accounts if no pixels found via businesses
                fetchPixelsFromAdAccounts(FB, accessToken);
              }
            }
          });
        });
      });
    });
  }, []);

  // Fallback: Fetch pixels from ad accounts
  const fetchPixelsFromAdAccounts = useCallback((FB: any, accessToken: string) => {
    console.log('[Facebook SDK] Fallback: Fetching from ad accounts (/me/adaccounts)...');
    
    FB.api('/me/adaccounts', 'GET', { fields: 'id,name' }, function(adAccountsResponse: any) {
      if (adAccountsResponse.error) {
        console.error('[Facebook SDK] Error fetching ad accounts:', adAccountsResponse.error);
        return;
      }
      
      console.log('[Facebook SDK] Ad accounts found:', adAccountsResponse.data?.length || 0);
      
      if (!adAccountsResponse.data || adAccountsResponse.data.length === 0) {
        console.log('[Facebook SDK] No ad accounts found');
        return;
      }
      
      const allPixels: Array<{id: string, name: string, accountName: string}> = [];
      let accountsProcessed = 0;
      
      adAccountsResponse.data.forEach((account: any) => {
        console.log(`[Facebook SDK] Fetching pixels for ad account: ${account.name} (${account.id})`);
        
        FB.api(`/${account.id}/adspixels`, 'GET', { fields: 'id,name' }, function(pixelResponse: any) {
          accountsProcessed++;
          
          if (pixelResponse.error) {
            console.error(`[Facebook SDK] Error fetching pixels for account ${account.id}:`, pixelResponse.error);
          } else if (pixelResponse.data) {
            console.log(`[Facebook SDK] Found ${pixelResponse.data.length} pixels in ${account.name}`);
            
            pixelResponse.data.forEach((pixel: any) => {
              allPixels.push({
                id: pixel.id,
                name: pixel.name,
                accountName: account.name
              });
            });
          }
          
          // When all accounts are processed, update state
          if (accountsProcessed === adAccountsResponse.data.length) {
            console.log(`[Facebook SDK] Total pixels found (via ad accounts): ${allPixels.length}`);
            console.log('[Facebook SDK] Pixels:', allPixels);
            
            if (allPixels.length > 0) {
              setFacebookPixels(allPixels);
              localStorage.setItem("facebook_pixels", JSON.stringify(allPixels));
            }
          }
        });
      });
    });
  }, []);

  // Initialize Facebook SDK and check login status
  useEffect(() => {
    if (!mounted) return;

    // Load Facebook SDK
    const loadFacebookSDK = () => {
      // Define fbAsyncInit before loading SDK
      (window as any).fbAsyncInit = function() {
        (window as any).FB.init({
          appId: '881927951248648',
          cookie: true,
          xfbml: true,
          version: 'v24.0'
        });

        // Check login status after SDK is initialized
        (window as any).FB.getLoginStatus(function(response: any) {
          console.log('[Facebook SDK] Login status:', response.status);
          if (response.status === 'connected') {
            console.log('[Facebook SDK] User is CONNECTED');
            console.log('[Facebook SDK] User ID:', response.authResponse.userID);
            console.log('[Facebook SDK] Access Token:', response.authResponse.accessToken ? 'Present' : 'Missing');
            
            // User is logged in and has authorized the app
            const accessToken = response.authResponse.accessToken;
            setFacebookAccessToken(accessToken);
            setIsConnectedToFacebook(true);
            localStorage.setItem("facebook_access_token", accessToken);
            
            // Fetch pixels using 3-step approach
            fetchPixelsWithSDK(accessToken);
            
          } else if (response.status === 'not_authorized') {
            console.log('[Facebook SDK] User is NOT AUTHORIZED - logged into Facebook but not the app');
          } else {
            console.log('[Facebook SDK] User is NOT CONNECTED to Facebook');
          }
        });
      };

      // Load the SDK asynchronously
      if (!document.getElementById('facebook-jssdk')) {
        const js = document.createElement('script');
        js.id = 'facebook-jssdk';
        js.src = 'https://connect.facebook.net/en_US/sdk.js';
        js.async = true;
        js.defer = true;
        const fjs = document.getElementsByTagName('script')[0];
        fjs.parentNode?.insertBefore(js, fjs);
      } else if ((window as any).FB) {
        // SDK already loaded, just check status
        (window as any).FB.getLoginStatus(function(response: any) {
          console.log('[Facebook SDK] Login status (cached):', response.status);
        });
      }
    };

    loadFacebookSDK();
  }, [mounted, fetchPixelsWithSDK]);

  // Load Facebook connection state from localStorage (only after mount)
  useEffect(() => {
    if (!mounted) return;
    
    const savedToken = localStorage.getItem("facebook_access_token");
    const savedUser = localStorage.getItem("facebook_user");
    const savedPixels = localStorage.getItem("facebook_pixels");
    
    if (savedToken && savedUser) {
      setFacebookAccessToken(savedToken);
      setFacebookUser(JSON.parse(savedUser));
      setIsConnectedToFacebook(true);
      
      if (savedPixels) {
        setFacebookPixels(JSON.parse(savedPixels));
      } else {
        // Auto-fetch pixels if we have token but no cached pixels
        fetcher.submit(
          {
            intent: "fetch-facebook-pixels",
            accessToken: savedToken,
          },
          { method: "POST" }
        );
      }
    }
  }, [mounted, fetcher]);

  // Handle Facebook OAuth callback
  useEffect(() => {
    const facebookToken = searchParams.get("facebook_token");
    const facebookSuccess = searchParams.get("facebook_success");
    const facebookError = searchParams.get("facebook_error");

    if (facebookError) {
      setFacebookError(`Facebook connection failed: ${facebookError}`);
    } else if (facebookToken && facebookSuccess) {
      setFacebookAccessToken(facebookToken);
      setIsConnectedToFacebook(true);
      
      // Save to localStorage
      if (typeof window !== "undefined") {
        localStorage.setItem("facebook_access_token", facebookToken);
      }
      
      // Automatically fetch pixels when we get the token
      fetcher.submit(
        {
          intent: "fetch-facebook-pixels",
          accessToken: facebookToken,
        },
        { method: "POST" }
      );
    }
  }, [searchParams, fetcher]);

  const handleCreatePixel = useCallback(() => {
    if (!pixelForm.pixelName || !pixelForm.pixelId) return;
    
    // For manual input, access token is also required
    if (inputMethod === "manual" && !facebookAccessToken) return;

    fetcher.submit(
      {
        intent: "create-pixel",
        pixelName: pixelForm.pixelName,
        pixelId: pixelForm.pixelId,
        accessToken: facebookAccessToken,
      },
      { method: "POST" }
    );
  }, [fetcher, pixelForm, inputMethod, facebookAccessToken]);

  const handleConnectToFacebook = useCallback(() => {
    const scope = "ads_read,business_management,ads_management,pages_show_list,pages_read_engagement,catalog_management";
    
    // Check if Facebook SDK is loaded
    if ((window as any).FB) {
      console.log('[Dashboard] Using Facebook SDK for login...');
      
      (window as any).FB.login(function(response: any) {
        console.log('[Dashboard] FB.login response:', response.status);
        
        if (response.status === 'connected') {
          console.log('[Dashboard] Facebook user CONNECTED via SDK!');
          const accessToken = response.authResponse.accessToken;
          
          setFacebookAccessToken(accessToken);
          setIsConnectedToFacebook(true);
          localStorage.setItem("facebook_access_token", accessToken);
          
          // Fetch pixels using 3-step approach (user -> businesses -> owned_pixels)
          fetchPixelsWithSDK(accessToken);
          
          setShowFacebookModal(false);
        } else if (response.status === 'not_authorized') {
          console.log('[Dashboard] Facebook user NOT AUTHORIZED');
          setFacebookError('You need to authorize the app to access your Facebook data.');
        } else {
          console.log('[Dashboard] Facebook user NOT CONNECTED');
          setFacebookError('Facebook login was cancelled or failed.');
        }
      }, { scope: scope });
      
    } else {
      // Fallback to OAuth popup if SDK not loaded
      console.log('[Dashboard] Facebook SDK not loaded, using OAuth popup...');
      
      const facebookAppId = "881927951248648";
      const redirectUri = encodeURIComponent(`${window.location.origin}/auth/facebook/callback`);
      
      const oauthUrl = `https://www.facebook.com/v24.0/dialog/oauth?client_id=${facebookAppId}&redirect_uri=${redirectUri}&scope=${scope}&response_type=code&state=${Date.now()}`;
      
      const popup = window.open(
        oauthUrl,
        'facebook-oauth',
        'width=600,height=600,scrollbars=yes,resizable=yes'
      );

      // Listen for messages from the popup
      const handleMessage = (event: MessageEvent) => {
        if (event.origin !== window.location.origin) return;

        if (event.data.type === 'FACEBOOK_AUTH_SUCCESS') {
          console.log('[Dashboard] Facebook user CONNECTED!');
          console.log('[Dashboard] User:', event.data.user?.name || 'Unknown');
          console.log('[Dashboard] Access Token:', event.data.accessToken ? 'Received' : 'Missing');
          console.log('[Dashboard] Pixels:', event.data.pixels?.length || 0);
          
          setFacebookAccessToken(event.data.accessToken);
          
          // Set user profile if available
          if (event.data.user) {
            setFacebookUser(event.data.user);
            localStorage.setItem("facebook_user", JSON.stringify(event.data.user));
          }
          
          // Set pixels if they were fetched
          if (event.data.pixels && event.data.pixels.length > 0) {
            setFacebookPixels(event.data.pixels);
            localStorage.setItem("facebook_pixels", JSON.stringify(event.data.pixels));
          }
          
          setIsConnectedToFacebook(true);
          localStorage.setItem("facebook_access_token", event.data.accessToken);
          
          // Show warning if any
          if (event.data.warning) {
            setFacebookError(event.data.warning);
          }
          
          setShowFacebookModal(false);
          window.removeEventListener('message', handleMessage);
          
          // If no pixels were fetched automatically, try to fetch them
          if (!event.data.pixels || event.data.pixels.length === 0) {
            fetcher.submit(
              {
                intent: "fetch-facebook-pixels",
                accessToken: event.data.accessToken,
              },
              { method: "POST" }
            );
          }
        } else if (event.data.type === 'FACEBOOK_AUTH_ERROR') {
          console.log('[Dashboard] Facebook user NOT connected - error:', event.data.error);
          setFacebookError(event.data.error);
          window.removeEventListener('message', handleMessage);
        }
      };

      window.addEventListener('message', handleMessage);

      // Clean up if popup is closed manually
      const checkClosed = setInterval(() => {
        if (popup?.closed) {
          window.removeEventListener('message', handleMessage);
          clearInterval(checkClosed);
        }
      }, 1000);
    }
  }, [fetcher, fetchPixelsWithSDK]);

  const handleSelectFacebookPixel = useCallback(() => {
    const selectedPixel = facebookPixels.find(p => p.id === selectedFacebookPixel);
    if (!selectedPixel) return;

    setPixelForm({
      pixelName: selectedPixel.name,
      pixelId: selectedPixel.id,
      trackingPages: "all",
    });
  }, [facebookPixels, selectedFacebookPixel]);

  // Handle fetcher response
  useEffect(() => {
    if (fetcher.data?.facebookPixels) {
      setFacebookPixels(fetcher.data.facebookPixels);
      setIsConnectedToFacebook(true);
      
      // Save pixels to localStorage
      if (typeof window !== "undefined") {
        localStorage.setItem("facebook_pixels", JSON.stringify(fetcher.data.facebookPixels));
      }
    }
    
    // Handle user data from Facebook
    if (fetcher.data?.facebookUser) {
      setFacebookUser(fetcher.data.facebookUser);
      
      // Save user to localStorage
      if (typeof window !== "undefined") {
        localStorage.setItem("facebook_user", JSON.stringify(fetcher.data.facebookUser));
      }
    }
    
    // Handle step progression after pixel creation
    if (fetcher.data?.success && fetcher.data?.step === 2) {
      if (showEnhancedCreateModal) {
        // Enhanced modal flow - move to timezone step within modal
        setEnhancedCreateStep(2);
      } else {
        // Onboarding flow - move to timezone step
        setCurrentStep(2);
      }
      
      // Store the created app ID for timezone saving
      if (fetcher.data?.app?.id) {
        setCreatedAppId(fetcher.data.app.id);
      }
    }
    
    // Handle timezone save completion
    if (fetcher.data?.success && fetcher.data?.step === 3) {
      if (showEnhancedCreateModal) {
        // Close modal and refresh
        setShowEnhancedCreateModal(false);
        setEnhancedCreateStep(1);
        setEnhancedCreateForm({ appName: "", pixelId: "", accessToken: "" });
        setSelectedFacebookPixel("");
        setPixelValidationResult(null);
        setCreatedAppId(null);
      } else {
        setCurrentStep(3); // Move to next step in onboarding
      }
    }
  }, [fetcher.data]);

  // Refresh Facebook token and pixels
  const handleRefreshFacebookData = useCallback(async () => {
    if (!facebookAccessToken) return;
    
    setIsRefreshingToken(true);
    try {
      // Validate current token and refresh pixels
      fetcher.submit(
        {
          intent: "fetch-facebook-pixels",
          accessToken: facebookAccessToken,
        },
        { method: "POST" }
      );
    } catch (error) {
      console.error("Failed to refresh Facebook data:", error);
      setFacebookError("Failed to refresh Facebook data. Please reconnect.");
    } finally {
      setIsRefreshingToken(false);
    }
  }, [facebookAccessToken, fetcher]);

  // Disconnect from Facebook
  const handleDisconnectFacebook = useCallback(() => {
    setFacebookAccessToken("");
    setFacebookUser(null);
    setFacebookPixels([]);
    setIsConnectedToFacebook(false);
    setSelectedFacebookPixel("");
    setFacebookError("");
    setPixelValidationResult(null);
    
    // Clear localStorage
    if (typeof window !== "undefined") {
      localStorage.removeItem("facebook_access_token");
      localStorage.removeItem("facebook_user");
      localStorage.removeItem("facebook_pixels");
    }
  }, []);

  // Validate pixel using Facebook SDK
  const validatePixelWithSDK = useCallback((pixelId: string, accessToken: string) => {
    const FB = (window as any).FB;
    
    setIsValidatingPixel(true);
    setPixelValidationResult(null);
    
    console.log(`[Facebook SDK] Validating pixel: ${pixelId}`);
    
    if (FB) {
      // Use Facebook SDK to validate
      FB.api(`/${pixelId}`, 'GET', { fields: 'id,name,creation_time,last_fired_time' }, function(response: any) {
        setIsValidatingPixel(false);
        
        if (response.error) {
          console.log(`[Facebook SDK] Pixel validation FAILED:`, response.error.message);
          setPixelValidationResult({
            valid: false,
            error: response.error.message
          });
        } else {
          console.log(`[Facebook SDK] Pixel validation SUCCESS!`);
          console.log(`[Facebook SDK] Pixel Name: ${response.name}`);
          console.log(`[Facebook SDK] Pixel ID: ${response.id}`);
          console.log(`[Facebook SDK] Last Fired: ${response.last_fired_time || 'Never'}`);
          
          setPixelValidationResult({
            valid: true,
            pixelName: response.name
          });
        }
      });
    } else {
      // Fallback to server-side validation
      console.log(`[Dashboard] Facebook SDK not available, using server validation...`);
      
      fetch(`https://graph.facebook.com/v24.0/${pixelId}?fields=id,name&access_token=${accessToken}`)
        .then(res => res.json())
        .then(data => {
          setIsValidatingPixel(false);
          
          if (data.error) {
            console.log(`[Dashboard] Pixel validation FAILED:`, data.error.message);
            setPixelValidationResult({
              valid: false,
              error: data.error.message
            });
          } else {
            console.log(`[Dashboard] Pixel validation SUCCESS!`);
            console.log(`[Dashboard] Pixel Name: ${data.name}`);
            
            setPixelValidationResult({
              valid: true,
              pixelName: data.name
            });
          }
        })
        .catch(err => {
          setIsValidatingPixel(false);
          console.log(`[Dashboard] Pixel validation error:`, err);
          setPixelValidationResult({
            valid: false,
            error: 'Failed to validate pixel'
          });
        });
    }
  }, []);

  // Auto-validate when pixel is selected
  useEffect(() => {
    if (selectedFacebookPixel && selectedFacebookPixel !== "manual" && facebookAccessToken) {
      validatePixelWithSDK(selectedFacebookPixel, facebookAccessToken);
    } else {
      setPixelValidationResult(null);
    }
  }, [selectedFacebookPixel, facebookAccessToken, validatePixelWithSDK]);

  const handleEnhancedCreate = useCallback(() => {
    const pixelId = selectedFacebookPixel && selectedFacebookPixel !== "manual" 
      ? selectedFacebookPixel 
      : enhancedCreateForm.pixelId;
    
    const accessToken = selectedFacebookPixel && selectedFacebookPixel !== "manual"
      ? facebookAccessToken
      : enhancedCreateForm.accessToken;

    if (!enhancedCreateForm.appName || !pixelId) {
      return;
    }

    fetcher.submit(
      {
        intent: "create",
        name: enhancedCreateForm.appName,
        metaAppId: pixelId,
        metaAccessToken: accessToken || "",
      },
      { method: "POST" }
    );

    // Don't close modal - wait for step 2 (timezone selection)
    // Modal will move to step 2 when fetcher.data.step === 2
  }, [fetcher, enhancedCreateForm, selectedFacebookPixel, facebookAccessToken]);

  const handleCreate = useCallback(() => {
    if (!createForm.name || !createForm.metaAppId) {
      return;
    }

    fetcher.submit(
      {
        intent: "create",
        name: createForm.name,
        metaAppId: createForm.metaAppId,
        metaAccessToken: createForm.metaAccessToken,
      },
      { method: "POST" }
    );

    setShowCreateModal(false);
    setCreateForm({ name: "", metaAppId: "", metaAccessToken: "" });
  }, [fetcher, createForm]);

  const handleRename = useCallback(() => {
    if (!renameValue.trim()) return;

    fetcher.submit(
      { intent: "rename", appId: showRenameModal.id, newName: renameValue },
      { method: "POST" }
    );
    setShowRenameModal(null);
    setRenameValue("");
  }, [fetcher, showRenameModal, renameValue]);

  const handleDelete = useCallback(() => {
    fetcher.submit(
      { intent: "delete", appId: showDeleteModal.id },
      { method: "POST" }
    );
    setShowDeleteModal(null);
  }, [fetcher, showDeleteModal]);

  const handleTogglePixel = useCallback((appId: string, enabled: boolean) => {
    fetcher.submit(
      { 
        intent: "toggle-pixel", 
        appId: appId, 
        enabled: (!enabled).toString() 
      },
      { method: "POST" }
    );
  }, [fetcher]);

  const handleCreateModalClose = useCallback(() => {
    setShowCreateModal(false);
    setCreateForm({ name: "", metaAppId: "", metaAccessToken: "" });
  }, []);

  const [snippetText, setSnippetText] = useState("");
  useEffect(() => {
    if (showSnippet && typeof window !== "undefined") {
      const origin = window.location.origin;
      setSnippetText(`<!-- Pixel Analytics -->
<script>
  window.PIXEL_APP_ID = "${showSnippet}";
</script>
<script async src="${origin}/pixel.js?id=${showSnippet}"></script>`);
    }
  }, [showSnippet]);

  const copyToClipboard = useCallback(() => {
    if (snippetText) {
      navigator.clipboard.writeText(snippetText);
    }
  }, [snippetText]);

  // If user already has pixels, show dashboard with pixel management
  if (hasPixels) {
    return (
      <Page 
        title="Pixel Dashboard"
        subtitle="Facebook Pixel & Conversion Tracking for Shopify"
        primaryAction={{
          content: "Add Facebook Pixel",
          onAction: () => setShowEnhancedCreateModal(true),
        }}
        secondaryActions={[
          {
            content: mounted && isConnectedToFacebook 
              ? `Connected: ${facebookUser?.name || 'Facebook'}` 
              : "Connect Facebook",
            icon: ConnectIcon,
            onAction: mounted && isConnectedToFacebook ? handleRefreshFacebookData : handleConnectToFacebook,
            loading: isRefreshingToken,
          }
        ]}
      >
        <Layout>
          {/* Success/Error Banner */}
          {fetcher.data?.success && (
            <Layout.Section>
              <Banner tone="success">
                <p>{fetcher.data.message || "Action completed successfully"}</p>
              </Banner>
            </Layout.Section>
          )}
          {fetcher.data?.error && (
            <Layout.Section>
              <Banner tone="critical">
                <p>{fetcher.data.error}</p>
              </Banner>
            </Layout.Section>
          )}

          {/* Facebook Connection Status Card */}
          {mounted && isConnectedToFacebook && facebookUser && (
            <Layout.Section>
              <Card>
                <InlineStack align="space-between" blockAlign="center">
                  <InlineStack gap="300" blockAlign="center">
                    {facebookUser.picture ? (
                      <img 
                        src={facebookUser.picture} 
                        alt={facebookUser.name}
                        style={{
                          width: "48px",
                          height: "48px",
                          borderRadius: "50%",
                          objectFit: "cover",
                          border: "3px solid #1877f2"
                        }}
                      />
                    ) : (
                      <div style={{
                        width: "48px",
                        height: "48px",
                        borderRadius: "50%",
                        backgroundColor: "#1877f2",
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "center",
                        color: "white",
                        fontWeight: "bold",
                        fontSize: "20px"
                      }}>
                        {facebookUser.name.charAt(0).toUpperCase()}
                      </div>
                    )}
                    <BlockStack gap="100">
                      <InlineStack gap="200" blockAlign="center">
                        <Text variant="headingMd" as="h3">Facebook Connected</Text>
                        <Badge tone="success">Active</Badge>
                      </InlineStack>
                      <Text variant="bodySm" tone="subdued" as="p">
                        Logged in as {facebookUser.name} • {facebookPixels.length} pixel(s) available
                      </Text>
                    </BlockStack>
                  </InlineStack>
                  <InlineStack gap="200">
                    <Button onClick={handleRefreshFacebookData} loading={isRefreshingToken}>
                      Refresh
                    </Button>
                    <Button variant="plain" tone="critical" onClick={handleDisconnectFacebook}>
                      Disconnect
                    </Button>
                  </InlineStack>
                </InlineStack>
              </Card>
            </Layout.Section>
          )}

          {/* Dashboard Overview Stats */}
          <Layout.Section>
            <BlockStack gap="400">
              <Text variant="headingLg" as="h2">Performance Overview</Text>
              <InlineStack gap="400" wrap={false}>
                <Card>
                  <BlockStack gap="200">
                    <Text variant="bodySm" as="p" tone="subdued">Active Pixels</Text>
                    <Text variant="headingXl" as="p">{stats.totalPixels}</Text>
                    <Text variant="bodySm" as="p" tone="success">Facebook Pixels</Text>
                  </BlockStack>
                </Card>
                <Card>
                  <BlockStack gap="200">
                    <Text variant="bodySm" as="p" tone="subdued">Conversions Tracked</Text>
                    <Text variant="headingXl" as="p">{stats.totalEvents.toLocaleString()}</Text>
                    <Text variant="bodySm" as="p" tone="subdued">All time</Text>
                  </BlockStack>
                </Card>
                <Card>
                  <BlockStack gap="200">
                    <Text variant="bodySm" as="p" tone="subdued">Unique Visitors</Text>
                    <Text variant="headingXl" as="p">{stats.totalSessions.toLocaleString()}</Text>
                    <Text variant="bodySm" as="p" tone="subdued">This month</Text>
                  </BlockStack>
                </Card>
                <Card>
                  <BlockStack gap="200">
                    <Text variant="bodySm" as="p" tone="subdued">Events Today</Text>
                    <Text variant="headingXl" as="p">{stats.todayEvents.toLocaleString()}</Text>
                    <Text variant="bodySm" as="p" tone="subdued">Live tracking</Text>
                  </BlockStack>
                </Card>
              </InlineStack>
            </BlockStack>
          </Layout.Section>

          {/* Facebook Pixels List */}
          <Layout.Section>
            <BlockStack gap="400">
              <InlineStack align="space-between" blockAlign="center">
                <Text variant="headingLg" as="h2">Your Facebook Pixels</Text>
                <InlineStack gap="200">
                  <Button
                    icon={ExportIcon}
                    onClick={() => {
                      // Create CSV content for pixels
                      const headers = ['Name', 'Pixel ID', 'Events', 'Sessions', 'Status', 'Meta Connected'];
                      const csvContent = [
                        headers.join(','),
                        ...apps.map((app: any) => {
                          const { name, settings, _count, enabled } = app;
                          return [
                            `"${name}"`,
                            `"${settings?.metaPixelId || 'N/A'}"`,
                            `"${_count.events.toLocaleString()}"`,
                            `"${_count.analyticsSessions.toLocaleString()}"`,
                            `"${enabled ? 'Enabled' : 'Disabled'}"`,
                            `"${settings?.metaPixelEnabled ? 'Yes' : 'No'}"`
                          ].join(',');
                        })
                      ].join('\n');

                      // Create and download CSV file
                      const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
                      const link = document.createElement('a');
                      const url = URL.createObjectURL(blob);
                      link.setAttribute('href', url);
                      link.setAttribute('download', `pixels-report-${new Date().toISOString().split('T')[0]}.csv`);
                      link.style.visibility = 'hidden';
                      document.body.appendChild(link);
                      link.click();
                      document.body.removeChild(link);
                    }}
                  >
                    Export CSV
                  </Button>
                  <Text as="h1" fontWeight="bold">Manage All Pixels</Text>
                </InlineStack>
              </InlineStack>
              
              <Card>
                <BlockStack gap="400">
                  {apps.map((app: any) => {
                    const { id, appId, name, _count, settings, enabled } = app;
                    return (
                      <div key={id} style={{ padding: "16px", border: "1px solid #e5e7eb", borderRadius: "8px" }}>
                        <BlockStack gap="300">
                          <InlineStack align="space-between" blockAlign="center">
                            <BlockStack gap="100">
                              <InlineStack gap="200" blockAlign="center">
                                <Text variant="bodyMd" fontWeight="bold" as="h3">{name}</Text>
                                {settings?.metaPixelEnabled && (
                                  <Badge tone="success">Meta Connected</Badge>
                                )}
                                <Badge tone={enabled ? "success" : "critical"}>
                                  {enabled ? "Enabled" : "Disabled"}
                                </Badge>
                              </InlineStack>
                              <Text variant="bodySm" as="p" tone="subdued">
                                Pixel ID: {settings?.metaPixelId || appId} • {_count.events.toLocaleString()} events • {_count.analyticsSessions.toLocaleString()} sessions
                              </Text>
                            </BlockStack>
                            <InlineStack gap="200">
                              <Button 
                                variant={enabled ? "primary" : "secondary"}
                                tone={enabled ? "critical" : "success"}
                                onClick={() => handleTogglePixel(id, enabled)}
                                loading={isLoading}
                              >
                                {enabled ? "Disable" : "Enable"}
                              </Button>
                              <Button onClick={() => setShowSnippet(appId)}>
                                Get Code
                              </Button>
                              <Button
                                onClick={() => {
                                  setShowRenameModal(app);
                                  setRenameValue(app.name);
                                }}
                              >
                                Rename
                              </Button>
                              <Button
                                tone="critical"
                                onClick={() => setShowDeleteModal(app)}
                              >
                                Delete
                              </Button>
                            </InlineStack>
                          </InlineStack>
                        </BlockStack>
                      </div>
                    );
                  })}
                </BlockStack>
              </Card>
            </BlockStack>
          </Layout.Section>

          {/* Recent Purchase Events */}
          {recentPurchaseEvents.length > 0 && (
            <Layout.Section>
              <Card>
                <BlockStack gap="400">
                  <InlineStack align="space-between" blockAlign="center">
                    <Text variant="headingMd" as="h3">Recent Purchase Reports</Text>
                    <InlineStack gap="200" blockAlign="center">
                      <Button
                        icon={ExportIcon}
                        onClick={() => {
                          // Create CSV content
                          const headers = ['Order ID', 'Value', 'Currency', 'Pixel ID', 'Source', 'Purchase Time'];
                          const csvContent = [
                            headers.join(','),
                            ...filteredPurchaseEvents.map(event => [
                              `"${event.orderId}"`,
                              event.value ? `"$${event.value.toFixed(2)}"` : '""',
                              `"${event.currency}"`,
                              `"${event.pixelId}"`,
                              `"${event.source}"`,
                              `"${new Date(event.purchaseTime).toLocaleString()}"`
                            ].join(','))
                          ].join('\n');

                          // Create and download CSV file
                          const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
                          const link = document.createElement('a');
                          const url = URL.createObjectURL(blob);
                          link.setAttribute('href', url);
                          link.setAttribute('download', `purchase-report-${new Date().toISOString().split('T')[0]}.csv`);
                          link.style.visibility = 'hidden';
                          document.body.appendChild(link);
                          link.click();
                          document.body.removeChild(link);
                        }}
                      >
                        Export CSV
                      </Button>
                      <div style={{ width: "300px" }}>
                        <TextField
                          label=""
                          value={purchaseSearchTerm}
                          onChange={setPurchaseSearchTerm}
                          placeholder="Search orders, pixels, sources..."
                          autoComplete="off"
                          clearButton
                          onClearButtonClick={() => setPurchaseSearchTerm("")}
                        />
                      </div>
                    </InlineStack>
                  </InlineStack>

                  <DataTable
                    columnContentTypes={['text', 'numeric', 'text', 'text', 'text', 'text']}
                    headings={['Order ID', 'Value', 'Currency', 'Pixel ID', 'Source', 'Purchase Time']}
                    rows={filteredPurchaseEvents.map((event: any) => [
                      <Text key={`order-${event.id}`} variant="bodyMd" fontWeight="medium" as="span">
                        {event.orderId}
                      </Text>,
                      <Text key={`value-${event.id}`} variant="bodyMd" fontWeight="medium" as="span">
                        {(() => {
                          const val = event.value;
                          if (typeof val === 'number' && !isNaN(val)) {
                            return `$${val.toFixed(2)}`;
                          }
                          return '-';
                        })()}
                      </Text>,
                      <Badge key={`currency-${event.id}`} tone="success">{event.currency}</Badge>,
                      <Text key={`pixel-${event.id}`} variant="bodySm" tone="subdued" as="span">
                        {event.pixelId}
                      </Text>,
                      <Text key={`source-${event.id}`} variant="bodySm" tone="subdued" as="span">
                        {event.source}
                      </Text>,
                      <Text key={`time-${event.id}`} variant="bodySm" tone="subdued" as="span">
                        {new Date(event.purchaseTime).toLocaleString()}
                      </Text>
                    ])}
                  />

                  {totalPurchaseEvents > purchaseLimit && (
                    <InlineStack align="center" gap="200">
                      <Button
                        disabled={currentPurchaseOffset === 0}
                        onClick={() => {
                          const newOffset = Math.max(0, currentPurchaseOffset - purchaseLimit);
                          window.location.href = `/app/dashboard?purchaseOffset=${newOffset}`;
                        }}
                      >
                        Previous
                      </Button>
                      <Text as="span" tone="subdued">
                        Page {Math.floor(currentPurchaseOffset / purchaseLimit) + 1} of {Math.ceil(totalPurchaseEvents / purchaseLimit)}
                      </Text>
                      <Button
                        disabled={currentPurchaseOffset + purchaseLimit >= totalPurchaseEvents}
                        onClick={() => {
                          const newOffset = currentPurchaseOffset + purchaseLimit;
                          window.location.href = `/app/dashboard?purchaseOffset=${newOffset}`;
                        }}
                      >
                        Next
                      </Button>
                    </InlineStack>
                  )}

                  <Text variant="bodySm" tone="subdued" as="p">
                    Report shows purchase events from the last 7 days across all your Facebook pixels.
                    {filteredPurchaseEvents.length !== recentPurchaseEvents.length &&
                      ` Showing ${filteredPurchaseEvents.length} of ${recentPurchaseEvents.length} purchases.`
                    }
                  </Text>
                </BlockStack>
              </Card>
            </Layout.Section>
          )}
        </Layout>

        {/* Enhanced Create Modal - Omega Pixel Style */}
        <Modal
          open={showEnhancedCreateModal}
          onClose={() => {
            setShowEnhancedCreateModal(false);
            setEnhancedCreateStep(1);
            setEnhancedCreateForm({ appName: "", pixelId: "", accessToken: "" });
            setSelectedFacebookPixel("");
            setPixelValidationResult(null);
            setCreatedAppId(null);
          }}
          title={enhancedCreateStep === 1 ? "Create New Pixel" : "Choose Timezone"}
          primaryAction={{
            content: enhancedCreateStep === 1 
              ? (isValidatingPixel ? "Validating..." : "Create Pixel")
              : (isLoading ? "Saving..." : "Save & Continue"),
            onAction: enhancedCreateStep === 1 ? handleEnhancedCreate : () => {
              if (createdAppId) {
                fetcher.submit(
                  {
                    intent: "save-timezone",
                    appId: createdAppId,
                    timezone: selectedTimezone,
                  },
                  { method: "POST" }
                );
              }
            },
            loading: isLoading || isValidatingPixel,
            disabled: enhancedCreateStep === 1 
              ? (!enhancedCreateForm.appName || 
                 (!enhancedCreateForm.pixelId && !selectedFacebookPixel) ||
                 apps.some((app: any) => app.settings?.metaPixelId === (enhancedCreateForm.pixelId || selectedFacebookPixel)) ||
                 (selectedFacebookPixel && selectedFacebookPixel !== "manual" && !pixelValidationResult?.valid) ||
                 isValidatingPixel)
              : false,
          }}
          secondaryActions={[
            {
              content: enhancedCreateStep === 2 ? "Back" : "Cancel",
              onAction: () => {
                if (enhancedCreateStep === 2) {
                  setEnhancedCreateStep(1);
                } else {
                  setShowEnhancedCreateModal(false);
                  setEnhancedCreateStep(1);
                  setEnhancedCreateForm({ appName: "", pixelId: "", accessToken: "" });
                  setSelectedFacebookPixel("");
                  setPixelValidationResult(null);
                  setCreatedAppId(null);
                }
              },
            },
          ]}
        >
          <Modal.Section>
            <BlockStack gap="400">
              {/* Step 1: Create Pixel */}
              {enhancedCreateStep === 1 && (
                <>
                  {/* Facebook Connection Status */}
                  {mounted && isConnectedToFacebook && facebookUser ? (
                <Card background="bg-surface-success">
                  <InlineStack align="space-between" blockAlign="center">
                    <InlineStack gap="200" blockAlign="center">
                      {facebookUser.picture ? (
                        <img 
                          src={facebookUser.picture} 
                          alt={facebookUser.name}
                          style={{
                            width: "40px",
                            height: "40px",
                            borderRadius: "50%",
                            objectFit: "cover",
                            border: "2px solid #1877f2"
                          }}
                        />
                      ) : (
                        <div style={{
                          width: "40px",
                          height: "40px",
                          borderRadius: "50%",
                          backgroundColor: "#1877f2",
                          display: "flex",
                          alignItems: "center",
                          justifyContent: "center",
                          color: "white",
                          fontWeight: "bold",
                          fontSize: "16px"
                        }}>
                          {facebookUser.name.charAt(0).toUpperCase()}
                        </div>
                      )}
                      <BlockStack gap="050">
                        <Text variant="bodyMd" fontWeight="medium" as="span">
                          Connected to Facebook
                        </Text>
                        <Text variant="bodySm" tone="subdued" as="span">
                          {facebookUser.name} • {facebookPixels.length} pixel(s) available
                        </Text>
                      </BlockStack>
                    </InlineStack>
                    <InlineStack gap="200">
                      <Button
                        size="slim"
                        onClick={handleRefreshFacebookData}
                        loading={isRefreshingToken}
                      >
                        Refresh
                      </Button>
                      <Button
                        size="slim"
                        variant="plain"
                        tone="critical"
                        onClick={handleDisconnectFacebook}
                      >
                        Disconnect
                      </Button>
                    </InlineStack>
                  </InlineStack>
                </Card>
              ) : (
                <Card background="bg-surface-secondary">
                  <InlineStack align="space-between" blockAlign="center">
                    <BlockStack gap="100">
                      <Text variant="bodyMd" fontWeight="medium" as="span">
                        Connect Facebook Account
                      </Text>
                      <Text variant="bodySm" tone="subdued" as="span">
                        Auto-fetch your existing pixels
                      </Text>
                    </BlockStack>
                    <Button
                      onClick={handleConnectToFacebook}
                      variant="primary"
                      size="slim"
                    >
                      Connect Facebook
                    </Button>
                  </InlineStack>
                </Card>
              )}

              <div>
                <Text as="p" variant="bodyMd" fontWeight="medium">
                  App Name <Text as="span" tone="critical">*</Text>
                </Text>
                <div style={{ marginTop: "8px", marginBottom: "4px" }}>
                  <TextField
                    label=""
                    value={enhancedCreateForm.appName}
                    onChange={(value) => setEnhancedCreateForm(prev => ({ ...prev, appName: value }))}
                    placeholder="e.g., My Store Pixel"
                    autoComplete="off"
                  />
                </div>
                <Text as="p" variant="bodySm" tone="subdued">
                  Name for your pixel in this app
                </Text>
              </div>

              {/* Pixel Selection - Omega Style */}
              {mounted && isConnectedToFacebook && facebookPixels.length > 0 ? (
                <div>
                  <Text as="p" variant="bodyMd" fontWeight="medium">
                    Select Facebook Pixel <Text as="span" tone="critical">*</Text>
                  </Text>
                  <div style={{ marginTop: "8px", marginBottom: "4px" }}>
                    <Select
                      label=""
                      options={[
                        { label: "Choose a pixel...", value: "" },
                        ...facebookPixels
                          .filter(pixel => !apps.some((app: any) => app.settings?.metaPixelId === pixel.id))
                          .map(pixel => ({
                            label: `${pixel.name} (${pixel.id})`,
                            value: pixel.id
                          })),
                        { label: "Enter manually", value: "manual" }
                      ]}
                      value={selectedFacebookPixel}
                      onChange={(value) => {
                        setSelectedFacebookPixel(value);
                        if (value !== "manual" && value !== "") {
                          const selectedPixel = facebookPixels.find(p => p.id === value);
                          if (selectedPixel) {
                            setEnhancedCreateForm(prev => ({
                              ...prev,
                              pixelId: selectedPixel.id,
                              appName: prev.appName || selectedPixel.name,
                              accessToken: facebookAccessToken
                            }));
                          }
                        } else if (value === "manual") {
                          setEnhancedCreateForm(prev => ({
                            ...prev,
                            pixelId: "",
                            accessToken: ""
                          }));
                        }
                      }}
                    />
                  </div>
                  <Text as="p" variant="bodySm" tone="subdued">
                    Select from your Facebook pixels or enter manually
                  </Text>
                  
                  {/* Show filtered pixels info */}
                  {facebookPixels.some(pixel => apps.some((app: any) => app.settings?.metaPixelId === pixel.id)) && (
                    <div style={{ marginTop: "8px" }}>
                      <Banner tone="info">
                        <p>
                          Some pixels are hidden because they're already added to your app.
                        </p>
                      </Banner>
                    </div>
                  )}
                </div>
              ) : null}

              {/* Manual Pixel ID Input */}
              {(!mounted || !isConnectedToFacebook || selectedFacebookPixel === "manual") && (
                <div>
                  <Text as="p" variant="bodyMd" fontWeight="medium">
                    Pixel ID (Dataset ID) <Text as="span" tone="critical">*</Text>
                  </Text>
                  <div style={{ marginTop: "8px", marginBottom: "4px" }}>
                    <TextField
                      label=""
                      value={enhancedCreateForm.pixelId}
                      onChange={(value) => setEnhancedCreateForm(prev => ({ ...prev, pixelId: value }))}
                      placeholder="e.g., 1234567890123456"
                      autoComplete="off"
                      error={
                        enhancedCreateForm.pixelId && 
                        apps.some((app: any) => app.settings?.metaPixelId === enhancedCreateForm.pixelId)
                          ? "This pixel is already added to your app"
                          : undefined
                      }
                    />
                  </div>
                  <Text as="p" variant="bodySm" tone="subdued">
                    Find in Meta Events Manager → Data Sources → Select your dataset → Dataset ID
                  </Text>
                  
                  {/* Show warning if pixel already exists */}
                  {enhancedCreateForm.pixelId && 
                   apps.some((app: any) => app.settings?.metaPixelId === enhancedCreateForm.pixelId) && (
                    <div style={{ marginTop: "8px" }}>
                      <Banner tone="critical">
                        <p>
                          This pixel ID is already added to your app as "{apps.find((app: any) => app.settings?.metaPixelId === enhancedCreateForm.pixelId)?.name}". 
                          Each pixel can only be added once.
                        </p>
                      </Banner>
                    </div>
                  )}
                </div>
              )}

              {/* Access Token - Only for manual entry */}
              {(!mounted || !isConnectedToFacebook || selectedFacebookPixel === "manual") && (
                <div>
                  <Text as="p" variant="bodyMd" fontWeight="medium">
                    Access Token (Optional)
                  </Text>
                  <div style={{ marginTop: "8px", marginBottom: "4px" }}>
                    <TextField
                      label=""
                      value={enhancedCreateForm.accessToken}
                      onChange={(value) => setEnhancedCreateForm(prev => ({ ...prev, accessToken: value }))}
                      type="password"
                      placeholder="EAAxxxxxxxx..."
                      autoComplete="off"
                    />
                  </div>
                  <Text as="p" variant="bodySm" tone="subdued">
                    Generate in Meta Events Manager → Settings → Conversions API → Generate Access Token
                  </Text>
                  
                  {/* Validate Button for manual entry */}
                  {enhancedCreateForm.pixelId && enhancedCreateForm.accessToken && (
                    <div style={{ marginTop: "12px" }}>
                      <Button
                        onClick={() => validatePixelWithSDK(enhancedCreateForm.pixelId, enhancedCreateForm.accessToken)}
                        loading={isValidatingPixel}
                      >
                        Validate Pixel
                      </Button>
                    </div>
                  )}
                  
                  {/* Manual validation result */}
                  {pixelValidationResult && (
                    <div style={{ marginTop: "12px" }}>
                      {pixelValidationResult.valid ? (
                        <Banner tone="success">
                          <p>✅ Pixel validated! Name: <strong>{pixelValidationResult.pixelName}</strong></p>
                        </Banner>
                      ) : (
                        <Banner tone="critical">
                          <p>❌ Validation failed: {pixelValidationResult.error}</p>
                        </Banner>
                      )}
                    </div>
                  )}
                </div>
              )}

              {/* Pixel Validation Status - Auto validation for SDK-selected pixels */}
              {mounted && isConnectedToFacebook && selectedFacebookPixel && selectedFacebookPixel !== "manual" && (
                <>
                  {isValidatingPixel ? (
                    <Banner tone="info">
                      <p>🔄 Validating pixel with Facebook...</p>
                    </Banner>
                  ) : pixelValidationResult?.valid ? (
                    <Banner tone="success">
                      <p>
                        ✅ Pixel validated successfully! Name: <strong>{pixelValidationResult.pixelName}</strong>
                      </p>
                    </Banner>
                  ) : pixelValidationResult?.error ? (
                    <Banner tone="critical">
                      <p>❌ Pixel validation failed: {pixelValidationResult.error}</p>
                    </Banner>
                  ) : null}
                </>
              )}
              </>
              )}

              {/* Step 2: Choose Timezone */}
              {enhancedCreateStep === 2 && (
                <>
                  <Banner tone="success">
                    <p>✅ Pixel created successfully! Now choose your GMT timezone for tracking events.</p>
                  </Banner>

                  <div>
                    <Text as="p" variant="bodyMd" fontWeight="medium">
                      Select GMT Timezone <Text as="span" tone="critical">*</Text>
                    </Text>
                    <div style={{ marginTop: "8px", marginBottom: "4px" }}>
                      <Select
                        label=""
                        options={timezoneOptions}
                        value={selectedTimezone}
                        onChange={setSelectedTimezone}
                      />
                    </div>
                    <Text as="p" variant="bodySm" tone="subdued">
                      This timezone will be used for sending tracking events to Facebook.
                    </Text>
                  </div>

                  {/* Current Selection Display */}
                  <Card>
                    <BlockStack gap="200">
                      <Text variant="headingSm" as="h3">Selected Timezone</Text>
                      <InlineStack gap="200" blockAlign="center">
                        <div style={{
                          width: "12px",
                          height: "12px",
                          borderRadius: "50%",
                          backgroundColor: "#10b981"
                        }}></div>
                        <Text as="p" variant="bodyMd" fontWeight="medium">
                          {timezoneOptions.find(tz => tz.value === selectedTimezone)?.label || selectedTimezone}
                        </Text>
                      </InlineStack>
                    </BlockStack>
                  </Card>

                  <Banner tone="info">
                    <BlockStack gap="100">
                      <Text as="p" variant="bodyMd" fontWeight="medium">Why timezone matters:</Text>
                      <Text as="p" variant="bodySm">
                        • Facebook uses timezone to properly attribute conversions
                      </Text>
                      <Text as="p" variant="bodySm">
                        • Events are timestamped based on your selected timezone
                      </Text>
                      <Text as="p" variant="bodySm">
                        • Helps with accurate reporting and audience insights
                      </Text>
                    </BlockStack>
                  </Banner>
                </>
              )}
            </BlockStack>
          </Modal.Section>
        </Modal>

        {/* Create Modal - Enhanced Facebook Pixel Manager Style */}
        <Modal
          open={showCreateModal}
          onClose={handleCreateModalClose}
          title="Create New Pixel"
          primaryAction={{
            content: "Create Pixel",
            onAction: handleCreate,
            loading: isLoading,
            disabled: 
              !createForm.name || 
              !createForm.metaAppId ||
              apps.some((app: any) => app.settings?.metaPixelId === createForm.metaAppId),
          }}
          secondaryActions={[
            {
              content: "Cancel",
              onAction: handleCreateModalClose,
            },
          ]}
        >
          <Modal.Section>
            <BlockStack gap="400">
              <TextField
                label="App Name"
                value={createForm.name}
                onChange={(value) => setCreateForm(prev => ({ ...prev, name: value }))}
                placeholder="e.g., My Store Pixel"
                helpText="Name for your pixel in this app"
                autoComplete="off"
                requiredIndicator
              />

              <div>
                <Text as="p" variant="bodyMd" fontWeight="medium">
                  Pixel ID (Dataset ID) <Text as="span" tone="critical">*</Text>
                </Text>
                <div style={{ marginTop: "8px", marginBottom: "4px" }}>
                  <TextField
                    label=""
                    value={createForm.metaAppId}
                    onChange={(value) => setCreateForm(prev => ({ ...prev, metaAppId: value }))}
                    placeholder="e.g., 1234567890123456"
                    autoComplete="off"
                    error={
                      createForm.metaAppId && 
                      apps.some((app: any) => app.settings?.metaPixelId === createForm.metaAppId)
                        ? "This pixel is already added to your app"
                        : undefined
                    }
                  />
                </div>
                <Text as="p" variant="bodySm" tone="subdued">
                  Find in Meta Events Manager → Data Sources → Select your dataset → Dataset ID
                </Text>
                
                {/* Show warning if pixel already exists */}
                {createForm.metaAppId && 
                 apps.some((app: any) => app.settings?.metaPixelId === createForm.metaAppId) && (
                  <div style={{ marginTop: "8px" }}>
                    <Banner tone="critical">
                      <p>
                        This pixel ID is already added to your app as "{apps.find((app: any) => app.settings?.metaPixelId === createForm.metaAppId)?.name}". 
                        Each pixel can only be added once.
                      </p>
                    </Banner>
                  </div>
                )}
              </div>

              <div>
                <Text as="p" variant="bodyMd" fontWeight="medium">
                  Access Token (Optional)
                </Text>
                <div style={{ marginTop: "8px", marginBottom: "4px" }}>
                  <TextField
                    label=""
                    value={createForm.metaAccessToken}
                    onChange={(value) => setCreateForm(prev => ({ ...prev, metaAccessToken: value }))}
                    type="password"
                    placeholder="EAAxxxxxxxx..."
                    autoComplete="off"
                  />
                </div>
                <Text as="p" variant="bodySm" tone="subdued">
                  Generate in Meta Events Manager → Settings → Conversions API → Generate Access Token
                </Text>
              </div>
            </BlockStack>
          </Modal.Section>
        </Modal>

        {/* Rename Modal */}
        {showRenameModal && (
          <Modal
            open={true}
            onClose={() => {
              setShowRenameModal(null);
              setRenameValue("");
            }}
            title="Rename Pixel"
            primaryAction={{
              content: "Save",
              onAction: handleRename,
              loading: isLoading,
              disabled: !renameValue.trim(),
            }}
            secondaryActions={[
              {
                content: "Cancel",
                onAction: () => {
                  setShowRenameModal(null);
                  setRenameValue("");
                },
              },
            ]}
          >
            <Modal.Section>
              <TextField
                label="New Name"
                value={renameValue}
                onChange={setRenameValue}
                autoComplete="off"
                autoFocus
              />
            </Modal.Section>
          </Modal>
        )}

        {/* Delete Confirmation Modal */}
        {showDeleteModal && (
          <Modal
            open={true}
            onClose={() => setShowDeleteModal(null)}
            title="Delete Pixel"
            primaryAction={{
              content: "Delete Permanently",
              onAction: handleDelete,
              loading: isLoading,
              destructive: true,
            }}
            secondaryActions={[
              {
                content: "Cancel",
                onAction: () => setShowDeleteModal(null),
              },
            ]}
          >
            <Modal.Section>
              <BlockStack gap="400">
                <Banner tone="critical">
                  <p>
                    Are you sure you want to delete "{showDeleteModal.name}"? This will permanently delete all associated events, sessions, and data. This action cannot be undone.
                  </p>
                </Banner>
              </BlockStack>
            </Modal.Section>
          </Modal>
        )}

        {/* Snippet Modal */}
        {showSnippet && (
          <Modal
            open={true}
            onClose={() => setShowSnippet(null)}
            title="Install Tracking Code"
            primaryAction={{
              content: "Copy Code",
              onAction: copyToClipboard,
            }}
            secondaryActions={[
              {
                content: "Close",
                onAction: () => setShowSnippet(null),
              },
            ]}
          >
            <Modal.Section>
              <BlockStack gap="400">
                <Text as="p">
                  Add this code to your store's theme, just before the closing &lt;/head&gt; tag:
                </Text>
                <div
                  style={{
                    padding: "16px",
                    backgroundColor: "#f6f6f7",
                    borderRadius: "8px",
                    fontFamily: "monospace",
                    fontSize: "12px",
                    whiteSpace: "pre-wrap",
                    overflowX: "auto",
                  }}
                >
                  {snippetText}
                </div>
                <Text as="p" tone="subdued">
                  For Shopify themes: Go to Online Store → Themes → Edit code → theme.liquid
                </Text>
              </BlockStack>
            </Modal.Section>
          </Modal>
        )}
      </Page>
    );
  }

  return (
    <div style={{ 
      backgroundColor: "#f6f6f7", 
      minHeight: "100vh", 
      padding: "40px 20px" 
    }}>
      <div style={{ 
        maxWidth: "1200px", 
        margin: "0 auto" 
      }}>
        {/* Header */}
        <div style={{ textAlign: "center", marginBottom: "40px" }}>
          <Text variant="heading2xl" as="h1" alignment="center">
            Get your Pixels ready
          </Text>
          <Text as="p" tone="subdued" alignment="center" variant="bodyLg">
            Install the right pixels, and install the pixels right
          </Text>
        </div>

        <div style={{ 
          display: "grid", 
          gridTemplateColumns: "300px 1fr", 
          gap: "40px",
          alignItems: "start"
        }}>
          {/* Left Sidebar - Steps */}
          <Card>
            <BlockStack gap="400">
              {/* Step 1 */}
              <div style={{ 
                display: "flex", 
                alignItems: "flex-start", 
                gap: "12px",
                padding: "16px",
                backgroundColor: currentStep === 1 ? "#f0f8ff" : "transparent",
                borderRadius: "8px"
              }}>
                <div style={{
                  width: "24px",
                  height: "24px",
                  borderRadius: "50%",
                  backgroundColor: currentStep >= 1 ? "#2563eb" : "#e5e7eb",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  flexShrink: 0,
                  marginTop: "2px"
                }}>
                  {currentStep > 1 ? (
                    <Icon source={CheckIcon} tone="base" />
                  ) : (
                    <Text as="span" variant="bodySm" tone={currentStep === 1 ? "base" : "subdued"}>
                      1
                    </Text>
                  )}
                </div>
                <BlockStack gap="100">
                  <Text variant="headingSm" as="h3">
                    Add Facebook Pixel
                  </Text>
                  <Text variant="bodySm" as="p" tone="subdued">
                    Install the right pixels, and install the pixels right
                  </Text>
                </BlockStack>
              </div>

              {/* Step 2 */}
              <div style={{ 
                display: "flex", 
                alignItems: "flex-start", 
                gap: "12px",
                padding: "16px",
                backgroundColor: currentStep === 2 ? "#f0f8ff" : "transparent",
                borderRadius: "8px"
              }}>
                <div style={{
                  width: "24px",
                  height: "24px",
                  borderRadius: "50%",
                  backgroundColor: currentStep >= 2 ? "#2563eb" : "#e5e7eb",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  flexShrink: 0,
                  marginTop: "2px"
                }}>
                  <Text as="span" variant="bodySm" tone={currentStep >= 2 ? "base" : "subdued"}>
                    2
                  </Text>
                </div>
                <BlockStack gap="100">
                  <Text variant="headingSm" as="h3">
                    Conversion API
                  </Text>
                  <Text variant="bodySm" as="p" tone="subdued">
                    Track all customer behavior events bypassing the browser's limitation
                  </Text>
                </BlockStack>
              </div>

              {/* Step 3 */}
              <div style={{ 
                display: "flex", 
                alignItems: "flex-start", 
                gap: "12px",
                padding: "16px",
                backgroundColor: currentStep === 3 ? "#f0f8ff" : "transparent",
                borderRadius: "8px"
              }}>
                <div style={{
                  width: "24px",
                  height: "24px",
                  borderRadius: "50%",
                  backgroundColor: currentStep >= 3 ? "#2563eb" : "#e5e7eb",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  flexShrink: 0,
                  marginTop: "2px"
                }}>
                  <Text as="span" variant="bodySm" tone={currentStep >= 3 ? "base" : "subdued"}>
                    3
                  </Text>
                </div>
                <BlockStack gap="100">
                  <Text variant="headingSm" as="h3">
                    Timezone
                  </Text>
                  <Text variant="bodySm" as="p" tone="subdued">
                    Set the timezone for sending tracking events
                  </Text>
                </BlockStack>
              </div>

              {/* Step 4 */}
              <div style={{ 
                display: "flex", 
                alignItems: "flex-start", 
                gap: "12px",
                padding: "16px",
                backgroundColor: currentStep === 4 ? "#f0f8ff" : "transparent",
                borderRadius: "8px"
              }}>
                <div style={{
                  width: "24px",
                  height: "24px",
                  borderRadius: "50%",
                  backgroundColor: currentStep >= 4 ? "#2563eb" : "#e5e7eb",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  flexShrink: 0,
                  marginTop: "2px"
                }}>
                  <Text as="span" variant="bodySm" tone={currentStep >= 4 ? "base" : "subdued"}>
                    4
                  </Text>
                </div>
                <BlockStack gap="100">
                  <Text variant="headingSm" as="h3">
                    Activate app
                  </Text>
                  <Text variant="bodySm" as="p" tone="subdued">
                    Make sure the app work
                  </Text>
                </BlockStack>
              </div>
            </BlockStack>
          </Card>

          {/* Right Content Area */}
          <Card>
            <BlockStack gap="400">
              {/* Success/Error Banner */}
              {fetcher.data?.success && (
                <Banner tone="success">
                  <p>{fetcher.data.message}</p>
                </Banner>
              )}
              {fetcher.data?.error && (
                <Banner tone="critical">
                  <p>{fetcher.data.error}</p>
                </Banner>
              )}

              {/* Step 1: Create Pixel */}
              {currentStep === 1 && (
                <>
                  <Text variant="headingLg" as="h2">
                    Create New Pixel
                  </Text>

                  <Banner tone="info">
                    <p>
                      <strong>Two ways to add pixels:</strong> Connect your Facebook account to auto-fetch existing pixels, or manually enter your Pixel ID and Access Token.
                    </p>
                  </Banner>

                  {/* Input Method Tabs */}
                  <div style={{ 
                    display: "flex", 
                    gap: "1px", 
                    backgroundColor: "#e5e7eb", 
                    borderRadius: "8px", 
                    padding: "4px" 
                  }}>
                    <button
                      onClick={() => {
                        setInputMethod("auto");
                        setPixelForm({ pixelName: "", pixelId: "", trackingPages: "all" });
                      }}
                      style={{
                        flex: 1,
                        padding: "12px 24px",
                        backgroundColor: inputMethod === "auto" ? "white" : "transparent",
                        border: "none",
                        borderRadius: "6px",
                        cursor: "pointer",
                        fontWeight: inputMethod === "auto" ? "600" : "400",
                        color: inputMethod === "auto" ? "#1f2937" : "#6b7280"
                      }}
                    >
                      Auto Input Pixel
                    </button>
                    <button
                      onClick={() => {
                        setInputMethod("manual");
                        setPixelForm({ pixelName: "", pixelId: "", trackingPages: "all" });
                        setIsConnectedToFacebook(false);
                        setFacebookPixels([]);
                        setSelectedFacebookPixel("");
                      }}
                      style={{
                        flex: 1,
                        padding: "12px 24px",
                        backgroundColor: inputMethod === "manual" ? "white" : "transparent",
                        border: "none",
                        borderRadius: "6px",
                        cursor: "pointer",
                        fontWeight: inputMethod === "manual" ? "600" : "400",
                        color: inputMethod === "manual" ? "#1f2937" : "#6b7280"
                      }}
                    >
                      Manual Input
                    </button>
                  </div>
                </>
              )}

              {/* Step 2: Choose Timezone */}
              {currentStep === 2 && (
                <>
                  <Text variant="headingLg" as="h2">
                    Choose GMT Timezone
                  </Text>

                  <Banner tone="success">
                    <p>✅ Pixel created successfully! Now choose your GMT timezone for tracking events.</p>
                  </Banner>

                  <div>
                    <Text as="p" variant="bodyMd" fontWeight="medium">
                      Select GMT Timezone <Text as="span" tone="critical">*</Text>
                    </Text>
                    <div style={{ marginTop: "8px", marginBottom: "4px" }}>
                      <Select
                        label=""
                        options={timezoneOptions}
                        value={selectedTimezone}
                        onChange={setSelectedTimezone}
                      />
                    </div>
                    <Text as="p" variant="bodySm" tone="subdued">
                      This timezone will be used for sending tracking events to Facebook.
                    </Text>
                  </div>

                  {/* Current Selection Display */}
                  <Card>
                    <BlockStack gap="200">
                      <Text variant="headingSm" as="h3">Selected Timezone</Text>
                      <InlineStack gap="200" blockAlign="center">
                        <div style={{
                          width: "12px",
                          height: "12px",
                          borderRadius: "50%",
                          backgroundColor: "#10b981"
                        }}></div>
                        <Text as="p" variant="bodyMd" fontWeight="medium">
                          {timezoneOptions.find(tz => tz.value === selectedTimezone)?.label || selectedTimezone}
                        </Text>
                      </InlineStack>
                    </BlockStack>
                  </Card>

                  <Banner tone="info">
                    <BlockStack gap="100">
                      <Text as="p" variant="bodyMd" fontWeight="medium">Why timezone matters:</Text>
                      <Text as="p" variant="bodySm">
                        • Facebook uses timezone to properly attribute conversions
                      </Text>
                      <Text as="p" variant="bodySm">
                        • Events are timestamped based on your selected timezone
                      </Text>
                      <Text as="p" variant="bodySm">
                        • Helps with accurate reporting and audience insights
                      </Text>
                    </BlockStack>
                  </Banner>
                </>
              )}

              {/* Form Fields */}
              <BlockStack gap="400">
                {inputMethod === "auto" ? (
                  // Auto Input - Facebook Integration
                  <BlockStack gap="400">
                    {facebookError && (
                      <Banner tone="critical" onDismiss={() => setFacebookError("")}>
                        <p>{facebookError}</p>
                      </Banner>
                    )}
                    
                    {!mounted || !isConnectedToFacebook ? (
                      <Card background="bg-surface-secondary">
                        <BlockStack gap="300">
                          <InlineStack gap="200" blockAlign="center">
                            <Icon source={ConnectIcon} tone="base" />
                            <Text variant="headingSm" as="h3">
                              Connect to Facebook
                            </Text>
                          </InlineStack>
                          <Text as="p" tone="subdued">
                            Connect your Facebook account to automatically fetch your available pixels.
                          </Text>
                          <InlineStack gap="200">
                            <Button 
                              variant="primary" 
                              onClick={handleConnectToFacebook}
                            >
                              Connect to Facebook
                            </Button>
                            <Button 
                              variant="secondary" 
                              onClick={() => setShowFacebookModal(true)}
                            >
                              Manual Token
                            </Button>
                          </InlineStack>
                        </BlockStack>
                      </Card>
                    ) : (
                      <BlockStack gap="300">
                        <Banner tone="success">
                          <p>✅ Connected to Facebook! Found {facebookPixels.length} pixel(s).</p>
                        </Banner>
                        
                        {facebookPixels.length > 0 && (
                          <>
                            <Select
                              label="Select a Facebook Pixel"
                              options={[
                                { label: "Choose a pixel...", value: "" },
                                ...facebookPixels
                                  .filter(pixel => {
                                    // Filter out pixels that are already added
                                    return !apps.some((app: any) => app.settings?.metaPixelId === pixel.id);
                                  })
                                  .map(pixel => ({
                                    label: `${pixel.name} (${pixel.accountName})`,
                                    value: pixel.id
                                  }))
                              ]}
                              value={selectedFacebookPixel}
                              onChange={(value) => {
                                setSelectedFacebookPixel(value);
                                const selectedPixel = facebookPixels.find(p => p.id === value);
                                if (selectedPixel) {
                                  setPixelForm(prev => ({
                                    ...prev,
                                    pixelName: selectedPixel.name,
                                    pixelId: selectedPixel.id,
                                  }));
                                }
                              }}
                            />
                            
                            {/* Show message if some pixels are already added */}
                            {facebookPixels.some(pixel => apps.some((app: any) => app.settings?.metaPixelId === pixel.id)) && (
                              <Banner tone="info">
                                <p>
                                  Some pixels are hidden because they're already added to your app. 
                                  Each pixel can only be added once.
                                </p>
                              </Banner>
                            )}
                            
                            {/* Show message if all pixels are already added */}
                            {facebookPixels.every(pixel => apps.some((app: any) => app.settings?.metaPixelId === pixel.id)) && (
                              <Banner tone="warning">
                                <p>
                                  All your Facebook pixels are already added to this app. 
                                  You can manage them from the main dashboard.
                                </p>
                              </Banner>
                            )}
                          </>
                        )}
                        
                        <Button 
                          onClick={() => {
                            setIsConnectedToFacebook(false);
                            setFacebookPixels([]);
                            setSelectedFacebookPixel("");
                          }}
                          variant="plain"
                        >
                          Disconnect from Facebook
                        </Button>
                      </BlockStack>
                    )}
                  </BlockStack>
                ) : (
                  // Manual Input
                  <BlockStack gap="400">
                    <TextField
                      label="Name your pixel"
                      value={pixelForm.pixelName}
                      onChange={(value) => setPixelForm(prev => ({ ...prev, pixelName: value }))}
                      placeholder="Any name will do. This is just so you can manage different pixels easily."
                      helpText="Name is required"
                      error={!pixelForm.pixelName && fetcher.data?.error ? "Name is required" : undefined}
                      autoComplete="off"
                      requiredIndicator
                    />

                    <div>
                      <Text as="p" variant="bodyMd" fontWeight="medium">
                        Pixel ID (Dataset ID) <Text as="span" tone="critical">*</Text>
                      </Text>
                      <div style={{ marginTop: "8px", marginBottom: "4px" }}>
                        <TextField
                          label=""
                          value={pixelForm.pixelId}
                          onChange={(value) => setPixelForm(prev => ({ ...prev, pixelId: value }))}
                          placeholder="Enter your Facebook Pixel ID / Dataset ID"
                          error={
                            (!pixelForm.pixelId && fetcher.data?.error) 
                              ? "Facebook Pixel ID is required" 
                              : (pixelForm.pixelId && apps.some((app: any) => app.settings?.metaPixelId === pixelForm.pixelId))
                                ? "This pixel is already added to your app"
                                : undefined
                          }
                          autoComplete="off"
                        />
                      </div>
                      <Text as="p" variant="bodySm" tone="subdued">
                        This is your Facebook Pixel ID (also called Dataset ID)
                      </Text>
                      
                      {/* Show warning if pixel already exists */}
                      {pixelForm.pixelId && 
                       apps.some((app: any) => app.settings?.metaPixelId === pixelForm.pixelId) && (
                        <div style={{ marginTop: "8px" }}>
                          <Banner tone="critical">
                            <p>
                              This pixel ID is already added to your app as "{apps.find((app: any) => app.settings?.metaPixelId === pixelForm.pixelId)?.name}". 
                              Each pixel can only be added once.
                            </p>
                          </Banner>
                        </div>
                      )}
                    </div>

                    <div>
                      <Text as="p" variant="bodyMd" fontWeight="medium">
                        Access Token <Text as="span" tone="critical">*</Text>
                      </Text>
                      <div style={{ marginTop: "8px", marginBottom: "4px" }}>
                        <TextField
                          label=""
                          value={facebookAccessToken}
                          onChange={setFacebookAccessToken}
                          type="password"
                          placeholder="Enter your Facebook access token"
                          error={!facebookAccessToken && fetcher.data?.error ? "Access token is required" : undefined}
                          autoComplete="off"
                        />
                      </div>
                      <Text as="p" variant="bodySm" tone="subdued">
                        Required to validate the pixel and create connection
                      </Text>
                    </div>

                    <Banner tone="info">
                      <p>Both Pixel ID and Access Token are required to validate and create the pixel connection.</p>
                    </Banner>

                    {pixelForm.pixelId && facebookAccessToken && (
                      <Button 
                        onClick={() => {
                          fetcher.submit(
                            {
                              intent: "validate-pixel",
                              pixelId: pixelForm.pixelId,
                              accessToken: facebookAccessToken,
                            },
                            { method: "POST" }
                          );
                        }}
                        loading={isLoading}
                        variant="secondary"
                      >
                        Test Connection
                      </Button>
                    )}
                  </BlockStack>
                )}

                {/* Common fields for both methods */}
                {(inputMethod === "manual" || (inputMethod === "auto" && pixelForm.pixelId)) && (
                  <div>
                    <Text as="p" variant="bodyMd" fontWeight="medium">
                      Tracking on pages
                    </Text>
                    <div style={{ marginTop: "12px" }}>
                      <BlockStack gap="200">
                        <RadioButton
                          label="All pages"
                          checked={pixelForm.trackingPages === "all"}
                          id="all-pages"
                          name="tracking-pages"
                          onChange={() => setPixelForm(prev => ({ ...prev, trackingPages: "all" }))}
                        />
                        <RadioButton
                          label="Selected pages"
                          checked={pixelForm.trackingPages === "selected"}
                          id="selected-pages"
                          name="tracking-pages"
                          onChange={() => setPixelForm(prev => ({ ...prev, trackingPages: "selected" }))}
                        />
                        <RadioButton
                          label="Excluded pages"
                          checked={pixelForm.trackingPages === "excluded"}
                          id="excluded-pages"
                          name="tracking-pages"
                          onChange={() => setPixelForm(prev => ({ ...prev, trackingPages: "excluded" }))}
                        />
                      </BlockStack>
                    </div>
                  </div>
                )}
              </BlockStack>

              {/* Footer */}
              <div style={{ 
                display: "flex", 
                justifyContent: "space-between", 
                alignItems: "center",
                paddingTop: "24px",
                borderTop: "1px solid #e5e7eb"
              }}>
                <Text as="p" variant="bodySm" tone="subdued">
                  Step {currentStep} of 4
                </Text>
                
                {currentStep === 1 && (
                  <Button 
                    variant="primary" 
                    onClick={handleCreatePixel}
                    loading={isLoading}
                    disabled={
                      inputMethod === "auto" 
                        ? !pixelForm.pixelId || !selectedFacebookPixel
                        : !pixelForm.pixelName || 
                          !pixelForm.pixelId || 
                          !facebookAccessToken ||
                          apps.some((app: any) => app.settings?.metaPixelId === pixelForm.pixelId)
                    }
                  >
                    {inputMethod === "manual" ? "Validate & Create Pixel" : "Next"}
                  </Button>
                )}
                
                {currentStep === 2 && (
                  <InlineStack gap="200">
                    <Button 
                      onClick={() => setCurrentStep(1)}
                    >
                      Back
                    </Button>
                    <Button 
                      variant="primary" 
                      loading={isLoading}
                      onClick={() => {
                        if (createdAppId) {
                          fetcher.submit(
                            {
                              intent: "save-timezone",
                              appId: createdAppId,
                              timezone: selectedTimezone,
                            },
                            { method: "POST" }
                          );
                        } else {
                          setCurrentStep(3);
                        }
                      }}
                    >
                      Continue
                    </Button>
                  </InlineStack>
                )}
              </div>
            </BlockStack>
          </Card>
        </div>
      </div>

      {/* Facebook Connection Modal */}
      <Modal
        open={showFacebookModal}
        onClose={() => {
          setShowFacebookModal(false);
          setFacebookAccessToken("");
          setFacebookError("");
        }}
        title="Connect to Facebook"
        primaryAction={{
          content: facebookAccessToken ? "Fetch Pixels" : "Connect with OAuth",
          onAction: facebookAccessToken ? 
            () => {
              fetcher.submit(
                {
                  intent: "fetch-facebook-pixels",
                  accessToken: facebookAccessToken,
                },
                { method: "POST" }
              );
              setShowFacebookModal(false);
            } : 
            handleConnectToFacebook,
          loading: isLoading,
        }}
        secondaryActions={[
          {
            content: "Cancel",
            onAction: () => {
              setShowFacebookModal(false);
              setFacebookAccessToken("");
              setFacebookError("");
            },
          },
        ]}
      >
        <Modal.Section>
          <BlockStack gap="400">
            {facebookError && (
              <Banner tone="critical">
                <p>{facebookError}</p>
              </Banner>
            )}

            <Card>
              <BlockStack gap="300">
                <Text variant="headingSm" as="h3">🚀 Recommended: OAuth Login</Text>
                <Text as="p" variant="bodyMd">
                  Click "Connect with OAuth" above to automatically authenticate with Facebook and fetch your pixels.
                </Text>
                <Text as="p" variant="bodySm" tone="subdued">
                  This will open a popup window where you can log in to Facebook and grant permissions.
                </Text>
              </BlockStack>
            </Card>

            <Divider />

            <Card>
              <BlockStack gap="300">
                <Text variant="headingSm" as="h3">🔧 Alternative: Manual Token</Text>
                
                <TextField
                  label="Facebook Pixel Access Token"
                  value={facebookAccessToken}
                  onChange={setFacebookAccessToken}
                  type="password"
                  placeholder="Enter your Facebook Pixel access token..."
                  helpText="Use this if OAuth doesn't work or you prefer manual setup"
                  autoComplete="off"
                />

                <BlockStack gap="200">
                  <Text as="p" variant="bodySm">
                    <strong>To get a manual token:</strong>
                  </Text>
                  <Text as="p" variant="bodySm">
                    1. Go to <a href="https://developers.facebook.com/tools/explorer/" target="_blank" rel="noopener noreferrer" style={{color: "#2563eb"}}>Facebook Graph API Explorer</a>
                  </Text>
                  <Text as="p" variant="bodySm">
                    2. Select your app and generate a token with <code>ads_read</code>, <code>business_management</code>, <code>ads_management</code>, <code>pages_show_list</code>, <code>pages_read_engagement</code>, <code>catalog_management</code> permissions
                  </Text>
                  <Text as="p" variant="bodySm">
                    3. Copy and paste the token above
                  </Text>
                </BlockStack>
              </BlockStack>
            </Card>

            <Banner tone="info">
              <p><strong>Required Permissions:</strong> Your Facebook app needs <code>ads_read</code>, <code>business_management</code>, <code>ads_management</code>, <code>pages_show_list</code>, <code>pages_read_engagement</code>, <code>catalog_management</code> permissions to access pixel data and manage product catalogs.</p>
            </Banner>
          </BlockStack>
        </Modal.Section>
      </Modal>
    </div>
  );
}

