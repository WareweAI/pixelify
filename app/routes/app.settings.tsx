import { useState, useEffect, useCallback } from "react";
import type { ActionFunctionArgs, LoaderFunctionArgs } from "react-router";
import { useLoaderData, useFetcher } from "react-router";
import { getShopifyInstance } from "../shopify.server";
import prisma from "../db.server";
import {
  Page,
  Layout,
  Card,
  Text,
  BlockStack,
  InlineStack,
  Select,
  TextField,
  Button,
  Checkbox,
  Banner,
  Badge,
  Modal,
  EmptyState,
  Box,
  Divider,
} from "@shopify/polaris";
import { ClientOnly } from "../components/ClientOnly";

export const loader = async ({ request }: LoaderFunctionArgs) => {
  const shopify = getShopifyInstance();
  const { session } = await shopify.authenticate.admin(request);
  const shop = session.shop;

  const user = await prisma.user.findUnique({
    where: { storeUrl: shop },
  });

  if (!user) {
    return { apps: [] };
  }

  const apps = await prisma.app.findMany({
    where: { userId: user.id },
    select: {
      id: true,
      appId: true,
      name: true,
    },
  });

  return { apps };
};

export const action = async ({ request }: ActionFunctionArgs) => {
  const shopify = getShopifyInstance();
  if (!shopify?.authenticate) {
    throw new Response("Shopify configuration not found", { status: 500 });
  }
  const { session, redirect } = await shopify.authenticate.admin(request);
  const shop = session.shop;
  const formData = await request.formData();
  const intent = formData.get("intent") as string;

  const user = await prisma.user.findUnique({ where: { storeUrl: shop } });
  if (!user) {
    return { error: "User not found" };
  }

  if (intent === "update-tracking") {
    const appId = formData.get("appId") as string;
    const autoTrackPageviews = formData.get("autoTrackPageviews") === "true";
    const autoTrackClicks = formData.get("autoTrackClicks") === "true";
    const autoTrackScroll = formData.get("autoTrackScroll") === "true";
    const autoTrackViewContent = formData.get("autoTrackViewContent") === "true";
    const autoTrackAddToCart = formData.get("autoTrackAddToCart") === "true";
    const autoTrackInitiateCheckout = formData.get("autoTrackInitiateCheckout") === "true";
    const autoTrackPurchase = formData.get("autoTrackPurchase") === "true";

    await prisma.appSettings.update({
      where: { appId },
      data: { 
        autoTrackPageviews, 
        autoTrackClicks, 
        autoTrackScroll,
        autoTrackViewContent,
        autoTrackAddToCart,
        autoTrackInitiateCheckout,
        autoTrackPurchase
      },
    });

    return { success: true, message: "Tracking settings updated" };
  }

  if (intent === "update-privacy") {
    const appId = formData.get("appId") as string;
    const recordIp = formData.get("recordIp") === "true";
    const recordLocation = formData.get("recordLocation") === "true";
    const recordSession = formData.get("recordSession") === "true";

    await prisma.appSettings.update({
      where: { appId },
      data: { recordIp, recordLocation, recordSession },
    });

    return { success: true, message: "Privacy settings updated" };
  }

  if (intent === "update-meta") {
    const appId = formData.get("appId") as string;
    const metaPixelId = formData.get("metaPixelId") as string;
    const metaAccessToken = formData.get("metaAccessToken") as string;
    const metaTestEventCode = formData.get("metaTestEventCode") as string;
    const metaPixelEnabled = formData.get("metaPixelEnabled") === "true";

    await prisma.appSettings.update({
      where: { appId },
      data: {
        metaPixelId: metaPixelId || null,
        metaAccessToken: metaAccessToken || null,
        metaTestEventCode: metaTestEventCode || null,
        metaPixelEnabled
      },
    });

    return { success: true, message: "Meta integration updated" };
  }

  if (intent === "update-timezone") {
    const appId = formData.get("appId") as string;
    const timezone = formData.get("timezone") as string;

    await prisma.appSettings.update({
      where: { appId },
      data: {
        timezone: timezone || "GMT+0",
      },
    });

    return { success: true, message: "Timezone updated successfully" };
  }



  if (intent === "disconnect-meta") {
    const appId = formData.get("appId") as string;

    await prisma.appSettings.update({
      where: { appId },
      data: {
        metaPixelId: null,
        metaAccessToken: null,
        metaTestEventCode: null,
        metaPixelEnabled: false,
      },
    });

    return { success: true, message: "Meta integration disconnected" };
  }

  if (intent === "update-catalog") {
    // TODO: Re-enable after migration is applied to production
    return { success: true, message: "Catalog settings temporarily disabled" };
    /*
    const appId = formData.get("appId") as string;
    const facebookCatalogEnabled = formData.get("facebookCatalogEnabled") === "true";

    await prisma.appSettings.update({
      where: { appId },
      data: {
        facebookCatalogEnabled,
      },
    });

    return { success: true, message: "Catalog settings updated" };
    */
  }

  if (intent === "delete-script-tags") {
    try {
      const accessToken = session.accessToken;
      if (!accessToken) {
        return { error: "No access token available. Please reinstall the app." };
      }

      // Get all script tags
      const response = await fetch(`https://${session.shop}/admin/api/2024-10/script_tags.json`, {
        method: "GET",
        headers: {
          "X-Shopify-Access-Token": accessToken,
          "Content-Type": "application/json",
        },
      });

      if (!response.ok) {
        const errorText = await response.text();
        console.error("Script tags fetch error:", response.status, errorText);
        return { error: `Failed to fetch script tags: ${response.status}` };
      }

      const data = await response.json();
      const scriptTags = data.script_tags || [];
      
      console.log(`Found ${scriptTags.length} script tags`);
      
      // Find and delete script tags from our app (pixel-warewe or pixel.js)
      let deletedCount = 0;
      for (const tag of scriptTags) {
        if (tag.src && (tag.src.includes("pixel-warewe") || tag.src.includes("pixel.js"))) {
          console.log(`Deleting script tag: ${tag.id} - ${tag.src}`);
          const deleteRes = await fetch(`https://${session.shop}/admin/api/2024-10/script_tags/${tag.id}.json`, {
            method: "DELETE",
            headers: {
              "X-Shopify-Access-Token": accessToken,
            },
          });
          if (deleteRes.ok) {
            deletedCount++;
          }
        }
      }

      // Also delete from ScriptInjection table if it exists
      try {
        await prisma.scriptInjection.deleteMany({
          where: { shop: session.shop },
        });
      } catch (e) {
        // Table might not exist, ignore
        console.log("ScriptInjection table not available, skipping");
      }

      return { 
        success: true, 
        message: deletedCount > 0 
          ? `Deleted ${deletedCount} old script tag(s). CORB errors should stop now. Refresh your store.`
          : `No old script tags found (checked ${scriptTags.length} tags). The issue may be elsewhere.`
      };
    } catch (error: any) {
      console.error("Delete script tags error:", error);
      return { error: `Failed: ${error.message || "Unknown error"}` };
    }
  }



  return { error: "Invalid intent" };
};

