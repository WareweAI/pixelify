import { useState, useCallback, useEffect } from "react";
import type { ActionFunctionArgs, LoaderFunctionArgs } from "react-router";
import { useLoaderData, useFetcher } from "react-router";
import { getShopifyInstance } from "../shopify.server";
import prisma from "../db.server";

declare global {
  interface Window {
    FB: any;
    fbAsyncInit: () => void;
  }
  const FB: any;
}

import {
  Page,
  Layout,
  Card,
  Text,
  BlockStack,
  InlineStack,
  Button,
  Badge,
  Banner,
  Modal,
  TextField,
  EmptyState,
  ResourceList,
  ResourceItem,
  Box,
  Divider,
  Select,
  Spinner,
  DataTable,
  Checkbox,
  Pagination,
  Filters,
  ChoiceList,
  RangeSlider,
  Icon,
  Tooltip,
} from "@shopify/polaris";
import { 
  PlusIcon, 
  DeleteIcon, 
  EditIcon, 
  SearchIcon,
  QuestionCircleIcon,
  SettingsIcon,
  ViewIcon
} from "@shopify/polaris-icons";

export const loader = async ({ request }: LoaderFunctionArgs) => {
  const shopify = getShopifyInstance();

  if (!shopify?.authenticate) {
    throw new Response("Shopify configuration not found", { status: 500 });
  }
  const { session } = await shopify.authenticate.admin(request);
  const shop = session.shop;

  const user = await prisma.user.findUnique({
    where: { storeUrl: shop },
  });

  if (!user) {
    return { pixels: [], shop };
  }

  const pixels = await prisma.app.findMany({
    where: { userId: user.id },
    include: {
      settings: true,
      _count: {
        select: { events: true },
      },
    },
    orderBy: { createdAt: "desc" },
  });

  return { pixels, shop };
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

    // Check if pixel already exists for this user
    const existingPixel = await prisma.appSettings.findFirst({
      where: {
        metaPixelId: pixelId,
        app: {
          userId: user.id
        }
      },
      include: {
        app: true
      }
    });

    if (existingPixel) {
      return { error: `Pixel "${pixelId}" already exists as "${existingPixel.app.name}". Please use a different pixel or edit the existing one.` };
    }

    // Validate access token if provided
    if (accessToken) {
      try {
        const tokenValidation = await fetch(`${process.env.META_GRAPH_API_URL || 'https://graph.facebook.com'}/v24.0/me?fields=id,name&access_token=${accessToken}`);
        const tokenData = await tokenValidation.json();

        if (tokenData.error) {
          return { error: `Invalid access token: ${tokenData.error.message}` };
        }

        console.log('Token validation successful for user:', tokenData.name);
      } catch (error) {
        console.error('Token validation error:', error);
        return { error: "Failed to validate access token. Please check your token and try again." };
      }
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
    const settingsData: any = {
      appId: app.id,
      metaPixelId: pixelId,
      metaAccessToken: accessToken || null,
      metaPixelEnabled: true,
      metaVerified: !!accessToken, // Mark as verified if token was provided and validated
      autoTrackPageviews: true,
      autoTrackClicks: true,
      autoTrackScroll: false,
      recordIp: true,
      recordLocation: true,
      recordSession: true,
      customEventsEnabled: true,
    };

    // Only add metaTokenExpiresAt if the field exists in the schema
    const expiresAt = formData.get("expiresAt");
    if (expiresAt) {
      settingsData.metaTokenExpiresAt = new Date(expiresAt as string);
    }

    await prisma.appSettings.create({
      data: settingsData,
    });

    return { success: true, message: "Facebook Pixel added successfully" };
  }

  if (intent === "delete-pixel") {
    const pixelId = formData.get("pixelId") as string;

    const existing = await prisma.app.findUnique({ where: { id: pixelId } });
    if (!existing) {
      return { error: "Pixel not found or already deleted" };
    }

    // Delete all related data (defensive: use deleteMany)
    await prisma.customEvent.deleteMany({ where: { appId: pixelId } });
    await prisma.appSettings.deleteMany({ where: { appId: pixelId } });
    await prisma.event.deleteMany({ where: { appId: pixelId } });
    await prisma.analyticsSession.deleteMany({ where: { appId: pixelId } });
    await prisma.dailyStats.deleteMany({ where: { appId: pixelId } });
    await prisma.errorLog.deleteMany({ where: { appId: pixelId } });
    await prisma.app.deleteMany({ where: { id: pixelId } });

    return { success: true, message: "Facebook Pixel deleted successfully" };
  }

  if (intent === "toggle-pixel") {
    const pixelId = formData.get("pixelId") as string;
    const enabled = formData.get("enabled") === "true";

    await prisma.appSettings.update({
      where: { appId: pixelId },
      data: { metaPixelEnabled: enabled },
    });

    return { success: true, message: `Pixel ${enabled ? "enabled" : "disabled"} successfully` };
  }


  return { error: "Invalid action" };
};

