import { useState, useCallback, useEffect } from "react";
import type { ActionFunctionArgs, LoaderFunctionArgs } from "react-router";
import { useLoaderData, useFetcher, useSearchParams } from "react-router";
import { getShopifyInstance } from "../shopify.server";

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
import { ClientOnly } from "~/components/ClientOnly";
import { PageSelector } from "~/components/PageSelector";
import { OnboardingWizard } from "~/components/dashboard/OnboardingWizard";

export const loader = async ({ request }: LoaderFunctionArgs) => {
  const shopify = getShopifyInstance();

  if (!shopify?.authenticate) {
    console.error("Shopify not configured in app.dashboard loader");
    throw new Response("Shopify configuration not found", { status: 500 });
  }

  // Only handle Shopify authentication
  let session;
  try {
    const authResult = await shopify.authenticate.admin(request);
    session = authResult.session;
  } catch (error) {
    if (error instanceof Response && error.status === 302) throw error;
    console.error("Authentication error:", error);
    throw new Response("Unable to authenticate", { status: 503 });
  }

  const shop = session.shop;

  // Return only shop info - all data will be fetched from API
  return {
    shop,
  };
};

export const action = async ({ request }: ActionFunctionArgs) => {
  const shopify = getShopifyInstance();

  if (!shopify?.authenticate) {
    throw new Response("Shopify configuration not found", { status: 500 });
  }

  // Authenticate the request
  const { session } = await shopify.authenticate.admin(request);

  // Forward all actions to the API endpoint
  const formData = await request.formData();

  console.log('[Dashboard Route] Forwarding request to API');
  console.log('[Dashboard Route] Intent:', formData.get('intent'));
  console.log('[Dashboard Route] Form data keys:', Array.from(formData.keys()));

  // Create a new request to the API endpoint with filtered headers
  const apiUrl = new URL('/api/dashboard', request.url);
  
  // Filter out problematic headers
  const filteredHeaders = new Headers();
  const allowedHeaders = ['content-type', 'authorization', 'cookie', 'user-agent'];
  
  for (const [key, value] of request.headers.entries()) {
    if (allowedHeaders.includes(key.toLowerCase())) {
      filteredHeaders.set(key, value);
    }
  }

  // Ensure content-type is set for form data
  filteredHeaders.set('content-type', 'application/x-www-form-urlencoded');

  // Convert FormData to URLSearchParams for proper forwarding
  const params = new URLSearchParams();
  for (const [key, value] of formData.entries()) {
    params.append(key, value.toString());
  }

  const apiRequest = new Request(apiUrl.toString(), {
    method: 'POST',
    headers: filteredHeaders,
    body: params,
  });

  console.log('[Dashboard Route] Forwarding to:', apiUrl.toString());
  console.log('[Dashboard Route] Body:', params.toString());

  // Forward the request to the API
  try {
    const response = await fetch(apiRequest);
    const result = await response.json();
    console.log('[Dashboard Route] API response:', result);
    return result;
  } catch (error) {
    console.error('[Dashboard Route] API request failed:', error);
    return { error: 'Failed to process request' };
  }
};

