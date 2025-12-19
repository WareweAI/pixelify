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
} from "@shopify/polaris";
import { CheckIcon, ConnectIcon } from "@shopify/polaris-icons";

export const loader = async ({ request }: LoaderFunctionArgs) => {
  const shopify = getShopifyInstance();
  
  if (!shopify?.authenticate) {
    console.error("Shopify not configured in app.dashboard loader");
    throw new Response("Shopify configuration not found", { status: 500 });
  }

  const { session } = await shopify.authenticate.admin(request);
  const shop = session.shop;

  let user = await prisma.user.findUnique({
    where: { email: shop },
  });

  if (!user) {
    user = await prisma.user.create({
      data: {
        email: shop,
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
  const totalEvents = apps.reduce((sum, app) => sum + app._count.events, 0);
  const totalSessions = apps.reduce((sum, app) => sum + app._count.analyticsSessions, 0);

  // Get recent events across all apps (last 7 days)
  const sevenDaysAgo = new Date();
  sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);

  const recentEvents = await prisma.event.findMany({
    where: {
      app: {
        userId: user.id,
      },
      createdAt: { gte: sevenDaysAgo },
    },
    orderBy: { createdAt: "desc" },
    take: 10,
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
    recentEvents: recentEvents.map(e => ({
      id: e.id,
      eventName: e.eventName,
      url: e.url,
      appName: e.app.name,
      appId: e.app.appId,
      createdAt: e.createdAt,
    })),
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

  const user = await prisma.user.findUnique({ where: { email: shop } });
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

    try {
      // Validate the pixel exists and user has access
      const validateResponse = await fetch(`https://graph.facebook.com/v18.0/${pixelId}?access_token=${accessToken}`);
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
      const response = await fetch(`https://graph.facebook.com/v18.0/${pixelId}?access_token=${accessToken}`);
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

      return { success: true, app, intent: "create" };
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

  if (intent === "fetch-facebook-pixels") {
    const accessToken = formData.get("accessToken") as string;
    
    if (!accessToken) {
      return { error: "Facebook access token is required" };
    }

    try {
      // Fetch pixels from Facebook Graph API
      const response = await fetch(`https://graph.facebook.com/v18.0/me/adaccounts?fields=account_id,name,pixels{id,name}&access_token=${accessToken}`);
      const data = await response.json();

      if (data.error) {
        return { error: `Facebook API Error: ${data.error.message}` };
      }

      const pixels: Array<{id: string, name: string, accountName: string}> = [];
      
      if (data.data) {
        data.data.forEach((account: any) => {
          if (account.pixels && account.pixels.data) {
            account.pixels.data.forEach((pixel: any) => {
              pixels.push({
                id: pixel.id,
                name: pixel.name,
                accountName: account.name
              });
            });
          }
        });
      }

      return { success: true, facebookPixels: pixels };
    } catch (error) {
      console.error("Error fetching Facebook pixels:", error);
      return { error: "Failed to fetch pixels from Facebook. Please check your access token." };
    }
  }

  return { error: "Invalid action" };
};

export default function DashboardPage() {
  const { apps, hasPixels, stats, recentEvents } = useLoaderData<typeof loader>();
  const fetcher = useFetcher();
  const [searchParams] = useSearchParams();
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
  
  const [pixelForm, setPixelForm] = useState({
    pixelName: "",
    pixelId: "",
    trackingPages: "all",
  });

  // Create form state (for manual pixel creation)
  const [createForm, setCreateForm] = useState({
    name: "",
    metaAppId: "", // Pixel ID
    metaAccessToken: "",
  });

  // Rename form state
  const [renameValue, setRenameValue] = useState("");

  const isLoading = fetcher.state !== "idle";

  // Handle Facebook OAuth callback
  useEffect(() => {
    const facebookToken = searchParams.get("facebook_token");
    const facebookSuccess = searchParams.get("facebook_success");
    const facebookError = searchParams.get("facebook_error");

    if (facebookError) {
      setFacebookError(`Facebook connection failed: ${facebookError}`);
    } else if (facebookToken && facebookSuccess) {
      setFacebookAccessToken(facebookToken);
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
    if (!facebookAccessToken) return;

    fetcher.submit(
      {
        intent: "fetch-facebook-pixels",
        accessToken: facebookAccessToken,
      },
      { method: "POST" }
    );
    
    setShowFacebookModal(false);
  }, [fetcher, facebookAccessToken]);

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
  if (fetcher.data?.facebookPixels) {
    if (facebookPixels.length === 0) {
      setFacebookPixels(fetcher.data.facebookPixels);
      setIsConnectedToFacebook(true);
    }
  }

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
          onAction: () => setShowCreateModal(true),
        }}
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
                    <Text variant="bodySm" as="p" tone="info">Live tracking</Text>
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
                <Button url="/app/pixels">Manage All Pixels</Button>
              </InlineStack>
              
              <Card>
                <BlockStack gap="400">
                  {apps.map((app: any) => {
                    const { id, appId, name, _count, settings } = app;
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
                              </InlineStack>
                              <Text variant="bodySm" as="p" tone="subdued">
                                Pixel ID: {settings?.metaPixelId || appId} • {_count.events.toLocaleString()} events • {_count.analyticsSessions.toLocaleString()} sessions
                              </Text>
                            </BlockStack>
                            <InlineStack gap="200">
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

          {/* Recent Events */}
          {recentEvents.length > 0 && (
            <Layout.Section>
              <Card>
                <BlockStack gap="400">
                  <Text variant="headingMd" as="h3">Recent Events</Text>
                  <BlockStack gap="200">
                    {recentEvents.map((event: any) => (
                      <InlineStack key={event.id} align="space-between" blockAlign="center">
                        <BlockStack gap="100">
                          <InlineStack gap="200" blockAlign="center">
                            <Badge>{event.eventName}</Badge>
                            <Text as="p" variant="bodySm" tone="subdued">{event.appName}</Text>
                          </InlineStack>
                          {event.url && (
                            <Text as="p" variant="bodySm" tone="subdued">
                              {new URL(event.url).pathname}
                            </Text>
                          )}
                        </BlockStack>
                        <Text as="p" variant="bodySm" tone="subdued">
                          {new Date(event.createdAt).toLocaleString()}
                        </Text>
                      </InlineStack>
                    ))}
                  </BlockStack>
                </BlockStack>
              </Card>
            </Layout.Section>
          )}
        </Layout>

        {/* Create Modal */}
        <Modal
          open={showCreateModal}
          onClose={handleCreateModalClose}
          title="Create New Pixel"
          primaryAction={{
            content: "Create Pixel",
            onAction: handleCreate,
            loading: isLoading,
            disabled: !createForm.name || !createForm.metaAppId,
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

              <TextField
                label="Pixel ID (Dataset ID)"
                value={createForm.metaAppId}
                onChange={(value) => setCreateForm(prev => ({ ...prev, metaAppId: value }))}
                placeholder="e.g., 1234567890123456"
                helpText="Find in Meta Events Manager → Data Sources → Select your dataset → Dataset ID"
                autoComplete="off"
                requiredIndicator
              />

              <TextField
                label="Access Token (Optional)"
                value={createForm.metaAccessToken}
                onChange={(value) => setCreateForm(prev => ({ ...prev, metaAccessToken: value }))}
                type="password"
                placeholder="EAAxxxxxxxx..."
                helpText="Generate in Meta Events Manager → Settings → Conversions API → Generate Access Token"
                autoComplete="off"
              />
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

              <Text variant="headingLg" as="h2">
                Add Facebook Pixel
              </Text>

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
                    
                    {!isConnectedToFacebook ? (
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
                          <Button 
                            variant="primary" 
                            onClick={() => setShowFacebookModal(true)}
                          >
                            Connect to Facebook
                          </Button>
                        </BlockStack>
                      </Card>
                    ) : (
                      <BlockStack gap="300">
                        <Banner tone="success">
                          <p>✅ Connected to Facebook! Found {facebookPixels.length} pixel(s).</p>
                        </Banner>
                        
                        {facebookPixels.length > 0 && (
                          <Select
                            label="Select a Facebook Pixel"
                            options={[
                              { label: "Choose a pixel...", value: "" },
                              ...facebookPixels.map(pixel => ({
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
                          error={!pixelForm.pixelId && fetcher.data?.error ? "Facebook Pixel ID is required" : undefined}
                          autoComplete="off"
                        />
                      </div>
                      <Text as="p" variant="bodySm" tone="subdued">
                        This is your Facebook Pixel ID (also called Dataset ID)
                      </Text>
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
                  Step 1 of 4
                </Text>
                <Button 
                  variant="primary" 
                  onClick={handleCreatePixel}
                  loading={isLoading}
                  disabled={
                    inputMethod === "auto" 
                      ? !pixelForm.pixelId || !selectedFacebookPixel
                      : !pixelForm.pixelName || !pixelForm.pixelId || !facebookAccessToken
                  }
                >
                  {inputMethod === "manual" ? "Validate & Create Pixel" : "Next"}
                </Button>
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
        }}
        title="Connect to Facebook"
        primaryAction={{
          content: "Fetch Pixels",
          onAction: handleConnectToFacebook,
          loading: isLoading,
          disabled: !facebookAccessToken,
        }}
        secondaryActions={[
          {
            content: "Cancel",
            onAction: () => {
              setShowFacebookModal(false);
              setFacebookAccessToken("");
            },
          },
        ]}
      >
        <Modal.Section>
          <BlockStack gap="400">
            <Banner tone="warning">
              <p><strong>Important:</strong> Your Facebook app needs specific permissions to access pixels. Follow the steps below to get a valid access token.</p>
            </Banner>

            <TextField
              label="Facebook Pixel Access Token"
              value={facebookAccessToken}
              onChange={setFacebookAccessToken}
              type="password"
              placeholder="Enter your Facebook Pixel access token..."
              helpText="This must be a pixel-specific access token with ads_read permissions"
              autoComplete="off"
              requiredIndicator
            />

            <Divider />

            <BlockStack gap="300">
              <Text variant="headingSm" as="h3">📋 Step-by-Step Guide:</Text>
              
              <BlockStack gap="200">
                <Text as="p" variant="bodySm">
                  <strong>1. Go to Facebook Graph API Explorer:</strong><br />
                  Visit: <a href="https://developers.facebook.com/tools/explorer/" target="_blank" rel="noopener noreferrer" style={{color: "#2563eb"}}>https://developers.facebook.com/tools/explorer/</a>
                </Text>
                
                <Text as="p" variant="bodySm">
                  <strong>2. Select Your App:</strong><br />
                  Choose your Facebook app from the dropdown (App ID: 1751098928884384)
                </Text>
                
                <Text as="p" variant="bodySm">
                  <strong>3. Generate Pixel Access Token:</strong><br />
                  Click "Generate Access Token" and add these permissions:
                </Text>
                
                <div style={{marginLeft: "16px"}}>
                  <Text as="p" variant="bodySm" tone="subdued">• ads_read (required for pixel access)</Text>
                  <Text as="p" variant="bodySm" tone="subdued">• business_management (required for pixel management)</Text>
                  <Text as="p" variant="bodySm" tone="subdued">• ads_management (optional for pixel creation)</Text>
                </div>
                
                <Text as="p" variant="bodySm">
                  <strong>4. Copy Pixel Token:</strong><br />
                  Copy the generated pixel access token and paste it above
                </Text>
              </BlockStack>

              <Banner tone="info">
                <p><strong>Important:</strong> The access token must have pixel-specific permissions. If you get permission errors, ensure your Facebook app has been approved for ads_read and business_management permissions, and that you're an admin/developer of the Facebook app.</p>
              </Banner>
            </BlockStack>
          </BlockStack>
        </Modal.Section>
      </Modal>
    </div>
  );
}