export default function FacebookPixelsPage() {
  const { pixels, shop } = useLoaderData<typeof loader>();
  const fetcher = useFetcher();
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [showDeleteModal, setShowDeleteModal] = useState<any>(null);
  const [showInstallModal, setShowInstallModal] = useState<any>(null);

  // Table state
  const [selectedPixels, setSelectedPixels] = useState<string[]>([]);
  const [currentPage, setCurrentPage] = useState(1);
  const [itemsPerPage, setItemsPerPage] = useState(5);
  const [searchQuery, setSearchQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState<string[]>([]);
  const [sortColumn, setSortColumn] = useState<string>("name");
  const [sortDirection, setSortDirection] = useState<"asc" | "desc">("asc");

  const [createForm, setCreateForm] = useState({
    pixelName: "",
    pixelId: "",
    accessToken: "",
    expiresAt: "",
  });
  const [manualPixelId, setManualPixelId] = useState("");
  const [fetchedPixels, setFetchedPixels] = useState<any[]>([]);
  const [isFetchingPixels, setIsFetchingPixels] = useState(false);
  const [step, setStep] = useState<"select" | "validate">("select");
  const [facebookAccessToken, setFacebookAccessToken] = useState<string | null>(null);
  const [facebookUser, setFacebookUser] = useState<{id: string, name: string} | null>(null);
  const [facebookBusiness, setFacebookBusiness] = useState<{id: string, name: string} | null>(null);
  const [isCheckingLogin, setIsCheckingLogin] = useState(true);

  const isLoading = fetcher.state !== "idle";

  const checkLoginState = useCallback(() => {
    if (window.FB) {
      FB.getLoginStatus(function(response: any) {
        console.log('FB login status check:', response);
      });
    }
  }, []);

  const handleFetchPixels = useCallback(async (accessToken?: string) => {
    // Use provided token or get from state
    const token = accessToken || facebookAccessToken;
    console.log('Access token available:', !!token);
    if (!token) {
      console.error('No access token available');
      return;
    }

    setIsFetchingPixels(true);
    try {
      console.log('Fetching pixels from Facebook API...');

      const response = await fetch(`/api/facebook-pixels?accessToken=${token}`);
      const data = await response.json();

      if (data.error) {
        console.error('Failed to fetch pixels:', data.error);
        alert(`Failed to fetch pixels: ${data.error}

🎯 To create a Facebook Pixel:

1. Go to Facebook Events Manager: https://business.facebook.com/events_manager
2. Click "Create" → "Facebook Pixel"
3. Name your pixel and complete setup
4. Come back and try fetching pixels again`);

        setFetchedPixels([{
          id: 'manual',
          name: 'Enter Pixel Manually',
          adAccountId: 'manual',
          adAccountName: 'Manual Entry'
        }]);
      } else {
        const pixels = data.pixels || [];
        console.log(`Total pixels found: ${pixels.length}`);

        if (pixels.length === 0) {
          alert(`No pixels found in your ad accounts.

🎯 To create a Facebook Pixel:

1. Go to Facebook Events Manager: https://business.facebook.com/events_manager
2. Click "Create" → "Facebook Pixel"
3. Name your pixel and complete setup
4. Come back and try fetching pixels again`);

          setFetchedPixels([{
            id: 'manual',
            name: 'Enter Pixel Manually',
            adAccountId: 'manual',
            adAccountName: 'Manual Entry'
          }]);
        } else {
          setFetchedPixels(pixels);
          console.log(`✅ Successfully found ${pixels.length} pixel(s)!`);
        }
      }
      
    } catch (error) {
      console.error("Failed to fetch pixels:", error);
      setFetchedPixels([]);
      alert(`Network error while fetching pixels: ${error}`);
    } finally {
      setIsFetchingPixels(false);
    }
  }, [facebookAccessToken]);

  const checkLoginStatus = useCallback(() => {
    if (!window.FB) return;

    FB.getLoginStatus(function(response: any) {
      console.log('FB login status check:', response);
      setIsCheckingLogin(false);

      if (response.status === 'connected' && response.authResponse) {
        console.log('User already logged in, fetching user info...');
        setFacebookAccessToken(response.authResponse.accessToken);
        const userId = response.authResponse.userID;

        // Get user info
        FB.api('/me', { fields: 'id,name' }, function(userResponse: any) {
          if (!userResponse.error) {
            setFacebookUser(userResponse);
            console.log('Got user:', userResponse);
            // Automatically fetch pixels using API
            handleFetchPixels(response.authResponse.accessToken);
            setStep("select");
          } else {
            console.error('Failed to get user info:', userResponse.error);
          }
        });
      } else {
        console.log('User not logged in');
      }
    });
  }, [handleFetchPixels]);

  const handleFacebookLogin = useCallback(() => {
    // Manual OAuth to avoid SDK global token override warning
    const facebookAppId = "881927951248648"; // Your Facebook App ID
    const redirectUri = encodeURIComponent(`${window.location.origin}/api/facebook/callback`);
    const scope = "ads_read,business_management,ads_management,pages_show_list,pages_read_engagement"; // Required permissions for pixel access

    const oauthUrl = `https://www.facebook.com/v24.0/dialog/oauth?client_id=${facebookAppId}&redirect_uri=${redirectUri}&scope=${scope}&response_type=code&state=${Date.now()}`;

    const popup = window.open(
      oauthUrl,
      'facebook-oauth',
      'width=600,height=600,scrollbars=yes,resizable=yes'
    );

    // Listen for messages from the popup
    const handleMessage = async (event: MessageEvent) => {
      if (event.origin !== window.location.origin) return;

      if (event.data.type === 'FACEBOOK_AUTH_SUCCESS') {
        console.log('Facebook OAuth successful, fetching pixels...');
        setFacebookAccessToken(event.data.accessToken);
        setCreateForm(prev => ({ ...prev, accessToken: event.data.accessToken, expiresAt: event.data.expiresAt }));
        handleFetchPixels(event.data.accessToken);
        setStep("select");
        window.removeEventListener('message', handleMessage);

        // If no pixels were fetched automatically, try to fetch them
        if (!event.data.pixels || event.data.pixels.length === 0) {
          // Fetch pixels using the API
          try {
            const response = await fetch(`/api/facebook-pixels?accessToken=${event.data.accessToken}`);
            const data = await response.json();
            if (data.pixels && data.pixels.length > 0) {
              setFetchedPixels(data.pixels);
            } else {
              setFetchedPixels([{
                id: 'manual',
                name: 'Enter Pixel Manually',
                adAccountId: 'manual',
                adAccountName: 'Manual Entry'
              }]);
            }
          } catch (error) {
            console.error('Failed to fetch pixels:', error);
            setFetchedPixels([{
              id: 'manual',
              name: 'Enter Pixel Manually',
              adAccountId: 'manual',
              adAccountName: 'Manual Entry'
            }]);
          }
        }
      } else if (event.data.type === 'FACEBOOK_AUTH_ERROR') {
        console.log('Facebook OAuth failed:', event.data.error);
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
  }, [fetcher, handleFetchPixels]);

  // Load Facebook SDK and check login status
  useEffect(() => {
    if (window.FB) {
      checkLoginStatus();
      return; // Already loaded
    }

    window.fbAsyncInit = function() {
      FB.init({
        appId: '881927951248648',
        cookie: true,
        xfbml: true,
        version: 'v24.0'
      });

      FB.AppEvents.logPageView();
      checkLoginStatus();
    };

    (function(d, s, id){
       var js, fjs = d.getElementsByTagName(s)[0];
       if (d.getElementById(id)) {return;}
       js = d.createElement(s) as HTMLScriptElement; js.id = id;
       js.src = "https://connect.facebook.net/en_US/sdk.js";
       if (fjs.parentNode) fjs.parentNode.insertBefore(js, fjs);
     }(document, 'script', 'facebook-jssdk'));
  }, [checkLoginStatus]);

  const handleCreate = useCallback(() => {
    const pixelId = createForm.pixelId === 'manual' ? manualPixelId : createForm.pixelId || manualPixelId;
    if (!createForm.pixelName || !pixelId) return;

    fetcher.submit(
      {
        intent: "create-pixel",
        pixelName: createForm.pixelName,
        pixelId: pixelId,
        accessToken: createForm.accessToken || facebookAccessToken || "",
        expiresAt: createForm.expiresAt,
      },
      { method: "POST" }
    );

    setShowCreateModal(false);
    setCreateForm({ pixelName: "", pixelId: "", accessToken: "", expiresAt: "" });
    setManualPixelId("");
    setFetchedPixels([]);
    setStep("select");
  }, [fetcher, createForm, manualPixelId, facebookAccessToken]);

  const handleToggle = useCallback((pixelId: string, currentEnabled: boolean) => {
    fetcher.submit(
      {
        intent: "toggle-pixel",
        pixelId,
        enabled: String(!currentEnabled),
      },
      { method: "POST" }
    );
  }, [fetcher]);


  const handleDelete = useCallback(() => {
    if (!showDeleteModal) return;

    fetcher.submit(
      { intent: "delete-pixel", pixelId: showDeleteModal.id },
      { method: "POST" }
    );
    setShowDeleteModal(null);
  }, [fetcher, showDeleteModal]);

  const generateInstallCode = (pixel: any) => {
    const appUrl = typeof window !== "undefined" ? window.location.origin : "https://pixel-warewe.vercel.app";
    return `<!-- Facebook Pixel Code -->
<script>
  !function(f,b,e,v,n,t,s)
  {if(f.fbq)return;n=f.fbq=function(){n.callMethod?
  n.callMethod.apply(n,arguments):n.queue.push(arguments)};
  if(!f._fbq)f._fbq=n;n.push=n;n.loaded=!0;n.version='2.0';
  n.queue=[];t=b.createElement(e);t.async=!0;
  t.src=v;s=b.getElementsByTagName(e)[0];
  s.parentNode.insertBefore(t,s)}(window, document,'script',
  'https://connect.facebook.net/en_US/fbevents.js');
  fbq('init', '${pixel.settings?.metaPixelId}');
  fbq('track', 'PageView');
</script>
<noscript><img height="1" width="1" style="display:none"
  src="https://www.facebook.com/tr?id=${pixel.settings?.metaPixelId}&ev=PageView&noscript=1"
/></noscript>
<!-- End Facebook Pixel Code -->

<!-- Pixel Tracker Enhanced Tracking -->
<script>
  window.PIXEL_TRACKER_ID = "${pixel.appId}";
</script>
<script async src="${appUrl}/api/pixel.js?id=${pixel.appId}&shop=${shop}"></script>`;
  };

  // Filter and sort pixels
  const filteredPixels = pixels.filter((pixel: any) => {
    const matchesSearch = searchQuery === "" || 
      pixel.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      pixel.settings?.metaPixelId?.includes(searchQuery);
    
    const matchesStatus = statusFilter.length === 0 || 
      (statusFilter.includes("active") && pixel.settings?.metaPixelEnabled) ||
      (statusFilter.includes("inactive") && !pixel.settings?.metaPixelEnabled);
    
    return matchesSearch && matchesStatus;
  }).sort((a: any, b: any) => {
    let aValue, bValue;
    
    switch (sortColumn) {
      case "name":
        aValue = a.name.toLowerCase();
        bValue = b.name.toLowerCase();
        break;
      case "pixelId":
        aValue = a.settings?.metaPixelId || "";
        bValue = b.settings?.metaPixelId || "";
        break;
      case "status":
        aValue = a.settings?.metaPixelEnabled ? "active" : "inactive";
        bValue = b.settings?.metaPixelEnabled ? "active" : "inactive";
        break;
      case "events":
        aValue = a._count.events;
        bValue = b._count.events;
        break;
      default:
        aValue = a.name.toLowerCase();
        bValue = b.name.toLowerCase();
    }
    
    if (sortDirection === "asc") {
      return aValue < bValue ? -1 : aValue > bValue ? 1 : 0;
    } else {
      return aValue > bValue ? -1 : aValue < bValue ? 1 : 0;
    }
  });

  // Pagination
  const totalPages = Math.ceil(filteredPixels.length / itemsPerPage);
  const startIndex = (currentPage - 1) * itemsPerPage;
  const paginatedPixels = filteredPixels.slice(startIndex, startIndex + itemsPerPage);

  // Handle bulk actions
  const handleBulkDelete = () => {
    if (selectedPixels.length === 0) return;
    
    // For now, just delete the first selected pixel as an example
    const pixelToDelete = pixels.find((p: any) => p.id === selectedPixels[0]);
    if (pixelToDelete) {
      setShowDeleteModal(pixelToDelete);
    }
  };

  const handleSelectAll = (checked: boolean) => {
    if (checked) {
      setSelectedPixels(paginatedPixels.map((p: any) => p.id));
    } else {
      setSelectedPixels([]);
    }
  };

  const handleSelectPixel = (pixelId: string, checked: boolean) => {
    if (checked) {
      setSelectedPixels([...selectedPixels, pixelId]);
    } else {
      setSelectedPixels(selectedPixels.filter(id => id !== pixelId));
    }
  };

  // Clear filters
  const handleClearFilters = () => {
    setSearchQuery("");
    setStatusFilter([]);
    setCurrentPage(1);
  };

  return (
    <Page
      title="Pixel"
      primaryAction={{
        content: "Add Pixel",
        icon: PlusIcon,
        onAction: () => {
          if (!facebookUser) {
            handleFacebookLogin();
          } else {
            setShowCreateModal(true);
          }
        },
      }}
      secondaryActions={[
        {
          content: facebookUser ? "Connected" : "Connect Facebook",
          icon: facebookUser ? ViewIcon : PlusIcon,
          onAction: facebookUser ? () => {} : handleFacebookLogin,
          disabled: facebookUser ? true : false,
        },
        {
          content: "More",
          icon: SettingsIcon,
          onAction: () => {},
        }
      ]}
    >
      <Layout>
        {/* Success/Error Banner */}
        {fetcher.data?.success && (
          <Layout.Section>
            <Banner tone="success" onDismiss={() => {}}>
              <p>{fetcher.data.message}</p>
            </Banner>
          </Layout.Section>
        )}
        {fetcher.data?.error && (
          <Layout.Section>
            <Banner tone="critical" onDismiss={() => {}}>
              <p>{fetcher.data.error}</p>
            </Banner>
          </Layout.Section>
        )}

        {/* Quick Stats */}
        {pixels.length > 0 && (
          <Layout.Section>
            <InlineStack gap="400">
              <Card>
                <BlockStack gap="200">
                  <Text variant="headingMd" as="h3">
                    {pixels.length}
                  </Text>
                  <Text variant="bodySm" as="p" tone="subdued">
                    Total Pixels
                  </Text>
                </BlockStack>
              </Card>
              <Card>
                <BlockStack gap="200">
                  <Text variant="headingMd" as="h3">
                    {pixels.filter((p: any) => p.settings?.metaPixelEnabled).length}
                  </Text>
                  <Text variant="bodySm" as="p" tone="subdued">
                    Active Pixels
                  </Text>
                </BlockStack>
              </Card>
              <Card>
                <BlockStack gap="200">
                  <Text variant="headingMd" as="h3">
                    {pixels.reduce((sum: number, p: any) => sum + (p._count?.events || 0), 0).toLocaleString()}
                  </Text>
                  <Text variant="bodySm" as="p" tone="subdued">
                    Total Events
                  </Text>
                </BlockStack>
              </Card>
              <Card>
                <BlockStack gap="200">
                  <Text variant="headingMd" as="h3">
                    {pixels.filter((p: any) => p.settings?.metaVerified).length}
                  </Text>
                  <Text variant="bodySm" as="p" tone="subdued">
                    Verified Pixels
                  </Text>
                </BlockStack>
              </Card>
            </InlineStack>
          </Layout.Section>
        )}

        {/* Main Pixel Manager Table */}
        <Layout.Section>
          <Card padding="0">
            <BlockStack gap="0">
              {/* Bulk Actions Bar */}
              {selectedPixels.length > 0 && (
                <Box padding="400" borderBlockEndWidth="025" borderColor="border" background="bg-surface-selected">
                  <InlineStack align="space-between" blockAlign="center">
                    <Text variant="bodyMd" as="span">
                      {selectedPixels.length} pixel{selectedPixels.length > 1 ? 's' : ''} selected
                    </Text>
                    <InlineStack gap="200">
                      <Button
                        onClick={() => {
                          selectedPixels.forEach(pixelId => {
                            const pixel = pixels.find((p: any) => p.id === pixelId);
                            if (pixel) {
                              handleToggle(pixelId, pixel.settings?.metaPixelEnabled);
                            }
                          });
                          setSelectedPixels([]);
                        }}
                      >
                        Toggle Status
                      </Button>
                      <Button
                        tone="critical"
                        onClick={handleBulkDelete}
                      >
                        Delete Selected
                      </Button>
                      <Button onClick={() => setSelectedPixels([])}>
                        Clear Selection
                      </Button>
                    </InlineStack>
                  </InlineStack>
                </Box>
              )}

              {/* Search and Filters */}
              <Box padding="400" borderBlockEndWidth="025" borderColor="border">
                <InlineStack align="space-between" gap="400">
                  <div style={{ flex: 1, maxWidth: "400px" }}>
                    <TextField
                      placeholder="Filter by pixel title, pixel ID"
                      value={searchQuery}
                      onChange={setSearchQuery}
                      prefix={<Icon source={SearchIcon} />}
                      clearButton
                      onClearButtonClick={() => setSearchQuery("")}
                      autoComplete="off"
                    />
                  </div>
                  <InlineStack gap="200">
                    <Select
                      label="Status"
                      labelHidden
                      options={[
                        { label: "All statuses", value: "" },
                        { label: "Active", value: "active" },
                        { label: "Inactive", value: "inactive" },
                      ]}
                      value={statusFilter.length > 0 ? statusFilter[0] : ""}
                      onChange={(value) => setStatusFilter(value ? [value] : [])}
                    />
                    {(searchQuery || statusFilter.length > 0) && (
                      <Button onClick={handleClearFilters}>Clear filters</Button>
                    )}
                  </InlineStack>
                </InlineStack>
              </Box>

              {/* Table Header */}
              <Box padding="0">
                <div style={{ 
                  display: "grid", 
                  gridTemplateColumns: "40px 80px 120px 1fr 120px 120px 120px 80px",
                  alignItems: "center",
                  padding: "12px 16px",
                  borderBottom: "1px solid var(--p-color-border)",
                  backgroundColor: "var(--p-color-bg-surface-secondary)",
                  fontSize: "12px",
                  fontWeight: "600",
                  color: "var(--p-color-text-subdued)"
                }}>
                  <Checkbox
                    checked={selectedPixels.length === paginatedPixels.length && paginatedPixels.length > 0}
                    indeterminate={selectedPixels.length > 0 && selectedPixels.length < paginatedPixels.length}
                    onChange={handleSelectAll}
                  />
                  <Text variant="bodySm" fontWeight="semibold" as="span">Status</Text>
                  <Text variant="bodySm" fontWeight="semibold" as="span">Pixel ID</Text>
                  <Text variant="bodySm" fontWeight="semibold" as="span">Title</Text>
                  <Text variant="bodySm" fontWeight="semibold" as="span">Pages</Text>
                  <InlineStack gap="100" blockAlign="center">
                    <Text variant="bodySm" fontWeight="semibold" as="span">Server-Side API</Text>
                    <Tooltip content="Server-Side API allows you to send events directly from your server">
                      <Icon source={QuestionCircleIcon} />
                    </Tooltip>
                  </InlineStack>
                  <Text variant="bodySm" fontWeight="semibold" as="span">Test Server Events</Text>
                  <Text variant="bodySm" fontWeight="semibold" as="span">Action</Text>
                </div>

                {/* Table Rows */}
                {paginatedPixels.length === 0 ? (
                  <Box padding="800">
                    <EmptyState
                      heading="No pixels found"
                      action={{
                        content: "Add Pixel",
                        onAction: () => setShowCreateModal(true),
                      }}
                      image="https://cdn.shopify.com/s/files/1/0262/4071/2726/files/emptystate-files.png"
                    >
                      <p>Create your first Facebook Pixel to start tracking conversions.</p>
                    </EmptyState>
                  </Box>
                ) : (
                  paginatedPixels.map((pixel: any, index: number) => (
                    <div
                      key={pixel.id}
                      style={{
                        display: "grid",
                        gridTemplateColumns: "40px 80px 120px 1fr 120px 120px 120px 80px",
                        alignItems: "center",
                        padding: "12px 16px",
                        borderBottom: index < paginatedPixels.length - 1 ? "1px solid var(--p-color-border)" : "none",
                        backgroundColor: selectedPixels.includes(pixel.id) ? "var(--p-color-bg-surface-selected)" : "transparent"
                      }}
                    >
                      <Checkbox
                        checked={selectedPixels.includes(pixel.id)}
                        onChange={(checked) => handleSelectPixel(pixel.id, checked)}
                      />
                      
                      <Badge tone={pixel.settings?.metaPixelEnabled ? "success" : "critical"}>
                        {pixel.settings?.metaPixelEnabled ? "Active" : "Inactive"}
                      </Badge>
                      
                      <Text variant="bodySm" as="span" fontWeight="medium">
                        {pixel.settings?.metaPixelId || "Not set"}
                      </Text>
                      
                      <Text variant="bodySm" as="span" fontWeight="medium">
                        {pixel.name}
                      </Text>
                      
                      <Badge tone="success">All pages</Badge>
                      
                      <div style={{ display: "flex", alignItems: "center", justifyContent: "center" }}>
                        <div
                          style={{
                            width: "40px",
                            height: "20px",
                            borderRadius: "10px",
                            backgroundColor: pixel.settings?.metaAccessToken ? "#1f2937" : "#d1d5db",
                            position: "relative",
                            cursor: "pointer",
                            transition: "background-color 0.2s"
                          }}
                          onClick={() => {
                            // Toggle server-side API - for now just show a message
                            alert("Server-Side API configuration coming soon!");
                          }}
                        >
                          <div
                            style={{
                              width: "16px",
                              height: "16px",
                              borderRadius: "50%",
                              backgroundColor: "white",
                              position: "absolute",
                              top: "2px",
                              left: pixel.settings?.metaAccessToken ? "22px" : "2px",
                              transition: "left 0.2s"
                            }}
                          />
                        </div>
                      </div>
                      
                      <Button size="slim" onClick={() => setShowInstallModal(pixel)}>
                        Set up
                      </Button>
                      
                      <Button
                        icon={EditIcon}
                        size="slim"
                        onClick={() => setShowDeleteModal(pixel)}
                      />
                    </div>
                  ))
                )}
              </Box>

              {/* Pagination Footer */}
              {filteredPixels.length > 0 && (
                <Box padding="400" borderBlockStartWidth="025" borderColor="border">
                  <InlineStack align="space-between" blockAlign="center">
                    <InlineStack gap="200" blockAlign="center">
                      <Text variant="bodySm" as="span">Rows per page:</Text>
                      <Select
                        label="Rows per page"
                        labelHidden
                        options={[
                          { label: "5", value: "5" },
                          { label: "10", value: "10" },
                          { label: "25", value: "25" },
                          { label: "50", value: "50" },
                        ]}
                        value={itemsPerPage.toString()}
                        onChange={(value) => {
                          setItemsPerPage(parseInt(value));
                          setCurrentPage(1);
                        }}
                      />
                    </InlineStack>
                    
                    <InlineStack gap="400" blockAlign="center">
                      <Text variant="bodySm" as="span">
                        {startIndex + 1}-{Math.min(startIndex + itemsPerPage, filteredPixels.length)} of {filteredPixels.length}
                      </Text>
                      
                      <Pagination
                        hasPrevious={currentPage > 1}
                        onPrevious={() => setCurrentPage(currentPage - 1)}
                        hasNext={currentPage < totalPages}
                        onNext={() => setCurrentPage(currentPage + 1)}
                      />
                    </InlineStack>
                  </InlineStack>
                </Box>
              )}
            </BlockStack>
          </Card>
        </Layout.Section>

        {/* Help Section */}
        <Layout.Section>
          <Card>
            <InlineStack gap="200" blockAlign="center">
              <Icon source={QuestionCircleIcon} tone="base" />
              <Text variant="bodySm" as="span">
                For more guidance, visit our{" "}
                <Button variant="plain" size="slim" url="https://developers.facebook.com/docs/facebook-pixel" external>
                  knowledge base
                </Button>
                {" "}or{" "}
                <Button variant="plain" size="slim" url="/app/support">
                  request support
                </Button>
              </Text>
            </InlineStack>
          </Card>
        </Layout.Section>
      </Layout>

      {/* Create Pixel Modal - Streamlined */}
      <Modal
        open={showCreateModal}
        onClose={() => {
          setShowCreateModal(false);
          setCreateForm({ pixelName: "", pixelId: "", accessToken: "", expiresAt: "" });
          setManualPixelId("");
          setFetchedPixels([]);
          setStep("select");
        }}
        title="Add Facebook Pixel"
        primaryAction={{
          content: "Add Pixel",
          onAction: handleCreate,
          loading: isLoading,
          disabled: !createForm.pixelName || (!createForm.pixelId && !manualPixelId),
        }}
        secondaryActions={[
          {
            content: "Cancel",
            onAction: () => {
              setShowCreateModal(false);
              setCreateForm({ pixelName: "", pixelId: "", accessToken: "", expiresAt: "" });
              setManualPixelId("");
              setFetchedPixels([]);
              setStep("select");
            },
          },
        ]}
      >
        <Modal.Section>
          <BlockStack gap="400">
            <Banner tone="info">
              <p>Connect your Facebook Pixel to track conversions and build custom audiences.</p>
            </Banner>

            {fetchedPixels.length > 0 && (
              <Select
                label="Select Facebook Pixel"
                options={fetchedPixels.map(pixel => ({
                  label: pixel.id === 'manual' ? pixel.name : `${pixel.name} (${pixel.id})`,
                  value: pixel.id,
                }))}
                value={createForm.pixelId}
                onChange={(value) => {
                  const selectedPixel = fetchedPixels.find(p => p.id === value);
                  setCreateForm(prev => ({
                    ...prev,
                    pixelId: value,
                    pixelName: selectedPixel && selectedPixel.id !== 'manual' ? selectedPixel.name : prev.pixelName,
                  }));
                  if (value !== 'manual') {
                    setManualPixelId("");
                  }
                }}
                placeholder="Choose a pixel"
              />
            )}

            {(createForm.pixelId === 'manual' || fetchedPixels.length === 0) && (
              <TextField
                label="Facebook Pixel ID"
                value={manualPixelId}
                onChange={setManualPixelId}
                placeholder="e.g., 123456789012345"
                helpText="Enter your Facebook Pixel ID from Events Manager"
                autoComplete="off"
                requiredIndicator
              />
            )}

            <TextField
              label="Pixel Name"
              value={createForm.pixelName}
              onChange={(value) => setCreateForm(prev => ({ ...prev, pixelName: value }))}
              placeholder="e.g., Main Store Pixel"
              helpText="A friendly name to identify this pixel"
              autoComplete="off"
              requiredIndicator
            />

            {facebookAccessToken && (
              <TextField
                label="Access Token (Optional)"
                value={createForm.accessToken || facebookAccessToken}
                onChange={(value) => setCreateForm(prev => ({ ...prev, accessToken: value }))}
                type="password"
                placeholder="EAAxxxxxxxx..."
                helpText="Access token for server-side API integration"
                autoComplete="off"
              />
            )}
          </BlockStack>
        </Modal.Section>
      </Modal>

      {/* Delete Confirmation Modal */}
      {showDeleteModal && (
        <Modal
          open={true}
          onClose={() => setShowDeleteModal(null)}
          title="Delete Facebook Pixel"
          primaryAction={{
            content: "Delete Permanently",
            onAction: handleDelete,
            loading: isLoading,
            destructive: true,
          }}
          secondaryActions={[
            { content: "Cancel", onAction: () => setShowDeleteModal(null) },
          ]}
        >
          <Modal.Section>
            <BlockStack gap="400">
              <Banner tone="critical">
                <p>
                  This will permanently delete the pixel "{showDeleteModal.name}" and all associated data.
                </p>
              </Banner>
              <Text as="p" fontWeight="bold">This action cannot be undone.</Text>
            </BlockStack>
          </Modal.Section>
        </Modal>
      )}

      {/* Install Code Modal */}
      {showInstallModal && (
        <Modal
          open={true}
          onClose={() => setShowInstallModal(null)}
          title={`Install Code for "${showInstallModal.name}"`}
          size="large"
        >
          <Modal.Section>
            <BlockStack gap="400">
              <Text as="p" tone="subdued">
                Copy this code and paste it into your theme's theme.liquid file, just before the closing &lt;/head&gt; tag:
              </Text>
              <Box
                padding="400"
                background="bg-surface-secondary"
                borderRadius="200"
              >
                <pre style={{
                  margin: 0,
                  whiteSpace: "pre-wrap",
                  fontFamily: "monospace",
                  fontSize: "12px",
                  lineHeight: 1.5,
                }}>
                  {generateInstallCode(showInstallModal)}
                </pre>
              </Box>
              <InlineStack gap="200">
                <Button
                  variant="primary"
                  onClick={() => {
                    navigator.clipboard.writeText(generateInstallCode(showInstallModal));
                  }}
                >
                  Copy Code
                </Button>
                <Button onClick={() => setShowInstallModal(null)}>
                  Close
                </Button>
              </InlineStack>
              <Banner tone="info">
                <p>
                  For Shopify themes: Go to Online Store → Themes → Edit code → theme.liquid
                </p>
              </Banner>
            </BlockStack>
          </Modal.Section>
        </Modal>
      )}
    </Page>
  );
}