export default function DashboardPage() {
  const { shop } = useLoaderData<typeof loader>();
  const fetcher = useFetcher();
  const [searchParams] = useSearchParams();
  const [mounted, setMounted] = useState(false);

  // Dashboard data state (loaded from API)
  const [dashboardData, setDashboardData] = useState<any>(null);
  const [isLoadingData, setIsLoadingData] = useState(false);
  const [dashboardError, setDashboardError] = useState<string | null>(null);
  
  // Store pages state (loaded from Shopify API)
  const [storePages, setStorePages] = useState<any[]>([]);
  const [isLoadingPages, setIsLoadingPages] = useState(false);
  
  // Theme extension status fetcher
  const themeExtensionFetcher = useFetcher<{ 
    isEnabled: boolean; 
    enabled: boolean; 
    reason?: string; 
    themeName?: string; 
    checkedIndicators?: string[];
    themeId?: string;
    extensionType?: string;
    deepLinkUrl?: string;
    note?: string;
    appInstalled?: boolean;
  }>();
  const [themeExtensionEnabled, setThemeExtensionEnabled] = useState(false);
  const [themeExtensionChecked, setThemeExtensionChecked] = useState(false);
  const [lastThemeExtensionCheck, setLastThemeExtensionCheck] = useState<number>(0);

  const [currentStep, setCurrentStep] = useState(1);
  const [inputMethod, setInputMethod] = useState("auto");
  const [showRenameModal, setShowRenameModal] = useState<any>(null);
  const [showDeleteModal, setShowDeleteModal] = useState<any>(null);
  const [showWebsiteModal, setShowWebsiteModal] = useState<any>(null);
  const [showFacebookModal, setShowFacebookModal] = useState(false);
  const [showSnippet, setShowSnippet] = useState<string | null>(null);
  const [facebookAccessToken, setFacebookAccessToken] = useState("");
  const [selectedFacebookPixel, setSelectedFacebookPixel] = useState("");
  const [facebookPixels, setFacebookPixels] = useState<Array<{ id: string, name: string, accountName: string }>>([]);
  const [isConnectedToFacebook, setIsConnectedToFacebook] = useState(false);
  const [facebookError, setFacebookError] = useState("");
  const [facebookUser, setFacebookUser] = useState<{ id: string, name: string, picture?: string | null } | null>(null);
  const [isRefreshingToken, setIsRefreshingToken] = useState(false);

  // Timezone state
  const [selectedTimezone, setSelectedTimezone] = useState("GMT+0");
  const [createdAppId, setCreatedAppId] = useState<string | null>(null);

  // Pixel validation state
  const [pixelValidationResult, setPixelValidationResult] = useState<{ valid: boolean; pixelName?: string; error?: string } | null>(null);
  const [isValidatingPixel, setIsValidatingPixel] = useState(false);
  
  // Success/Error message state to prevent hydration mismatch
  const [successMessage, setSuccessMessage] = useState<string | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  
  // Manual loading state for onboarding to handle edge cases
  const [isOnboardingLoading, setIsOnboardingLoading] = useState(false);
  
  // Track if we've already fetched pixels to prevent duplicate requests
  const [hasFetchedPixels, setHasFetchedPixels] = useState(false);
  
  // Track the last fetcher submission time to detect stuck requests
  const [lastSubmitTime, setLastSubmitTime] = useState<number>(0);
  
  // Track loading progress
  const [loadingProgress, setLoadingProgress] = useState(0);

  const isLoading = fetcher.state !== "idle" || isOnboardingLoading;

  // Load dashboard data from API on mount
  useEffect(() => {
    const loadDashboardData = async () => {
      try {
        // setIsLoadingData(true); // DISABLED to prevent loading button issues
        setDashboardError(null);
        const response = await fetch('/api/dashboard');
        
        if (!response.ok) {
          throw new Error(`Failed to load dashboard: ${response.status} ${response.statusText}`);
        }
        
        const data = await response.json();
        
        if (data.error) {
          console.error('[Dashboard] Error loading data:', data.error);
          setDashboardError(data.error);
        } else {
          setDashboardData(data);
          setDashboardError(null);
        }
      } catch (error: any) {
        console.error('[Dashboard] Failed to load data:', error);
        setDashboardError(error.message || 'Failed to load dashboard data');
      } finally {
        // setIsLoadingData(false); // DISABLED to prevent loading button issues
      }
    };
    
    loadDashboardData();
  }, []);

  // Load store pages from Shopify API on mount - DISABLED to prevent connection pool exhaustion
  useEffect(() => {
    // Don't auto-load pages to prevent database connection issues
    // Pages will be loaded when user actually opens the PageSelector
    console.log('[Dashboard] Skipping auto-load of store pages to prevent connection pool exhaustion');
    setIsLoadingPages(false);
    
    // Use default system pages as fallback
    setStorePages(getDefaultPages());
  }, []);

  // Helper function for default pages
  const getDefaultPages = () => [
    { label: "All Pages", value: "all", type: "system" },
    { label: "Home Page", value: "/", type: "system" },
    { label: "All Products Page", value: "/products", type: "system" },
    { label: "All Collections Page", value: "/collections", type: "system" },
    { label: "Cart Page", value: "/cart", type: "system" },
    { label: "Checkout Page", value: "/checkout", type: "system" },
    { label: "Thank You Page", value: "/thank_you", type: "system" },
    { label: "Account Page", value: "/account", type: "system" },
    { label: "Login Page", value: "/account/login", type: "system" },
    { label: "Register Page", value: "/account/register", type: "system" },
    { label: "Order History", value: "/account/orders", type: "system" },
    { label: "Search Page", value: "/search", type: "system" },
    { label: "Any Product Page", value: "/products/*", type: "system" },
    { label: "Any Collection Page", value: "/collections/*", type: "system" },
    { label: "Any Blog Post", value: "/blogs/*", type: "system" },
    { label: "Any Custom Page", value: "/pages/*", type: "system" },
  ];
  
  // Check theme extension status using fetcher (like ThemeExtensionGuard)
  useEffect(() => {
    if (!themeExtensionChecked && themeExtensionFetcher.state === "idle") {
      console.log('[Dashboard] Checking theme extension status...');
      themeExtensionFetcher.submit(
        { intent: "check-theme-extension" },
        { method: "POST", action: "/api/theme-extension-status" }
      );
      setThemeExtensionChecked(true);
    }
  }, [themeExtensionChecked, themeExtensionFetcher]);
  
  // Update theme extension status when fetcher returns data
  useEffect(() => {
    if (themeExtensionFetcher.data) {
      const isEnabled = themeExtensionFetcher.data.isEnabled || themeExtensionFetcher.data.enabled || false;
      setThemeExtensionEnabled(isEnabled);
      console.log('[Dashboard] Theme extension status updated:', isEnabled);
      console.log('[Dashboard] Theme extension details:', themeExtensionFetcher.data);
    }
  }, [themeExtensionFetcher.data]);

  // Handle fetcher responses (Facebook token save, disconnect, etc.)
  useEffect(() => {
    if (fetcher.data) {
      console.log('[Dashboard] Fetcher response:', fetcher.data);
      
      // If Facebook token was saved successfully, refresh dashboard data
      if (fetcher.data.intent === "save-facebook-token" && fetcher.data.success) {
        console.log('[Dashboard] ✅ Facebook token saved successfully!');
        console.log('[Dashboard] Save response:', fetcher.data);
        console.log('[Dashboard] Refreshing dashboard data...');
        
        // Save session data to localStorage if provided by server
        if (fetcher.data.saveToLocalStorage && typeof window !== "undefined") {
          console.log('[Dashboard] Saving Facebook session to localStorage...');
          localStorage.setItem("facebook_access_token", fetcher.data.saveToLocalStorage.accessToken);
          localStorage.setItem("facebook_token_expires_at", fetcher.data.saveToLocalStorage.expiresAt);
          
          // Update client state immediately
          setFacebookAccessToken(fetcher.data.saveToLocalStorage.accessToken);
          setIsConnectedToFacebook(true);
          
          console.log('[Dashboard] Facebook session saved to localStorage');
        }
        
        // Force refresh dashboard data to get updated hasValidFacebookToken
        const loadDashboardData = async () => {
          try {
            // setIsLoadingData(true); // DISABLED to prevent loading button issues
            console.log('[Dashboard] Fetching fresh dashboard data...');
            const response = await fetch('/api/dashboard?refresh=true&t=' + Date.now());
            
            if (!response.ok) {
              throw new Error(`Failed to refresh dashboard: ${response.status} ${response.statusText}`);
            }
            
            const data = await response.json();
            console.log('[Dashboard] Fresh dashboard data received:', data);
            console.log('[Dashboard] hasValidFacebookToken:', data.hasValidFacebookToken);
            
            setDashboardData(data);
            setDashboardError(null);
            console.log('[Dashboard] ✅ Dashboard data refreshed after token save');
            
            // Auto-fetch pixels after successful token save
            if (data.hasValidFacebookToken && fetcher.data.saveToLocalStorage?.accessToken) {
              console.log('[Dashboard] Auto-fetching Facebook pixels...');
              setTimeout(() => {
                fetcher.submit(
                  {
                    intent: "fetch-facebook-pixels",
                    accessToken: fetcher.data.saveToLocalStorage.accessToken,
                  },
                  { method: "POST" }
                );
              }, 1000); // Small delay to ensure state is updated
            }
          } catch (error: any) {
            console.error('[Dashboard] Failed to refresh dashboard after token save:', error);
            setDashboardError(error.message || 'Failed to refresh dashboard');
          } finally {
            // setIsLoadingData(false); // DISABLED to prevent loading button issues
          }
        };
        
        loadDashboardData();
      }

      // Handle Facebook token save errors
      if (fetcher.data.intent === "save-facebook-token" && !fetcher.data.success) {
        console.error('[Dashboard] ❌ Facebook token save failed!');
        console.error('[Dashboard] Save error response:', fetcher.data);
        setFacebookError(fetcher.data.error || 'Failed to save Facebook token');
      }

      // If Facebook was disconnected successfully, clear localStorage and refresh
      if (fetcher.data.intent === "disconnect-facebook" && fetcher.data.success) {
        console.log('[Dashboard] Facebook disconnected, clearing localStorage and refreshing...');
        
        // Clear all Facebook-related localStorage
        if (typeof window !== "undefined") {
          localStorage.removeItem("facebook_access_token");
          localStorage.removeItem("facebook_user");
          localStorage.removeItem("facebook_pixels");
          console.log('[Dashboard] Cleared Facebook localStorage');
        }
        
        // Reset client state
        setFacebookAccessToken("");
        setFacebookUser(null);
        setFacebookPixels([]);
        setIsConnectedToFacebook(false);
        setSelectedFacebookPixel("");
        
        // Refresh dashboard data
        const loadDashboardData = async () => {
          try {
            // setIsLoadingData(true); // DISABLED to prevent loading button issues
            const response = await fetch('/api/dashboard?refresh=true');
            
            if (!response.ok) {
              throw new Error(`Failed to refresh dashboard: ${response.status} ${response.statusText}`);
            }
            
            const data = await response.json();
            setDashboardData(data);
            setDashboardError(null);
            console.log('[Dashboard] Dashboard data refreshed after Facebook disconnect');
          } catch (error: any) {
            console.error('[Dashboard] Failed to refresh dashboard after disconnect:', error);
            setDashboardError(error.message || 'Failed to refresh dashboard');
          } finally {
            // setIsLoadingData(false); // DISABLED to prevent loading button issues
          }
        };
        
        loadDashboardData();
      }

      // Handle any operation that has realTimeUpdate flag
      if (fetcher.data.realTimeUpdate && fetcher.data.success) {
        console.log('[Dashboard] Real-time update triggered, refreshing dashboard data...');
        const loadDashboardData = async () => {
          try {
            // setIsLoadingData(true); // DISABLED to prevent loading button issues
            const response = await fetch('/api/dashboard?refresh=true');
            
            if (!response.ok) {
              throw new Error(`Failed to refresh dashboard: ${response.status} ${response.statusText}`);
            }
            
            const data = await response.json();
            setDashboardData(data);
            setDashboardError(null);
            console.log('[Dashboard] Dashboard data refreshed for real-time update');
          } catch (error: any) {
            console.error('[Dashboard] Failed to refresh dashboard for real-time update:', error);
            setDashboardError(error.message || 'Failed to refresh dashboard');
          } finally {
            // setIsLoadingData(false); // DISABLED to prevent loading button issues
          }
        };
        
        loadDashboardData();
        
        // Also fetch pixels immediately after token save
        if (facebookAccessToken) {
          console.log('[Dashboard] Fetching pixels after token save...');
          fetcher.submit(
            {
              intent: "fetch-facebook-pixels",
              accessToken: facebookAccessToken,
            },
            { method: "POST" }
          );
        }
      }
      
      // Handle errors from pixel fetch
      if (fetcher.data.error && !fetcher.data.success) {
        console.error('[Dashboard] Fetcher error:', fetcher.data.error);
        
        // Check if this is the "all pixels already added" case
        if (fetcher.data.totalPixels && fetcher.data.existingPixels) {
          console.log(`[Dashboard] Total pixels in Facebook: ${fetcher.data.totalPixels}, Already in DB: ${fetcher.data.existingPixels}`);
          setFacebookError(`You have ${fetcher.data.totalPixels} pixel(s) in Facebook, but all are already added to your app. Create new pixels in Facebook Events Manager or use Manual Input.`);
        } else {
          setFacebookError(fetcher.data.error);
        }
        
        // If user info is still available despite error, save it
        if (fetcher.data.user) {
          console.log('[Dashboard] Saving Facebook user info despite error:', fetcher.data.user.name);
          setFacebookUser(fetcher.data.user);
          if (typeof window !== "undefined") {
            localStorage.setItem("facebook_user", JSON.stringify(fetcher.data.user));
          }
        }
      }
    }
  }, [fetcher.data, facebookAccessToken]);
  
  // Monitor fetcher state - if it goes back to idle without data, something went wrong
  useEffect(() => {
    if (fetcher.state === 'idle' && isOnboardingLoading && !fetcher.data && lastSubmitTime > 0) {
      const elapsed = Date.now() - lastSubmitTime;
      // Only trigger if we've been loading for at least 1 second (to avoid false positives)
      if (elapsed > 1000) {
        console.error('[Dashboard] ⚠️ Fetcher returned to idle without data');
        setIsOnboardingLoading(false);
        setErrorMessage('Request failed. Please check your connection and try again.');
        setLastSubmitTime(0);
      }
    }
  }, [fetcher.state, isOnboardingLoading, fetcher.data, lastSubmitTime]);

  // Extract data from dashboardData with fallbacks
  const apps = dashboardData?.apps || [];
  const hasPixels = apps.length > 0;
  const hasValidFacebookToken = dashboardData?.hasValidFacebookToken || false;
  const stats = dashboardData?.stats || { totalPixels: 0, totalEvents: 0, totalSessions: 0, todayEvents: 0 };
  const recentPurchaseEvents = dashboardData?.recentPurchaseEvents || [];
  const totalPurchaseEvents = dashboardData?.totalPurchaseEvents || 0;
  const purchaseOffset = dashboardData?.purchaseOffset || 0;
  const purchaseLimit = dashboardData?.purchaseLimit || 10;
  const connectionError = dashboardData?.connectionError || false;

  // Sync client state with server state when dashboard data changes
  useEffect(() => {
    if (dashboardData && mounted) {
      console.log('[Dashboard] Syncing client state with server state...');
      console.log('[Dashboard] Server hasValidFacebookToken:', hasValidFacebookToken);
      console.log('[Dashboard] Client isConnectedToFacebook:', isConnectedToFacebook);
      
      // Check localStorage first - prioritize client-side token
      const savedToken = localStorage.getItem("facebook_access_token");
      const savedTokenExpiresAt = localStorage.getItem("facebook_token_expires_at");
      const savedUser = localStorage.getItem("facebook_user");
      
      let hasValidLocalToken = false;
      if (savedToken && savedTokenExpiresAt) {
        const expiresAt = new Date(savedTokenExpiresAt);
        const now = new Date();
        hasValidLocalToken = now < expiresAt;
        console.log('[Dashboard] localStorage token valid:', hasValidLocalToken);
      }
      
      // If we have a valid localStorage token, use it regardless of server state
      if (hasValidLocalToken && !isConnectedToFacebook) {
        console.log('[Dashboard] Using valid localStorage token, setting connected state');
        setIsConnectedToFacebook(true);
        setFacebookAccessToken(savedToken);
        
        // Restore user data if available
        if (savedUser) {
          try {
            setFacebookUser(JSON.parse(savedUser));
          } catch (err) {
            console.error('[Dashboard] Error parsing saved user:', err);
          }
        }
        
        // Restore pixels if available
        const savedPixels = localStorage.getItem("facebook_pixels");
        if (savedPixels) {
          try {
            setFacebookPixels(JSON.parse(savedPixels));
          } catch (err) {
            console.error('[Dashboard] Error parsing saved pixels:', err);
          }
        }
      }
      
      // If localStorage token is expired or missing, sync with server
      if (!hasValidLocalToken) {
        if (hasValidFacebookToken && !isConnectedToFacebook) {
          console.log('[Dashboard] Server has valid token, updating client state to connected');
          setIsConnectedToFacebook(true);
        }
        
        if (!hasValidFacebookToken && isConnectedToFacebook) {
          console.log('[Dashboard] No valid tokens anywhere, updating client state to disconnected');
          setIsConnectedToFacebook(false);
          setFacebookAccessToken("");
          setFacebookUser(null);
          setFacebookPixels([]);
        }
      }
    }
  }, [dashboardData, hasValidFacebookToken, isConnectedToFacebook, mounted]);

  // Use storePages from state (loaded from Shopify API)
  const pageTypeOptions = storePages;

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
    { label: "(GMT-4:00) Atlantic Time (US & Canada)", value: "GMT-4" },
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
    selectedCollections: [] as string[],
    selectedProductTypes: [] as string[],
    selectedProductTags: [] as string[],
    selectedProducts: [] as string[],
  });

  // Enhanced create modal state
  const [showEnhancedCreateModal, setShowEnhancedCreateModal] = useState(false);
  const [enhancedCreateStep, setEnhancedCreateStep] = useState(1); // 1: Create, 2: Timezone
  const [showPageSelector, setShowPageSelector] = useState(false);
  const [enhancedCreateForm, setEnhancedCreateForm] = useState({
    appName: "",
    pixelId: "",
    accessToken: "",
    trackingPages: "all",
    selectedPageTypes: [] as string[],
  });


  // Purchase reports search state
  const [purchaseSearchTerm, setPurchaseSearchTerm] = useState("");
  const [currentPurchaseOffset, setCurrentPurchaseOffset] = useState(0);

  // Rename form state
  const [renameValue, setRenameValue] = useState("");
  const [websiteDomain, setWebsiteDomain] = useState("");

  // Success/Error message state to prevent hydration mismatch
  const [successMessage, setSuccessMessage] = useState<string | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const isLoading = fetcher.state !== "idle";

  // Debug: Watch showPageSelector state changes
  useEffect(() => {
    console.log('[Dashboard] showPageSelector changed to:', showPageSelector);
  }, [showPageSelector]);

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
    
    // Clear any stale pixel cache on mount
    console.log('[Dashboard] Component mounted - clearing stale pixel cache');
    if (typeof window !== "undefined") {
      localStorage.removeItem("facebook_pixels");
    }
  }, []);

  // Sync offset with loader data
  useEffect(() => {
    setCurrentPurchaseOffset(purchaseOffset);
  }, [purchaseOffset]);

  // Initialize Facebook SDK and check login status
  useEffect(() => {
    if (!mounted) return;

    // Load Facebook SDK
    const loadFacebookSDK = () => {
      // Define fbAsyncInit before loading SDK
      (window as any).fbAsyncInit = function () {
        (window as any).FB.init({
          appId: '881927951248648',
          cookie: true,
          xfbml: true,
          version: 'v24.0'
        });

        (window as any).FB.getLoginStatus(function (response: any) {
          console.log('[Facebook SDK] Login status:', response.status);
          if (response.status === 'connected') {
            console.log('[Facebook SDK] User is CONNECTED');
            console.log('[Facebook SDK] User ID:', response.authResponse.userID);
            console.log('[Facebook SDK] Access Token:', response.authResponse.accessToken ? 'Present' : 'Missing');

            // User is logged in and has authorized the app
            const accessToken = response.authResponse.accessToken;
            const expiresIn = response.authResponse.expiresIn;
            const expiresAt = new Date(Date.now() + expiresIn * 1000).toISOString();
            
            // Save to localStorage immediately
            localStorage.setItem("facebook_access_token", accessToken);
            localStorage.setItem("facebook_token_expires_at", expiresAt);
            console.log('[Facebook SDK] Session saved to localStorage');
            
            // Update client state
            setFacebookAccessToken(accessToken);
            setIsConnectedToFacebook(true);

            // Save token to database so other pages (Catalog) can use it
            fetcher.submit(
              { intent: "save-facebook-token", accessToken },
              { method: "POST" }
            );

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
        (window as any).FB.getLoginStatus(function (response: any) {
          console.log('[Facebook SDK] Login status (cached):', response.status);
        });
      }
    };

    loadFacebookSDK();
  }, [mounted]);

  useEffect(() => {
    if (!mounted) return;

    console.log('[Dashboard] Checking localStorage for saved Facebook connection...');
    const savedToken = localStorage.getItem("facebook_access_token");
    const savedTokenExpiresAt = localStorage.getItem("facebook_token_expires_at");
    const savedUser = localStorage.getItem("facebook_user");

    console.log('[Dashboard] Saved token exists:', !!savedToken);
    console.log('[Dashboard] Saved user exists:', !!savedUser);
    console.log('[Dashboard] Server has valid token:', hasValidFacebookToken);

    // Check if saved token is expired
    let isTokenExpired = false;
    if (savedToken && savedTokenExpiresAt) {
      const expiresAt = new Date(savedTokenExpiresAt);
      const now = new Date();
      isTokenExpired = now > expiresAt;
      console.log('[Dashboard] Token expires at:', expiresAt.toISOString());
      console.log('[Dashboard] Token is expired:', isTokenExpired);
    }

    // If we have a valid localStorage token, use it (prioritize localStorage)
    if (savedToken && !isTokenExpired) {
      console.log('[Dashboard] ✅ Using valid localStorage token');
      setFacebookAccessToken(savedToken);
      setIsConnectedToFacebook(true);

      if (savedUser) {
        try {
          setFacebookUser(JSON.parse(savedUser));
        } catch (err) {
          console.error('[Dashboard] Error parsing saved user:', err);
        }
      }

      if (savedPixels) {
        try {
          setFacebookPixels(JSON.parse(savedPixels));
        } catch (err) {
          console.error('[Dashboard] Error parsing saved pixels:', err);
        }
      } else {
        // Auto-fetch pixels if we have token but no cached pixels
        console.log('[Dashboard] No saved pixels, fetching from API...');
        fetcher.submit(
          {
            intent: "fetch-facebook-pixels",
            accessToken: savedToken,
          },
          { method: "POST" }
        );
      }
    } else if (hasValidFacebookToken) {
      // Server indicates we have a valid token but localStorage is empty
      // This can happen after browser refresh or different device
      console.log('[Dashboard] Server has valid token but localStorage is empty - showing connected state');
      setIsConnectedToFacebook(true);
    } else {
      console.log('[Dashboard] ✅ SYNC: Both localStorage and server have no tokens (clean state)');
    }
  }, [mounted, hasValidFacebookToken]);

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

  const handleConnectToFacebook = useCallback(() => {
    const scope = "ads_read,business_management,ads_management,pages_show_list,pages_read_engagement,catalog_management";

    // Check if Facebook SDK is loaded
    if ((window as any).FB) {
      console.log('[Dashboard] Using Facebook SDK for login...');

      (window as any).FB.login(function (response: any) {
        console.log('[Dashboard] FB.login response:', response.status);
        console.log('[Dashboard] FB.login full response:', response);

        if (response.status === 'connected') {
          console.log('[Dashboard] Facebook user CONNECTED via SDK!');
          const accessToken = response.authResponse.accessToken;
          const expiresIn = response.authResponse.expiresIn;
          const expiresAt = new Date(Date.now() + expiresIn * 1000).toISOString();

          console.log('[Dashboard] Access token received:', !!accessToken);
          console.log('[Dashboard] Access token length:', accessToken?.length || 0);
          console.log('[Dashboard] Token expires in:', expiresIn, 'seconds');

          // Save to localStorage immediately
          localStorage.setItem("facebook_access_token", accessToken);
          localStorage.setItem("facebook_token_expires_at", expiresAt);
          console.log('[Dashboard] Session saved to localStorage');

          // Get and save user info to localStorage
          (window as any).FB.api('/me', { fields: 'id,name,picture' }, function(userResponse: any) {
            if (userResponse && !userResponse.error) {
              console.log('[Dashboard] User info received:', userResponse);
              setFacebookUser(userResponse);
              localStorage.setItem("facebook_user", JSON.stringify(userResponse));
              console.log('[Dashboard] User info saved to localStorage');
            }
          });

          // Update client state
          setFacebookAccessToken(accessToken);
          setIsConnectedToFacebook(true);

          // Save token to database so other pages (Catalog) can use it
          console.log('[Dashboard] Submitting save-facebook-token request...');
          fetcher.submit(
            { intent: "save-facebook-token", accessToken },
            { method: "POST" }
          );

          // Also auto-fetch pixels after successful authentication
          console.log('[Dashboard] Auto-fetching Facebook pixels after authentication...');
          setTimeout(() => {
            fetcher.submit(
              {
                intent: "fetch-facebook-pixels",
                accessToken: accessToken,
              },
              { method: "POST" }
            );
          }, 2000); // Wait 2 seconds for token save to complete

          setShowRenameModal(null);
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

          const accessToken = event.data.accessToken;
          const expiresAt = event.data.expiresAt || new Date(Date.now() + 60 * 24 * 60 * 60 * 1000).toISOString(); // Default 60 days

          // Save session to localStorage
          localStorage.setItem("facebook_access_token", accessToken);
          localStorage.setItem("facebook_token_expires_at", expiresAt);
          console.log('[Dashboard] Session saved to localStorage');

          // Update client state
          setFacebookAccessToken(accessToken);

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

          // Show warning if any
          if (event.data.warning) {
            setFacebookError(event.data.warning);
          }

          setShowRenameModal(null);
          window.removeEventListener('message', handleMessage);

          // If no pixels were fetched automatically, try to fetch them
          if (!event.data.pixels || event.data.pixels.length === 0) {
            fetcher.submit(
              {
                intent: "fetch-facebook-pixels",
                accessToken: accessToken,
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
  }, [fetcher]);

  const handleSelectFacebookPixel = useCallback(() => {
    const selectedPixel = facebookPixels.find(p => p.id === selectedFacebookPixel);
    if (!selectedPixel) return;

    setPixelForm(prev => ({
      ...prev,
      pixelName: selectedPixel.name,
      pixelId: selectedPixel.id,
      trackingPages: "all",
    }));
  }, [facebookPixels, selectedFacebookPixel]);

  const handleCreatePixel = useCallback(() => {
    if (!pixelForm.pixelId) {
      return;
    }

    if (inputMethod === "auto" && (!pixelForm.pixelId || !selectedFacebookPixel)) {
      return;
    }

    if (inputMethod === "manual" && (!pixelForm.pixelName || !pixelForm.pixelId || !facebookAccessToken)) {
      return;
    }

    fetcher.submit(
      {
        intent: "create-pixel",
        pixelName: pixelForm.pixelName || "My Pixel",
        pixelId: pixelForm.pixelId,
        metaAccessToken: facebookAccessToken || "",
        trackingPages: pixelForm.trackingPages,
        selectedCollections: JSON.stringify(pixelForm.selectedCollections),
        selectedProductTypes: JSON.stringify(pixelForm.selectedProductTypes),
        selectedProductTags: JSON.stringify(pixelForm.selectedProductTags),
        selectedProducts: JSON.stringify(pixelForm.selectedProducts),
      },
      { method: "POST" }
    );

    // Don't change step - let the fetcher response handle navigation
  }, [fetcher, pixelForm, inputMethod, selectedFacebookPixel, facebookAccessToken]);

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

    // Validate page selection if not in "all" mode
    if (enhancedCreateForm.trackingPages !== "all" && enhancedCreateForm.selectedPageTypes.length === 0) {
      return;
    }

    fetcher.submit(
      {
        intent: "create",
        name: enhancedCreateForm.appName,
        metaAppId: pixelId,
        metaAccessToken: accessToken || "",
        trackingPages: enhancedCreateForm.trackingPages,
        selectedPageTypes: JSON.stringify(enhancedCreateForm.selectedPageTypes),
      },
      { method: "POST" }
    );

    // Don't close modal - wait for step 2 (timezone selection)
    // Modal will move to step 2 when fetcher.data.step === 2
  }, [fetcher, enhancedCreateForm, selectedFacebookPixel, facebookAccessToken]);

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

  const handleAssignWebsite = useCallback(() => {
    if (!showWebsiteModal || !websiteDomain) return;

    fetcher.submit(
      {
        intent: "assign-website",
        appId: showWebsiteModal.id,
        websiteDomain: websiteDomain,
      },
      { method: "POST" }
    );
    setShowWebsiteModal(null);
    setWebsiteDomain("");
  }, [fetcher, showWebsiteModal, websiteDomain]);

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

  const handleRefreshFacebookData = useCallback(() => {
    // setIsRefreshingToken(true); // DISABLED to prevent loading button issues
    fetcher.submit(
      { intent: "refresh-facebook-token" },
      { method: "POST" }
    );
  }, [fetcher]);

  const handleDisconnectFacebook = useCallback(() => {
    console.log('[Dashboard] Disconnecting Facebook - clearing all local state first...');
    
    // Clear localStorage immediately
    if (typeof window !== "undefined") {
      localStorage.removeItem("facebook_access_token");
      localStorage.removeItem("facebook_user");
      localStorage.removeItem("facebook_pixels");
      console.log('[Dashboard] Cleared all Facebook data from localStorage');
    }
    
    // Clear React state immediately
    setFacebookAccessToken("");
    setIsConnectedToFacebook(false);
    setFacebookUser(null);
    setFacebookPixels([]);
    setSelectedFacebookPixel("");
    console.log('[Dashboard] Cleared all Facebook state from React');
    
    // Now call the API to clear database
    fetcher.submit(
      { intent: "disconnect-facebook" },
      { method: "POST" }
    );
  }, [fetcher]);

  const validatePixelWithSDK = useCallback(async (pixelId: string, accessToken: string) => {
    if (!pixelId || !accessToken) {
      setPixelValidationResult({ valid: false, error: "Pixel ID and access token are required" });
      return;
    }

    // setIsValidatingPixel(true); // DISABLED to prevent loading button issues
    setPixelValidationResult(null);

    try {
      // Call Facebook Graph API to validate pixel
      const response = await fetch(
        `https://graph.facebook.com/v18.0/${pixelId}?fields=name&access_token=${accessToken}`
      );

      if (response.ok) {
        const data = await response.json();
        setPixelValidationResult({
          valid: true,
          pixelName: data.name || `Pixel ${pixelId}`
        });
      } else {
        const errorData = await response.json().catch(() => ({}));
        setPixelValidationResult({
          valid: false,
          error: errorData.error?.message || "Invalid pixel ID or access token"
        });
      }
    } catch (error) {
      setPixelValidationResult({
        valid: false,
        error: "Failed to validate pixel. Please check your connection and try again."
      });
    } finally {
      // setIsValidatingPixel(false); // DISABLED to prevent loading button issues
    }
  }, []);

  // Auto-validate pixel when selected via Facebook SDK
  useEffect(() => {
    if (selectedFacebookPixel && 
        selectedFacebookPixel !== "manual" && 
        facebookAccessToken && 
        mounted && 
        isConnectedToFacebook) {
      
      // Only validate if we haven't already validated this pixel
      if (!pixelValidationResult || pixelValidationResult.pixelName?.includes(selectedFacebookPixel)) {
        validatePixelWithSDK(selectedFacebookPixel, facebookAccessToken);
      }
    }
  }, [selectedFacebookPixel, facebookAccessToken, mounted, isConnectedToFacebook, validatePixelWithSDK]);

  useEffect(() => {
    if (isRefreshingToken) {
      fetcher.submit(
        { intent: "refresh-facebook-token" },
        { method: "POST" }
      );
    }
  }, [isRefreshingToken, fetcher]);

  useEffect(() => {
    if (isRefreshingToken && fetcher.state === "idle") {
      // setIsRefreshingToken(false); // DISABLED to prevent loading button issues
    }
  }, [isRefreshingToken, fetcher.state]);

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

  // Show empty loading UI while data is being fetched
  if (isLoadingData) {
    return (
      <Page title="Dashboard" fullWidth>
        <Layout>
          <Layout.Section>
            <Card>
              <div style={{ padding: '60px', textAlign: 'center' }}>
                <div style={{ marginBottom: '16px' }}>
                  <div style={{
                    width: '48px',
                    height: '48px',
                    margin: '0 auto',
                    border: '4px solid #e1e3e5',
                    borderTopColor: '#008060',
                    borderRadius: '50%',
                    animation: 'spin 1s linear infinite'
                  }} />
                  <style>{`
                    @keyframes spin {
                      to { transform: rotate(360deg); }
                    }
                  `}</style>
                </div>
                <Text as="p" variant="bodyLg" tone="subdued">
                  Loading dashboard...
                </Text>
              </div>
            </Card>
          </Layout.Section>
        </Layout>
      </Page>
    );
  }

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
          ...(mounted && !isConnectedToFacebook && !hasValidFacebookToken ? [{
            content: "Connect Facebook",
            icon: ConnectIcon,
            onAction: handleConnectToFacebook,
          }] : [])
        ]}
        fullWidth
      >
        <Layout>
          {/* Success/Error Banner */}
          {successMessage && (
            <Layout.Section>
              <Banner tone="success" onDismiss={() => setSuccessMessage(null)}>
                <p>{successMessage}</p>
              </Banner>
            </Layout.Section>
          )}
          {errorMessage && (
            <Layout.Section>
              <Banner tone="critical" onDismiss={() => setErrorMessage(null)}>
                <p>{errorMessage}</p>
              </Banner>
            </Layout.Section>
          )}

          {/* Facebook Connection Status Card */}
          <ClientOnly>
            {mounted && isConnectedToFacebook ? (
              <Layout.Section>
                <Card>
                  <InlineStack align="space-between" blockAlign="center">
                    <InlineStack gap="300" blockAlign="center">
                      {facebookUser?.picture ? (
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
                          {facebookUser?.name?.charAt(0)?.toUpperCase() || "F"}
                        </div>
                      )}
                      <BlockStack gap="100">
                        <InlineStack gap="200" blockAlign="center">
                          <Text variant="headingMd" as="h3">Facebook Connected</Text>
                          <Badge tone="success">Active</Badge>
                        </InlineStack>
                        <Text variant="bodySm" tone="subdued" as="p">
                          Logged in as {facebookUser?.name || "Facebook User"} • {facebookPixels.length} pixel(s) available
                          {facebookPixels.length === 0 && (
                            <span style={{ color: '#d72c0d', fontWeight: 'bold' }}>
                              {" "}• No pixels found - check Business Manager access or create pixels in Facebook Events Manager
                            </span>
                          )}
                        </Text>
                      </BlockStack>
                    </InlineStack>
                    <InlineStack gap="200">
                      <Button 
                        onClick={() => {
                          console.log('[Dashboard] Manual pixel fetch triggered');
                          console.log('[Dashboard] Current access token:', !!facebookAccessToken);
                          if (facebookAccessToken) {
                            fetcher.submit(
                              {
                                intent: "fetch-facebook-pixels",
                                accessToken: facebookAccessToken,
                              },
                              { method: "POST" }
                            );
                          } else {
                            console.error('[Dashboard] No access token available for manual fetch');
                            setFacebookError('No access token available. Please reconnect to Facebook.');
                          }
                        }}
                        loading={fetcher.state === "submitting" && fetcher.formData?.get("intent") === "fetch-facebook-pixels"}
                      >
                        Fetch Pixels
                      </Button>
                      <Button 
                        variant="secondary"
                        onClick={() => {
                          console.log('[Dashboard] Testing Facebook API access...');
                          if (facebookAccessToken) {
                            fetcher.submit(
                              {
                                intent: "test-facebook-api",
                                accessToken: facebookAccessToken,
                              },
                              { method: "POST" }
                            );
                          } else {
                            console.error('[Dashboard] No access token available for API test');
                            setFacebookError('No access token available. Please reconnect to Facebook.');
                          }
                        }}
                        loading={fetcher.state === "submitting" && fetcher.formData?.get("intent") === "test-facebook-api"}
                      >
                        Test API
                      </Button>
                      <Button 
                        variant="secondary"
                        onClick={async () => {
                          console.log('[Dashboard] Manual sync triggered...');
                          console.log('[Dashboard] Current state:');
                          console.log('- isConnectedToFacebook:', isConnectedToFacebook);
                          console.log('- hasValidFacebookToken:', hasValidFacebookToken);
                          console.log('- facebookAccessToken:', !!facebookAccessToken);
                          
                          // Force refresh dashboard data
                          try {
                            // setIsLoadingData(true); // DISABLED to prevent loading button issues
                            const response = await fetch('/api/dashboard?refresh=true&t=' + Date.now());
                            const data = await response.json();
                            console.log('[Dashboard] Fresh data:', data);
                            setDashboardData(data);
                          } catch (error) {
                            console.error('[Dashboard] Sync failed:', error);
                          } finally {
                            // setIsLoadingData(false); // DISABLED to prevent loading button issues
                          }
                        }}
                        loading={false}
                      >
                        Sync State
                      </Button>
                      <Button onClick={handleRefreshFacebookData} loading={false}>
                        Refresh
                      </Button>
                      <Button variant="plain" tone="critical" onClick={handleDisconnectFacebook}>
                        Disconnect
                      </Button>
                    </InlineStack>
                  </InlineStack>
                </Card>
              </Layout.Section>
            ) : null}
          </ClientOnly>

          {/* No Pixels Warning Banner - Show when Facebook is connected but no pixels found */}
          <ClientOnly>
            {mounted && isConnectedToFacebook && facebookPixels.length === 0 && (
              <Layout.Section fullWidth>
                <Banner tone="warning">
                  <BlockStack gap="200">
                    <Text as="p" variant="bodyMd" fontWeight="semibold">
                      ⚠️ Facebook Connected but No Pixels Found
                    </Text>
                    <Text as="p" variant="bodySm">
                      You're successfully connected to Facebook, but we couldn't find any pixels in your account. This could mean:
                    </Text>
                    <ul style={{ marginLeft: '20px', marginTop: '8px' }}>
                      <li>You don't have admin access to a Facebook Business Manager</li>
                      <li>No pixels have been created in Facebook Events Manager</li>
                      <li>Your Facebook account doesn't have the necessary permissions</li>
                    </ul>
                    <InlineStack gap="200">
                      <Button 
                        onClick={() => {
                          if (facebookAccessToken) {
                            fetcher.submit(
                              {
                                intent: "fetch-facebook-pixels",
                                accessToken: facebookAccessToken,
                              },
                              { method: "POST" }
                            );
                          }
                        }}
                        loading={fetcher.state === "submitting" && fetcher.formData?.get("intent") === "fetch-facebook-pixels"}
                      >
                        Retry Fetch Pixels
                      </Button>
                      <Button 
                        variant="secondary"
                        onClick={() => window.open('https://business.facebook.com/events_manager2/list/pixel', '_blank')}
                      >
                        Create Pixel in Facebook
                      </Button>
                      <Button 
                        variant="plain"
                        onClick={() => {
                          const debugInfo = {
                            isConnectedToFacebook,
                            hasValidFacebookToken,
                            facebookAccessToken: !!facebookAccessToken,
                            facebookUser: facebookUser?.name || 'None',
                            facebookPixelsCount: facebookPixels.length,
                            facebookPixels: facebookPixels,
                            localStorage: {
                              hasToken: !!localStorage.getItem("facebook_access_token"),
                              hasUser: !!localStorage.getItem("facebook_user"),
                              hasPixels: !!localStorage.getItem("facebook_pixels"),
                            }
                          };
                          console.log('[Dashboard] 🔍 Facebook Debug Info:', debugInfo);
                          alert(`Facebook Debug Info (check console for full details):

Connected: ${isConnectedToFacebook}
Server Token Valid: ${hasValidFacebookToken}
Client Token: ${!!facebookAccessToken}
User: ${facebookUser?.name || 'None'}
Pixels Found: ${facebookPixels.length}

LocalStorage:
- Token: ${!!localStorage.getItem("facebook_access_token")}
- User: ${!!localStorage.getItem("facebook_user")}
- Pixels: ${!!localStorage.getItem("facebook_pixels")}

Check browser console for full debug info.`);
                        }}
                      >
                        Debug Info
                      </Button>
                    </InlineStack>
                  </BlockStack>
                </Banner>
              </Layout.Section>
            )}
          </ClientOnly>

          {/* Theme Extension Status Card */}
          <Layout.Section>
            <Card>
              <InlineStack align="space-between" blockAlign="center">
                <InlineStack gap="300" blockAlign="center">
                  <div style={{
                    width: "48px",
                    height: "48px",
                    borderRadius: "8px",
                    backgroundColor: themeExtensionEnabled ? "#008060" : "#e4e5e7",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    color: "white",
                    fontWeight: "bold",
                    fontSize: "20px"
                  }}>
                    {themeExtensionEnabled ? "✓" : "!"}
                  </div>
                  <BlockStack gap="100">
                    <InlineStack gap="200" blockAlign="center">
                      <Text variant="headingMd" as="h3">Theme Extension</Text>
                      <Badge tone={themeExtensionEnabled ? "success" : "critical"}>
                        {themeExtensionEnabled ? "Enabled" : "Not Enabled"}
                      </Badge>
                    </InlineStack>
                    <Text variant="bodySm" tone="subdued" as="p">
                      {themeExtensionEnabled
                        ? "App embed is active and tracking events"
                        : "Enable the app embed in your theme editor to start tracking"}
                    </Text>
                  </BlockStack>
                </InlineStack>
                <InlineStack gap="200">
                  <Button
                    variant="secondary"
                    onClick={() => {
                      const data = themeExtensionFetcher.data;
                      if (data) {
                        const debugInfo = (data as any).debug;
                        alert(`Theme Extension Status Debug:
                        
Enabled: ${data.isEnabled || data.enabled}
Reason: ${data.reason || 'N/A'}
Extension Type: ${data.extensionType || 'Not found'}
Theme ID: ${data.themeId || 'Unknown'}
App Installed: ${data.appInstalled}

${debugInfo ? `
Debug Info:
- Total Embeds: ${debugInfo.totalEmbeds}
- Found Extension: ${debugInfo.foundExtension}
- Extension Disabled Flag: ${debugInfo.extensionDisabledFlag}
- Calculated Enabled: ${debugInfo.calculatedEnabled}
- Available Types: ${debugInfo.availableTypes?.join(', ') || 'None'}
- Searching For: ${debugInfo.searchingFor || 'N/A'}
` : 'No debug info available'}

Deep Link: ${data.deepLinkUrl || 'N/A'}`);
                      } else {
                        alert('Theme extension status not loaded yet. Please wait...');
                      }
                    }}
                  >
                    Debug Status
                  </Button>
                  <Button
                    variant="secondary"
                    onClick={() => {
                      // Refresh the theme extension status
                      setThemeExtensionChecked(false);
                      themeExtensionFetcher.submit(
                        { intent: "check-theme-extension" },
                        { method: "POST", action: "/api/theme-extension-status" }
                      );
                    }}
                    loading={themeExtensionFetcher.state === "submitting" || themeExtensionFetcher.state === "loading"}
                  >
                    Refresh Status
                  </Button>
                  {!themeExtensionEnabled && (
                    <Button
                      variant="primary"
                      onClick={() => {
                        const data = themeExtensionFetcher.data;
                        const deepLinkUrl = data?.deepLinkUrl;
                        
                        if (deepLinkUrl) {
                          window.open(deepLinkUrl, '_blank');
                        } else {
                          const storeHandle = shop.replace('.myshopify.com', '');
                          const themeEditorUrl = `https://admin.shopify.com/store/${storeHandle}/themes/current/editor?context=apps`;
                          window.open(themeEditorUrl, '_blank');
                        }
                      }}
                    >
                      Activate Now
                    </Button>
                  )}
                </InlineStack>
              </InlineStack>
            </Card>
          </Layout.Section>

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
                    <Text variant="bodySm" as="p" tone="subdued">Assigned Domains</Text>
                    <Text variant="headingXl" as="p">{apps.filter((app: any) => app.websiteDomain).length}</Text>
                    <Text variant="bodySm" as="p" tone="subdued">Domain-specific pixels</Text>
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
                      const headers = ['Pixel Name', 'Pixel ID', 'Website Domain', 'Status', 'Events', 'Sessions', 'Meta Connected', 'Timezone', 'Created Date'];
                      const csvContent = [
                        headers.join(','),
                        ...apps.map((app: any) => {
                          const { name, settings, _count, enabled, websiteDomain, createdAt } = app;
                          return [
                            `"${name}"`,
                            `"${settings?.metaPixelId || 'N/A'}"`,
                            `"${websiteDomain || 'Unassigned'}"`,
                            `"${enabled ? 'Enabled' : 'Disabled'}"`,
                            `"${_count.events.toLocaleString()}"`,
                            `"${_count.analyticsSessions.toLocaleString()}"`,
                            `"${settings?.metaPixelEnabled ? 'Yes' : 'No'}"`,
                            `"${settings?.timezone || 'GMT+0'}"`,
                            `"${new Date(createdAt).toLocaleDateString()}"`
                          ].join(',');
                        })
                      ].join('\n');

                      // Create and download CSV file
                      const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
                      const link = document.createElement('a');
                      const url = URL.createObjectURL(blob);
                      link.setAttribute('href', url);
                      link.setAttribute('download', `pixels-website-report-${new Date().toISOString().split('T')[0]}.csv`);
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

              {/* Website Assignment Info Banner */}
              <Banner tone="warning">
                <BlockStack gap="200">
                  <Text as="p" variant="bodyMd" fontWeight="semibold">
                    ⚠️ Strict Domain Matching - Pixels Only Fire on Assigned Domains
                  </Text>
                  <Text as="p" variant="bodySm">
                    Each pixel must be assigned to a specific website domain. Pixels will ONLY track events from their assigned domain.
                    If a domain is not assigned to any pixel, tracking will be disabled for that domain.
                  </Text>
                  <Text as="p" variant="bodySm">
                    <strong>How to use:</strong> Click "Assign" to assign a pixel to your website domain (e.g., mystore.myshopify.com).
                  </Text>
                </BlockStack>
              </Banner>

              <Card>
                <div style={{ width: '100%', overflowX: 'auto' }}>
                  <DataTable
                    columnContentTypes={[
                      'text',
                      'text',
                      'text',
                      'text',
                      'numeric',
                      'numeric',
                      'text',
                      'text',
                      'text'
                    ]}
                    headings={[
                      'Pixel Name',
                      'Pixel ID',
                      'Website Domain',
                      'Status',
                      'Events',
                      'Sessions',
                      'Meta Status',
                      'Timezone',
                      'Actions'
                    ]}
                    rows={apps.map((app: any) => {
                      const { id, appId, name, _count, settings, enabled, websiteDomain } = app;
                      return [
                        <Text variant="bodyMd" fontWeight="semibold" as="span">{name}</Text>,
                        <Text variant="bodySm" as="span" tone="subdued">{settings?.metaPixelId || appId}</Text>,
                        websiteDomain ? (
                          <InlineStack gap="100" blockAlign="center">
                            <Badge>{`🌐 ${websiteDomain}`}</Badge>
                          </InlineStack>
                        ) : (
                          <Badge tone="attention">Unassigned</Badge>
                        ),
                        <Badge tone={enabled ? "success" : "critical"}>
                          {enabled ? "Enabled" : "Disabled"}
                        </Badge>,
                        <Text variant="bodySm" as="span">{_count.events.toLocaleString()}</Text>,
                        <Text variant="bodySm" as="span">{_count.analyticsSessions.toLocaleString()}</Text>,
                        settings?.metaPixelEnabled ? (
                          <Badge tone="success">Connected</Badge>
                        ) : (
                          <Badge tone="critical">Not Connected</Badge>
                        ),
                        <Text variant="bodySm" as="span" tone="subdued">
                          {settings?.timezone || 'GMT+0'}
                        </Text>,
                        <InlineStack gap="100">
                          <Button
                            size="micro"
                            variant={enabled ? "primary" : "secondary"}
                            tone={enabled ? "critical" : "success"}
                            onClick={() => handleTogglePixel(id, enabled)}
                            loading={false}
                          >
                            {enabled ? "Disable" : "Enable"}
                          </Button>
                          <Button
                            size="micro"
                            onClick={() => {
                              setShowWebsiteModal(app);
                              setWebsiteDomain(websiteDomain || "");
                            }}
                          >
                            {websiteDomain ? "Change" : "Assign"}
                          </Button>
                          <Button
                            size="micro"
                            onClick={() => setShowSnippet(appId)}
                          >
                            Code
                          </Button>
                          <Button
                            size="micro"
                            onClick={() => {
                              setShowRenameModal(app);
                              setRenameValue(app.name);
                            }}
                          >
                            Rename
                          </Button>
                          <Button
                            size="micro"
                            tone="critical"
                            onClick={() => setShowDeleteModal(app)}
                          >
                            Delete
                          </Button>
                        </InlineStack>
                      ];
                    })}
                  />
                </div>
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
                            ...filteredPurchaseEvents.map((event: any) => [
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
            // Force close modal and reset all state
            setShowEnhancedCreateModal(false);
            setEnhancedCreateStep(1);
            setEnhancedCreateForm({ appName: "", pixelId: "", accessToken: "", trackingPages: "all", selectedPageTypes: [] });
            setSelectedFacebookPixel("");
            setPixelValidationResult(null);
            setCreatedAppId(null);
            setSelectedTimezone("GMT+0");
          }}
          title={enhancedCreateStep === 1 ? "Create New Pixel" : "Choose Timezone"}
          primaryAction={{
            content: enhancedCreateStep === 1
              ? "Continue"
              : "Save & Complete",
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
            loading: false,
            disabled: enhancedCreateStep === 1
              ? (!enhancedCreateForm.appName ||
                (!enhancedCreateForm.pixelId && !selectedFacebookPixel) ||
                apps.some((app: any) => app.settings?.metaPixelId === (enhancedCreateForm.pixelId || selectedFacebookPixel)) ||
                (selectedFacebookPixel && selectedFacebookPixel !== "manual" && !pixelValidationResult?.valid) ||
                (enhancedCreateForm.trackingPages !== "all" && enhancedCreateForm.selectedPageTypes.length === 0) ||
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
                  setEnhancedCreateForm({ appName: "", pixelId: "", accessToken: "", trackingPages: "all", selectedPageTypes: [] });
                  setSelectedFacebookPixel("");
                  setPixelValidationResult(null);
                  setCreatedAppId(null);
                  setSelectedTimezone("GMT+0");
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
                  <ClientOnly>
                    {mounted && isConnectedToFacebook ? (
                      <Card background="bg-surface-success">
                        <InlineStack align="space-between" blockAlign="center">
                          <InlineStack gap="200" blockAlign="center">
                            {facebookUser?.picture ? (
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
                                {facebookUser?.name?.charAt(0)?.toUpperCase() || "F"}
                              </div>
                            )}
                            <BlockStack gap="050">
                              <Text variant="bodyMd" fontWeight="medium" as="span">
                                Connected to Facebook
                              </Text>
                              <Text variant="bodySm" tone="subdued" as="span">
                                {facebookUser?.name || "Facebook User"} • {facebookPixels.length} pixel(s) available
                              </Text>
                            </BlockStack>
                          </InlineStack>
                          <InlineStack gap="200">
                            <Button
                              size="slim"
                              onClick={handleRefreshFacebookData}
                              loading={false}
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
                            Connect to Facebook
                          </Button>
                        </InlineStack>
                      </Card>
                    )}
                  </ClientOnly>

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
                  <ClientOnly>
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
                  </ClientOnly>

                  {/* Manual Pixel ID Input */}
                  <ClientOnly>
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
                  </ClientOnly>

                  {/* Access Token - Only for manual entry */}
                  <ClientOnly>
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
                              loading={false}
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
                  </ClientOnly>

                  {/* Pixel Validation Status - Auto validation for SDK-selected pixels */}
                  <ClientOnly>
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
                  </ClientOnly>

                  {/* Step 1 Continued: Page Tracking Configuration */}
                  {enhancedCreateStep === 1 && (
                    <>
                      <Divider />

                      <div>
                        <Text as="p" variant="headingMd" fontWeight="semibold">
                          📄 Page Tracking Configuration
                        </Text>
                        <Text as="p" variant="bodySm" tone="subdued">
                          Choose which pages this pixel should track events on
                        </Text>
                      </div>

                      {/* Tracking Pages Radio Group */}
                      <Card>
                        <BlockStack gap="300">
                          <div>
                            <Text as="p" variant="bodyMd" fontWeight="medium">
                              Tracking Mode <Text as="span" tone="critical">*</Text>
                            </Text>
                          </div>

                          <div style={{ paddingLeft: "16px" }}>
                            <BlockStack gap="200">
                              <label style={{ display: "flex", gap: "12px", alignItems: "center", cursor: "pointer" }}>
                                <RadioButton
                                  label=""
                                  checked={enhancedCreateForm.trackingPages === "all"}
                                  onChange={() => setEnhancedCreateForm(prev => ({
                                    ...prev,
                                    trackingPages: "all",
                                    selectedPageTypes: []
                                  }))}
                                />
                                <BlockStack gap="100">
                                  <Text variant="bodyMd" as="span">All Pages</Text>
                                  <Text variant="bodySm" tone="subdued" as="span">
                                    Track events on every page of your store
                                  </Text>
                                </BlockStack>
                              </label>

                              <label style={{ display: "flex", gap: "12px", alignItems: "center", cursor: "pointer" }}>
                                <RadioButton
                                  label=""
                                  checked={enhancedCreateForm.trackingPages === "selected"}
                                  onChange={() => setEnhancedCreateForm(prev => ({
                                    ...prev,
                                    trackingPages: "selected"
                                  }))}
                                />
                                <BlockStack gap="100">
                                  <Text variant="bodyMd" as="span">Selected Pages</Text>
                                  <Text variant="bodySm" tone="subdued" as="span">
                                    Track events only on specific page types
                                  </Text>
                                </BlockStack>
                              </label>

                              <label style={{ display: "flex", gap: "12px", alignItems: "center", cursor: "pointer" }}>
                                <RadioButton
                                  label=""
                                  checked={enhancedCreateForm.trackingPages === "excluded"}
                                  onChange={() => setEnhancedCreateForm(prev => ({
                                    ...prev,
                                    trackingPages: "excluded"
                                  }))}
                                />
                                <BlockStack gap="100">
                                  <Text variant="bodyMd" as="span">Excluded Pages</Text>
                                  <Text variant="bodySm" tone="subdued" as="span">
                                    Track events everywhere except selected pages
                                  </Text>
                                </BlockStack>
                              </label>
                            </BlockStack>
                          </div>
                        </BlockStack>
                      </Card>

                      {/* Page Type Selection - Show when selected or excluded mode */}
                      {enhancedCreateForm.trackingPages !== "all" && (
                        <Card>
                          <BlockStack gap="300">
                            <div>
                              <Text as="p" variant="bodyMd" fontWeight="medium">
                                {enhancedCreateForm.trackingPages === "selected" ? "Select Pages to Track" : "Select Pages to Exclude"} <Text as="span" tone="critical">*</Text>
                              </Text>
                              <Text as="p" variant="bodySm" tone="subdued">
                                {enhancedCreateForm.trackingPages === "selected"
                                  ? "Click below to choose specific pages where you want to track pixel events"
                                  : "Click below to choose specific pages you want to exclude from tracking"}
                              </Text>
                            </div>

                            <Button
                              onClick={async () => {
                                console.log('[Dashboard] ===== BUTTON CLICKED =====');
                                console.log('[Dashboard] Current showPageSelector:', showPageSelector);
                                console.log('[Dashboard] storePages:', storePages);
                                console.log('[Dashboard] storePages.length:', storePages.length);
                                
                                // Load pages on demand before opening selector
                                await loadStorePagesOnDemand();
                                
                                console.log('[Dashboard] pageTypeOptions:', pageTypeOptions);
                                console.log('[Dashboard] pageTypeOptions.length:', pageTypeOptions.length);
                                console.log('[Dashboard] isLoadingPages:', isLoadingPages);
                                console.log('[Dashboard] mounted:', mounted);
                                const filteredPages = pageTypeOptions.filter((p: any) => p.value !== "all");
                                console.log('[Dashboard] Filtered pages (without "all"):', filteredPages);
                                console.log('[Dashboard] Filtered pages count:', filteredPages.length);
                                console.log('[Dashboard] Setting showPageSelector to TRUE');
                                setShowPageSelector(true);
                                console.log('[Dashboard] After setState, showPageSelector should be true');
                              }}
                              disabled={false}
                              loading={false}
                            >
                              {`Choose Pages (${storePages.length} available)`}
                            </Button>

                            {enhancedCreateForm.selectedPageTypes.length > 0 && (
                              <Text as="p" tone="subdued">
                                {enhancedCreateForm.selectedPageTypes.length} page(s) {enhancedCreateForm.trackingPages === "selected" ? "selected" : "excluded"}
                              </Text>
                            )}

                            {enhancedCreateForm.selectedPageTypes.length === 0 && enhancedCreateForm.trackingPages !== "all" && (
                              <Banner tone="warning">
                                <p>Please select at least one page type</p>
                              </Banner>
                            )}
                          </BlockStack>
                        </Card>
                      )}

                      <Divider />
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
              loading: false,
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
              loading: false,
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

        {/* Website Assignment Modal */}
        {showWebsiteModal && (
          <Modal
            open={true}
            onClose={() => {
              setShowWebsiteModal(null);
              setWebsiteDomain("");
            }}
            title="Assign Website Domain"
            primaryAction={{
              content: "Assign Website",
              onAction: handleAssignWebsite,
              loading: false,
              disabled: !websiteDomain,
            }}
            secondaryActions={[
              { content: "Cancel", onAction: () => setShowWebsiteModal(null) }
            ]}
          >
            <Modal.Section>
              <BlockStack gap="400">
                <Text as="p">
                  Assign this pixel to a specific website domain. Only events from this domain will be tracked by this pixel.
                </Text>
                <TextField
                  label="Website Domain"
                  value={websiteDomain}
                  onChange={setWebsiteDomain}
                  placeholder="e.g., mystore.myshopify.com"
                  helpText="Enter domain only. https://, www., and trailing / are automatically removed."
                  autoComplete="off"
                />
                <Banner tone="warning">
                  <BlockStack gap="200">
                    <Text as="p" variant="bodyMd" fontWeight="semibold">
                      ⚠️ Important: Strict Domain Matching
                    </Text>
                    <Text as="p" variant="bodySm">
                      Pixels will ONLY fire on websites with matching domain assignments.
                      If no pixel is assigned to a domain, tracking will be disabled for that domain.
                    </Text>
                    <Text as="p" variant="bodySm">
                      <strong>Accepted formats:</strong> mystore.myshopify.com, https://mystore.com/, www.mystore.com - all will be normalized to: mystore.myshopify.com or mystore.com
                    </Text>
                  </BlockStack>
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
              {successMessage && (
                <Banner tone="success" onDismiss={() => setSuccessMessage(null)}>
                  <p>{successMessage}</p>
                </Banner>
              )}
              {errorMessage && (
                <Banner tone="critical" onDismiss={() => setErrorMessage(null)}>
                  <p>{errorMessage}</p>
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
                        setPixelForm({
                          pixelName: "",
                          pixelId: "",
                          trackingPages: "all",
                          selectedCollections: [],
                          selectedProductTypes: [],
                          selectedProductTags: [],
                          selectedProducts: [],
                        });
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
                      suppressHydrationWarning={true}
                    >
                      Auto Input Pixel
                    </button>
                    <button
                      onClick={() => {
                        setInputMethod("manual");
                        setPixelForm({
                          pixelName: "",
                          pixelId: "",
                          trackingPages: "all",
                          selectedCollections: [],
                          selectedProductTypes: [],
                          selectedProductTags: [],
                          selectedProducts: [],
                        });
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
                      suppressHydrationWarning={true}
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

                    <ClientOnly>
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
                    </ClientOnly>
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

                      {/* Collection/Product/Tag Selectors */}
                      {(pixelForm.trackingPages === "selected" || pixelForm.trackingPages === "excluded") && (
                        <div style={{ marginTop: "16px" }}>
                          <BlockStack gap="300">
                            {/* Collection Selector */}
                            <div style={{
                              padding: "12px",
                              backgroundColor: "#f6f6f7",
                              borderRadius: "8px"
                            }}>
                              <BlockStack gap="200">
                                <Button
                                  onClick={() => {/* TODO: Open collection selector modal */ }}
                                  variant="plain"
                                  textAlign="left"
                                >
                                  + Select collection(s)
                                </Button>
                                {pixelForm.selectedCollections.length > 0 && (
                                  <Text as="p" variant="bodySm" tone="subdued">
                                    {pixelForm.selectedCollections.length} collection(s) {pixelForm.trackingPages === "selected" ? "selected" : "excluded"}
                                  </Text>
                                )}
                              </BlockStack>
                            </div>

                            {/* Product Type Selector */}
                            <div style={{
                              padding: "12px",
                              backgroundColor: "#f6f6f7",
                              borderRadius: "8px"
                            }}>
                              <BlockStack gap="200">
                                <Button
                                  onClick={() => {/* TODO: Open product type selector modal */ }}
                                  variant="plain"
                                  textAlign="left"
                                >
                                  + Product with Type(s)
                                </Button>
                                {pixelForm.selectedProductTypes.length > 0 && (
                                  <Text as="p" variant="bodySm" tone="subdued">
                                    {pixelForm.selectedProductTypes.length} type(s) {pixelForm.trackingPages === "selected" ? "selected" : "excluded"}
                                  </Text>
                                )}
                              </BlockStack>
                            </div>

                            {/* Product Tag Selector */}
                            <div style={{
                              padding: "12px",
                              backgroundColor: "#f6f6f7",
                              borderRadius: "8px"
                            }}>
                              <BlockStack gap="200">
                                <Button
                                  onClick={() => {/* TODO: Open product tag selector modal */ }}
                                  variant="plain"
                                  textAlign="left"
                                >
                                  + Product with Tag(s)
                                </Button>
                                {pixelForm.selectedProductTags.length > 0 && (
                                  <Text as="p" variant="bodySm" tone="subdued">
                                    {pixelForm.selectedProductTags.length} tag(s) {pixelForm.trackingPages === "selected" ? "selected" : "excluded"}
                                  </Text>
                                )}
                              </BlockStack>
                            </div>

                            {/* Product Selector */}
                            <div style={{
                              padding: "12px",
                              backgroundColor: "#f6f6f7",
                              borderRadius: "8px"
                            }}>
                              <BlockStack gap="200">
                                <Button
                                  onClick={() => {/* TODO: Open product selector modal */ }}
                                  variant="plain"
                                  textAlign="left"
                                >
                                  + Select Product(s)
                                </Button>
                                {pixelForm.selectedProducts.length > 0 && (
                                  <Text as="p" variant="bodySm" tone="subdued">
                                    {pixelForm.selectedProducts.length} product(s) {pixelForm.trackingPages === "selected" ? "selected" : "excluded"}
                                  </Text>
                                )}
                              </BlockStack>
                            </div>
                          </BlockStack>
                        </div>
                      )}
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
                    1. Go to <a href="https://developers.facebook.com/tools/explorer/" target="_blank" rel="noopener noreferrer" style={{ color: "#2563eb" }}>Facebook Graph API Explorer</a>
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

      {/* Page Selector Modal */}
      {mounted && (
        <PageSelector
          open={showPageSelector}
          onClose={() => {
            console.log('[PageSelector] Closing modal');
            setShowPageSelector(false);
          }}
          onSelectPages={(pages) => {
            console.log('[PageSelector] Selected pages:', pages);
            setEnhancedCreateForm(prev => ({
              ...prev,
              selectedPageTypes: pages
            }));
            setShowPageSelector(false);
          }}
          initialSelectedPages={enhancedCreateForm.selectedPageTypes}
          availablePages={pageTypeOptions.filter((p: any) => p.value !== "all")}
        />
      )}
    </div>
  );
}