export default function SettingsPage() {
  const { apps } = useLoaderData<typeof loader>();
  const fetcher = useFetcher();
  const [selectedAppId, setSelectedAppId] = useState(apps[0]?.id || "");
  const [settings, setSettings] = useState<any>(null);
  const [loadingSettings, setLoadingSettings] = useState(false);

  const [showDisconnectModal, setShowDisconnectModal] = useState(false);

  const selectedApp = apps.find((a: any) => a.id === selectedAppId);

  const fetchSettings = useCallback(async () => {
    if (!selectedAppId) return;

    setLoadingSettings(true);
    try {
      const app = apps.find((a: any) => a.id === selectedAppId);
      if (app) {
        // Since we removed settings from loader, we need to fetch them
        // For now, we'll use a simple approach - get from database via API
        // Actually, let's create a simple API endpoint for settings
        const response = await fetch(`/api/app-settings?appId=${app.appId}`);
        if (response.ok) {
          const data = await response.json();
          setSettings(data.settings);
        }
      }
    } catch (error) {
      console.error("Failed to fetch settings:", error);
    } finally {
      setLoadingSettings(false);
    }
  }, [selectedAppId, apps]);

  useEffect(() => {
    fetchSettings();
  }, [fetchSettings]);

  // Local state for form
  const [trackingSettings, setTrackingSettings] = useState({
    autoTrackPageviews: true,
    autoTrackClicks: true,
    autoTrackScroll: true,
    autoTrackViewContent: true,
    autoTrackAddToCart: true,
    autoTrackInitiateCheckout: true,
    autoTrackPurchase: true,
  });

  const [privacySettings, setPrivacySettings] = useState({
    recordIp: true,
    recordLocation: true,
    recordSession: true,
  });

  const [metaSettings, setMetaSettings] = useState({
    metaPixelId: "",
    metaAccessToken: "",
    metaTestEventCode: "",
    metaPixelEnabled: false,
  });

  const [timezoneSettings, setTimezoneSettings] = useState({
    timezone: "GMT+0",
  });

  // TODO: Re-enable after migration is applied to production
  /*
  const [catalogSettings, setCatalogSettings] = useState({
    facebookCatalogEnabled: false,
    facebookCatalogId: "",
    facebookCatalogSyncStatus: null as string | null,
    facebookCatalogLastSync: null as Date | null,
  });
  */

  // Comprehensive timezone options
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

  // Update local state when app changes
  useEffect(() => {
    if (settings) {
      setTrackingSettings({
        autoTrackPageviews: settings.autoTrackPageviews ?? true,
        autoTrackClicks: settings.autoTrackClicks ?? true,
        autoTrackScroll: settings.autoTrackScroll ?? true,
        autoTrackViewContent: settings.autoTrackViewContent ?? true,
        autoTrackAddToCart: settings.autoTrackAddToCart ?? true,
        autoTrackInitiateCheckout: settings.autoTrackInitiateCheckout ?? true,
        autoTrackPurchase: settings.autoTrackPurchase ?? true,
      });
      setPrivacySettings({
        recordIp: settings.recordIp ?? true,
        recordLocation: settings.recordLocation ?? true,
        recordSession: settings.recordSession ?? true,
      });
      setMetaSettings({
        metaPixelId: settings.metaPixelId || "",
        metaAccessToken: settings.metaAccessToken || "",
        metaTestEventCode: settings.metaTestEventCode || "",
        metaPixelEnabled: settings.metaPixelEnabled ?? false,
      });
      setTimezoneSettings({
        timezone: settings.timezone || "GMT+0",
      });
      // TODO: Re-enable after migration is applied to production
      /*
      setCatalogSettings({
        facebookCatalogEnabled: settings.facebookCatalogEnabled ?? false,
        facebookCatalogId: settings.facebookCatalogId || "",
        facebookCatalogSyncStatus: settings.facebookCatalogSyncStatus,
        facebookCatalogLastSync: settings.facebookCatalogLastSync,
      });
      */
    }
  }, [settings]);

  // Refresh settings after successful actions
  useEffect(() => {
    if (fetcher.data?.success) {
      fetchSettings();
    }
  }, [fetcher.data, fetchSettings]);

  // Delete redirect is now handled in the action using Shopify's redirect method

  const isLoading = fetcher.state !== "idle";

  const handleSaveTracking = useCallback(() => {
    fetcher.submit(
      {
        intent: "update-tracking",
        appId: selectedAppId,
        autoTrackPageviews: String(trackingSettings.autoTrackPageviews),
        autoTrackClicks: String(trackingSettings.autoTrackClicks),
        autoTrackScroll: String(trackingSettings.autoTrackScroll),
        autoTrackViewContent: String(trackingSettings.autoTrackViewContent),
        autoTrackAddToCart: String(trackingSettings.autoTrackAddToCart),
        autoTrackInitiateCheckout: String(trackingSettings.autoTrackInitiateCheckout),
        autoTrackPurchase: String(trackingSettings.autoTrackPurchase),
      },
      { method: "POST" }
    );
  }, [fetcher, selectedAppId, trackingSettings]);

  const handleSavePrivacy = useCallback(() => {
    fetcher.submit(
      {
        intent: "update-privacy",
        appId: selectedAppId,
        recordIp: String(privacySettings.recordIp),
        recordLocation: String(privacySettings.recordLocation),
        recordSession: String(privacySettings.recordSession),
      },
      { method: "POST" }
    );
  }, [fetcher, selectedAppId, privacySettings]);

  const handleSaveMeta = useCallback(() => {
    fetcher.submit(
      {
        intent: "update-meta",
        appId: selectedAppId,
        ...metaSettings,
        metaPixelEnabled: String(metaSettings.metaPixelEnabled),
      },
      { method: "POST" }
    );
  }, [fetcher, selectedAppId, metaSettings]);

  const handleSaveTimezone = useCallback(() => {
    fetcher.submit(
      {
        intent: "update-timezone",
        appId: selectedAppId,
        timezone: timezoneSettings.timezone,
      },
      { method: "POST" }
    );
  }, [fetcher, selectedAppId, timezoneSettings]);

  // TODO: Re-enable after migration is applied to production
  /*
  const handleSaveCatalog = useCallback(() => {
    fetcher.submit(
      {
        intent: "update-catalog",
        appId: selectedAppId,
        facebookCatalogEnabled: String(catalogSettings.facebookCatalogEnabled),
      },
      { method: "POST" }
    );
  }, [fetcher, selectedAppId, catalogSettings]);
  */



  const handleDisconnectMeta = useCallback(() => {
    fetcher.submit(
      { intent: "disconnect-meta", appId: selectedAppId },
      { method: "POST" }
    );
    setShowDisconnectModal(false);
  }, [fetcher, selectedAppId]);

  const handleDeleteScriptTags = useCallback(() => {
    fetcher.submit(
      { intent: "delete-script-tags" },
      { method: "POST" }
    );
  }, [fetcher]);



  const appOptions = apps.map((app: any) => ({
    label: app.name,
    value: app.id,
  }));

  if (apps.length === 0) {
    return (
      <ClientOnly fallback={<Page title="Settings"><Layout><Layout.Section><Card><Text as="p">Loading...</Text></Card></Layout.Section></Layout></Page>}>
        <Page title="Settings">
          <Layout>
            <Layout.Section>
              <Card>
                <EmptyState
                  heading="No pixels created"
                  action={{ content: "Go to Dashboard", url: "/app/dashboard" }}
                  image="https://cdn.shopify.com/s/files/1/0262/4071/2726/files/emptystate-files.png"
                >
                  <p>Create a pixel first to configure settings.</p>
                </EmptyState>
              </Card>
            </Layout.Section>
          </Layout>
        </Page>
      </ClientOnly>
    );
  }

  return (
    <ClientOnly fallback={<Page title="Settings"><Layout><Layout.Section><Card><Text as="p">Loading...</Text></Card></Layout.Section></Layout></Page>}>
      <Page title="Settings">
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

          {/* Pixel Selector */}
          <Layout.Section>
            <Card>
              <BlockStack gap="400">
                <InlineStack gap="400" wrap={false} align="space-between">
                  <div style={{ minWidth: "200px" }}>
                    <Select
                      id="select-pixel"
                      label="Select Pixel"
                      options={appOptions}
                      value={selectedAppId}
                      onChange={setSelectedAppId}
                    />
                  </div>
                  <InlineStack gap="200">
                    <Button onClick={fetchSettings} loading={loadingSettings}>
                      Refresh
                    </Button>
                  </InlineStack>
                </InlineStack>
                {selectedApp && (
                  <InlineStack gap="200">
                    <Badge>{`ID: ${selectedApp.appId}`}</Badge>
                    {settings?.metaPixelEnabled && (
                      <Badge tone="success">Meta Connected</Badge>
                    )}
                  </InlineStack>
                )}
              </BlockStack>
            </Card>
          </Layout.Section>

          {/* Tracking Settings */}
          <Layout.Section>
            <Card>
              <BlockStack gap="400">
                <Text variant="headingMd" as="h2">Automatic Tracking</Text>
                <Text as="p" tone="subdued">
                  Configure what events are automatically tracked by the pixel.
                </Text>

                <Divider />
                <Text variant="headingSm" as="h3">Basic Events</Text>

                <Checkbox
                  label="Auto-track pageviews"
                  helpText="Automatically track when users view pages"
                  checked={trackingSettings.autoTrackPageviews}
                  onChange={(checked) =>
                    setTrackingSettings((prev) => ({ ...prev, autoTrackPageviews: checked }))
                  }
                />

                <Checkbox
                  label="Auto-track clicks"
                  helpText="Automatically track button and link clicks"
                  checked={trackingSettings.autoTrackClicks}
                  onChange={(checked) =>
                    setTrackingSettings((prev) => ({ ...prev, autoTrackClicks: checked }))
                  }
                />

                <Checkbox
                  label="Auto-track scroll depth"
                  helpText="Track how far users scroll on pages"
                  checked={trackingSettings.autoTrackScroll}
                  onChange={(checked) =>
                    setTrackingSettings((prev) => ({ ...prev, autoTrackScroll: checked }))
                  }
                />

                <Divider />
                <Text variant="headingSm" as="h3">E-commerce Events</Text>
                <Text as="p" tone="subdued">
                  Automatically detect and track standard e-commerce events on your Shopify store.
                </Text>

                <Checkbox
                  label="View Content (Product Views)"
                  helpText="Automatically track when customers view product pages"
                  checked={trackingSettings.autoTrackViewContent}
                  onChange={(checked) =>
                    setTrackingSettings((prev) => ({ ...prev, autoTrackViewContent: checked }))
                  }
                />

                <Checkbox
                  label="Add to Cart"
                  helpText="Automatically track when customers add items to their cart"
                  checked={trackingSettings.autoTrackAddToCart}
                  onChange={(checked) =>
                    setTrackingSettings((prev) => ({ ...prev, autoTrackAddToCart: checked }))
                  }
                />

                <Checkbox
                  label="Initiate Checkout"
                  helpText="Automatically track when customers start the checkout process"
                  checked={trackingSettings.autoTrackInitiateCheckout}
                  onChange={(checked) =>
                    setTrackingSettings((prev) => ({ ...prev, autoTrackInitiateCheckout: checked }))
                  }
                />

                <Checkbox
                  label="Purchase (Order Completion)"
                  helpText="Automatically track completed orders on thank you pages"
                  checked={trackingSettings.autoTrackPurchase}
                  onChange={(checked) =>
                    setTrackingSettings((prev) => ({ ...prev, autoTrackPurchase: checked }))
                  }
                />

                <Button onClick={handleSaveTracking} loading={isLoading}>
                  Save Tracking Settings
                </Button>
              </BlockStack>
            </Card>
          </Layout.Section>

          {/* Privacy Settings */}
          <Layout.Section>
            <Card>
              <BlockStack gap="400">
                <Text variant="headingMd" as="h2">Privacy & Data Collection</Text>
                <Text as="p" tone="subdued">
                  Control what data is collected and stored.
                </Text>

                <Checkbox
                  label="Record IP addresses"
                  helpText="Store visitor IP addresses for analytics"
                  checked={privacySettings.recordIp}
                  onChange={(checked) =>
                    setPrivacySettings((prev) => ({ ...prev, recordIp: checked }))
                  }
                />

                <Checkbox
                  label="Record location data"
                  helpText="Store geographic location based on IP"
                  checked={privacySettings.recordLocation}
                  onChange={(checked) =>
                    setPrivacySettings((prev) => ({ ...prev, recordLocation: checked }))
                  }
                />

                <Checkbox
                  label="Record session data"
                  helpText="Track user sessions across pages"
                  checked={privacySettings.recordSession}
                  onChange={(checked) =>
                    setPrivacySettings((prev) => ({ ...prev, recordSession: checked }))
                  }
                />

                <Button onClick={handleSavePrivacy} loading={isLoading}>
                  Save Privacy Settings
                </Button>
              </BlockStack>
            </Card>
          </Layout.Section>

          {/* Timezone Settings */}
          <Layout.Section>
            <Card>
              <BlockStack gap="400">
                <Text variant="headingMd" as="h2">Timezone Settings</Text>
                <Text as="p" tone="subdued">
                  Set the timezone for tracking events. This affects how events are timestamped and reported.
                </Text>

                <Select
                  label="Select Timezone"
                  options={timezoneOptions}
                  value={timezoneSettings.timezone}
                  onChange={(value) =>
                    setTimezoneSettings((prev) => ({ ...prev, timezone: value }))
                  }
                  helpText="Choose the timezone that matches your business location or target audience"
                />

                <Box padding="400" background="bg-surface-secondary" borderRadius="200">
                  <BlockStack gap="200">
                    <Text variant="headingSm" as="h3">Current Selection</Text>
                    <InlineStack gap="200" blockAlign="center">
                      <div style={{
                        width: "10px",
                        height: "10px",
                        borderRadius: "50%",
                        backgroundColor: "#10b981"
                      }}></div>
                      <Text variant="bodyMd" fontWeight="medium" as="p">
                        {timezoneOptions.find(tz => tz.value === timezoneSettings.timezone)?.label || timezoneSettings.timezone}
                      </Text>
                    </InlineStack>
                  </BlockStack>
                </Box>

                <Button onClick={handleSaveTimezone} loading={isLoading}>
                  Save Timezone
                </Button>
              </BlockStack>
            </Card>
          </Layout.Section>

          {/* Delete Old Script Tags */}
          <Layout.Section>
            <Card>
              <BlockStack gap="400">
                <Text variant="headingMd" as="h2">🔧 Fix CORB Errors</Text>
                <Banner tone="warning">
                  <p>If you see CORB errors in browser console, old script tags may still be installed. Click below to remove them.</p>
                </Banner>
                <Text as="p" tone="subdued">
                  The App Embed (Theme Editor → App embeds → Pixel Tracker) replaces the old script tags. 
                  This will delete any old script tags causing CORB errors.
                </Text>
                <Button onClick={handleDeleteScriptTags} loading={isLoading} tone="critical">
                  Delete Old Script Tags
                </Button>
              </BlockStack>
            </Card>
          </Layout.Section>

          {/* Meta Integration */}
          <Layout.Section>
            <Card>
              <BlockStack gap="400">
                <InlineStack align="space-between">
                  <Text variant="headingMd" as="h2">Meta Pixel Integration</Text>
                  {settings?.metaPixelEnabled && (
                    <Badge tone="success">Connected</Badge>
                  )}
                  {settings?.metaPixelId && !settings?.metaPixelEnabled && settings?.metaVerified === false && (
                    <Badge tone="critical">Token Expired</Badge>
                  )}
                </InlineStack>

                {settings?.metaPixelId && !settings?.metaPixelEnabled && settings?.metaVerified === false && (
                  <Banner tone="critical">
                    <p>Your Meta access token has expired. Please reconnect to continue sending events to Meta.</p>
                  </Banner>
                )}

                {settings?.metaPixelId && !settings?.metaPixelEnabled && settings?.metaVerified === false && (
                  <Button onClick={() => window.open('/app/dashboard', '_blank')} tone="critical">
                    Reconnect Meta Account
                  </Button>
                )}

                <Text as="p" tone="subdued">
                  Connect to Meta Conversions API to send server-side events for better attribution.
                </Text>

                <Checkbox
                  label="Enable Meta Pixel forwarding"
                  helpText="Send events to Meta via Conversions API"
                  checked={metaSettings.metaPixelEnabled}
                  onChange={(checked) =>
                    setMetaSettings((prev) => ({ ...prev, metaPixelEnabled: checked }))
                  }
                />

                <TextField
                  id="meta-pixel-id"
                  label="Meta Pixel ID"
                  value={metaSettings.metaPixelId}
                  onChange={(value) =>
                    setMetaSettings((prev) => ({ ...prev, metaPixelId: value }))
                  }
                  placeholder="1234567890123456"
                  autoComplete="off"
                />

                <TextField
                  label="Access Token"
                  value={metaSettings.metaAccessToken}
                  onChange={(value) =>
                    setMetaSettings((prev) => ({ ...prev, metaAccessToken: value }))
                  }
                  type="password"
                  placeholder="EAAxxxxxxxx..."
                  helpText="Generate in Meta Events Manager → Settings"
                  autoComplete="off"
                />

                <TextField
                  id="meta-test-event-code"
                  label="Test Event Code (optional)"
                  value={metaSettings.metaTestEventCode}
                  onChange={(value) =>
                    setMetaSettings((prev) => ({ ...prev, metaTestEventCode: value }))
                  }
                  placeholder="TEST12345"
                  helpText="Use for testing in Meta Events Manager"
                  autoComplete="off"
                />

                <InlineStack gap="200">
                  <Button onClick={handleSaveMeta} loading={isLoading}>
                    Save Meta Settings
                  </Button>

                  {settings?.metaPixelEnabled && (
                    <Button tone="critical" onClick={() => setShowDisconnectModal(true)}>
                      Disconnect
                    </Button>
                  )}
                </InlineStack>
              </BlockStack>
            </Card>
          </Layout.Section>

          {/* Facebook Catalog Integration - Temporarily disabled */}
          {/*
          <Layout.Section>
            <Card>
              <BlockStack gap="400">
                <InlineStack align="space-between">
                  <Text variant="headingMd" as="h2">Facebook Catalog Integration</Text>
                  {catalogSettings.facebookCatalogEnabled && (
                    <Badge tone="success">Enabled</Badge>
                  )}
                </InlineStack>

                <Text as="p" tone="subdued">
                  Sync your Shopify products to Facebook catalog for better ad management and dynamic product ads.
                </Text>

                <Checkbox
                  label="Enable Facebook catalog sync"
                  helpText="Automatically sync products to Facebook catalog"
                  checked={catalogSettings.facebookCatalogEnabled}
                  onChange={(checked) =>
                    setCatalogSettings((prev) => ({ ...prev, facebookCatalogEnabled: checked }))
                  }
                />

                {catalogSettings.facebookCatalogId && (
                  <TextField
                    label="Catalog ID"
                    value={catalogSettings.facebookCatalogId}
                    readOnly
                    helpText="Facebook catalog ID for this store"
                    autoComplete="off"
                  />
                )}

                {catalogSettings.facebookCatalogSyncStatus && (
                  <Box padding="400" background="bg-surface-secondary" borderRadius="200">
                    <BlockStack gap="200">
                      <Text variant="headingSm" as="h3">Sync Status</Text>
                      <InlineStack gap="200" blockAlign="center">
                        <Badge tone={
                          catalogSettings.facebookCatalogSyncStatus === 'synced' ? 'success' :
                          catalogSettings.facebookCatalogSyncStatus === 'syncing' ? 'info' :
                          catalogSettings.facebookCatalogSyncStatus === 'error' ? 'critical' : undefined
                        }>
                          {catalogSettings.facebookCatalogSyncStatus}
                        </Badge>
                        {catalogSettings.facebookCatalogLastSync && (
                          <Text variant="bodySm" as="p" tone="subdued">
                            Last sync: {new Date(catalogSettings.facebookCatalogLastSync).toLocaleString()}
                          </Text>
                        )}
                      </InlineStack>
                    </BlockStack>
                  </Box>
                )}

                <InlineStack gap="200">
                  <Button onClick={handleSaveCatalog} loading={isLoading}>
                    Save Catalog Settings
                  </Button>

                  {!catalogSettings.facebookCatalogId ? (
                    <Button
                      onClick={async () => {
                        const response = await fetch('/api/facebook-catalog?action=create_catalog&name=' + encodeURIComponent(`${selectedApp?.name} Catalog`));
                        const result = await response.json();
                        if (result.success) {
                          setCatalogSettings(prev => ({
                            ...prev,
                            facebookCatalogId: result.catalogId,
                            facebookCatalogSyncStatus: 'created'
                          }));
                          fetcher.submit({}, { method: "POST" }); // Refresh data
                        }
                      }}
                      loading={isLoading}
                      disabled={!metaSettings.metaPixelEnabled}
                    >
                      Create Catalog
                    </Button>
                  ) : (
                    <>
                      <Button
                        onClick={async () => {
                          const response = await fetch('/api/facebook-catalog?action=sync_products', {
                            method: 'POST',
                            body: new FormData(),
                          });
                          const result = await response.json();
                          if (result.success) {
                            setCatalogSettings(prev => ({
                              ...prev,
                              facebookCatalogSyncStatus: 'synced',
                              facebookCatalogLastSync: new Date()
                            }));
                            fetcher.submit({}, { method: "POST" }); // Refresh data
                          }
                        }}
                        loading={isLoading}
                      >
                        Sync Products
                      </Button>
                      <Button
                        tone="critical"
                        onClick={async () => {
                          const response = await fetch('/api/facebook-catalog?action=delete_catalog', {
                            method: 'POST',
                            body: new FormData(),
                          });
                          const result = await response.json();
                          if (result.success) {
                            setCatalogSettings(prev => ({
                              ...prev,
                              facebookCatalogId: "",
                              facebookCatalogSyncStatus: null,
                              facebookCatalogLastSync: null
                            }));
                            fetcher.submit({}, { method: "POST" }); // Refresh data
                          }
                        }}
                        loading={isLoading}
                      >
                        Delete Catalog
                      </Button>
                    </>
                  )}
                </InlineStack>

                {!metaSettings.metaPixelEnabled && (
                  <Banner tone="warning">
                    <p>Meta pixel integration must be enabled first to use catalog features.</p>
                  </Banner>
                )}
              </BlockStack>
            </Card>
          </Layout.Section>
          */}


        </Layout>

        {/* Disconnect Meta Modal */}
        <Modal
          open={showDisconnectModal}
          onClose={() => setShowDisconnectModal(false)}
          title="Disconnect Meta Integration"
          primaryAction={{
            content: "Disconnect",
            onAction: handleDisconnectMeta,
            destructive: true,
          }}
          secondaryActions={[
            { content: "Cancel", onAction: () => setShowDisconnectModal(false) },
          ]}
        >
          <Modal.Section>
            <Text as="p">
              Are you sure you want to disconnect Meta integration? Events will no longer be sent to Meta Conversions API.
            </Text>
          </Modal.Section>
        </Modal>


      </Page>
    </ClientOnly>
  );
}

