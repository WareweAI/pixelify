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
  if (!shopify?.authenticate) {
    throw new Response("Shopify configuration not found", { status: 500 });
  }
  const { session } = await shopify.authenticate.admin(request);
  const shop = session.shop;

  const user = await prisma.user.findUnique({
    where: { email: shop },
  });

  if (!user) {
    return { apps: [] };
  }

  const apps = await prisma.app.findMany({
    where: { userId: user.id },
    include: {
      settings: true,
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

  const user = await prisma.user.findUnique({ where: { email: shop } });
  if (!user) {
    return { error: "User not found" };
  }

  if (intent === "update-tracking") {
    const appId = formData.get("appId") as string;
    const autoTrackPageviews = formData.get("autoTrackPageviews") === "true";
    const autoTrackClicks = formData.get("autoTrackClicks") === "true";
    const autoTrackScroll = formData.get("autoTrackScroll") === "true";

    await prisma.appSettings.update({
      where: { appId },
      data: { autoTrackPageviews, autoTrackClicks, autoTrackScroll },
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

  const [showDisconnectModal, setShowDisconnectModal] = useState(false);

  const selectedApp = apps.find((a: any) => a.id === selectedAppId);
  const settings = selectedApp?.settings;

  // Local state for form
  const [trackingSettings, setTrackingSettings] = useState({
    autoTrackPageviews: true,
    autoTrackClicks: true,
    autoTrackScroll: true,
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

  // Update local state when app changes
  useEffect(() => {
    if (settings) {
      setTrackingSettings({
        autoTrackPageviews: settings.autoTrackPageviews ?? true,
        autoTrackClicks: settings.autoTrackClicks ?? true,
        autoTrackScroll: settings.autoTrackScroll ?? true,
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
    }
  }, [settings]);

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
                <Select
                  id="select-pixel"
                  label="Select Pixel"
                  options={appOptions}
                  value={selectedAppId}
                  onChange={setSelectedAppId}
                />
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
                </InlineStack>

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

