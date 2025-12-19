import { useState, useCallback } from "react";
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
} from "@shopify/polaris";
import { PlusIcon, DeleteIcon, EditIcon } from "@shopify/polaris-icons";

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
        metaAccessToken: accessToken || null,
        metaPixelEnabled: true,
        metaVerified: false,
        autoTrackPageviews: true,
        autoTrackClicks: true,
        autoTrackScroll: false,
        recordIp: true,
        recordLocation: true,
        recordSession: true,
      },
    });

    return { success: true, message: "Facebook Pixel added successfully" };
  }

  if (intent === "delete-pixel") {
    const pixelId = formData.get("pixelId") as string;

    // Delete all related data
    await prisma.customEvent.deleteMany({ where: { appId: pixelId } });
    await prisma.appSettings.deleteMany({ where: { appId: pixelId } });
    await prisma.event.deleteMany({ where: { appId: pixelId } });
    await prisma.analyticsSession.deleteMany({ where: { appId: pixelId } });
    await prisma.dailyStats.deleteMany({ where: { appId: pixelId } });
    await prisma.errorLog.deleteMany({ where: { appId: pixelId } });
    await prisma.app.delete({ where: { id: pixelId } });

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

  const [createForm, setCreateForm] = useState({
    pixelName: "",
    pixelId: "",
    accessToken: "",
  });

  const isLoading = fetcher.state !== "idle";

  const handleCreate = useCallback(() => {
    if (!createForm.pixelName || !createForm.pixelId) return;

    fetcher.submit(
      {
        intent: "create-pixel",
        pixelName: createForm.pixelName,
        pixelId: createForm.pixelId,
        accessToken: createForm.accessToken,
      },
      { method: "POST" }
    );

    setShowCreateModal(false);
    setCreateForm({ pixelName: "", pixelId: "", accessToken: "" });
  }, [fetcher, createForm]);

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

  return (
    <Page
      title="Facebook Pixels"
      subtitle="Manage your Facebook Pixels for conversion tracking and audience building"
      primaryAction={{
        content: "Add Facebook Pixel",
        icon: PlusIcon,
        onAction: () => setShowCreateModal(true),
      }}
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

        {/* Info Card */}
        <Layout.Section>
          <Card>
            <BlockStack gap="300">
              <Text variant="headingMd" as="h2">What is Facebook Pixel?</Text>
              <Text as="p" tone="subdued">
                Facebook Pixel is a piece of code that helps you track conversions from Facebook ads, 
                optimize ads, build targeted audiences, and remarket to people who have taken action on your website.
              </Text>
              <InlineStack gap="400">
                <Card background="bg-surface-secondary">
                  <BlockStack gap="200">
                    <Text variant="headingSm" as="h3">📊 Track Conversions</Text>
                    <Text as="p" variant="bodySm" tone="subdued">
                      See how effectively your ads lead to valuable customer actions
                    </Text>
                  </BlockStack>
                </Card>
                <Card background="bg-surface-secondary">
                  <BlockStack gap="200">
                    <Text variant="headingSm" as="h3">🎯 Build Audiences</Text>
                    <Text as="p" variant="bodySm" tone="subdued">
                      Create custom audiences based on website visitors
                    </Text>
                  </BlockStack>
                </Card>
                <Card background="bg-surface-secondary">
                  <BlockStack gap="200">
                    <Text variant="headingSm" as="h3">🔄 Remarket</Text>
                    <Text as="p" variant="bodySm" tone="subdued">
                      Show ads to people who have already visited your website
                    </Text>
                  </BlockStack>
                </Card>
              </InlineStack>
            </BlockStack>
          </Card>
        </Layout.Section>

        {/* Pixels List */}
        <Layout.Section>
          <Card>
            <BlockStack gap="400">
              <Text variant="headingMd" as="h2">Your Facebook Pixels</Text>

              {pixels.length === 0 ? (
                <EmptyState
                  heading="No Facebook Pixels yet"
                  action={{
                    content: "Add Your First Pixel",
                    onAction: () => setShowCreateModal(true),
                  }}
                  image="https://cdn.shopify.com/s/files/1/0262/4071/2726/files/emptystate-files.png"
                >
                  <p>Add your Facebook Pixel to start tracking conversions and building audiences.</p>
                </EmptyState>
              ) : (
                <ResourceList
                  resourceName={{ singular: "pixel", plural: "pixels" }}
                  items={pixels}
                  renderItem={(pixel: any) => (
                    <ResourceItem id={pixel.id} onClick={() => {}}>
                      <BlockStack gap="300">
                        <InlineStack align="space-between" blockAlign="start">
                          <BlockStack gap="200">
                            <InlineStack gap="200" blockAlign="center">
                              <Text variant="bodyMd" fontWeight="bold" as="h3">
                                {pixel.name}
                              </Text>
                              <Badge tone={pixel.settings?.metaPixelEnabled ? "success" : "critical"}>
                                {pixel.settings?.metaPixelEnabled ? "Active" : "Inactive"}
                              </Badge>
                              {pixel.settings?.metaVerified && (
                                <Badge tone="info">Verified</Badge>
                              )}
                            </InlineStack>
                            <Text variant="bodySm" as="p" tone="subdued">
                              Pixel ID: {pixel.settings?.metaPixelId || "Not configured"}
                            </Text>
                            <Text variant="bodySm" as="p" tone="subdued">
                              Events tracked: {pixel._count.events.toLocaleString()}
                            </Text>
                          </BlockStack>
                          <InlineStack gap="200">
                            <Button
                              onClick={() => setShowInstallModal(pixel)}
                              variant="primary"
                            >
                              Get Code
                            </Button>
                            <Button
                              onClick={() => handleToggle(pixel.id, pixel.settings?.metaPixelEnabled)}
                              loading={isLoading}
                            >
                              {pixel.settings?.metaPixelEnabled ? "Disable" : "Enable"}
                            </Button>
                            <Button
                              icon={EditIcon}
                              url={`/app/settings`}
                            >
                              Edit
                            </Button>
                            <Button
                              icon={DeleteIcon}
                              tone="critical"
                              onClick={() => setShowDeleteModal(pixel)}
                            >
                              Delete
                            </Button>
                          </InlineStack>
                        </InlineStack>
                      </BlockStack>
                    </ResourceItem>
                  )}
                />
              )}
            </BlockStack>
          </Card>
        </Layout.Section>
      </Layout>

      {/* Create Pixel Modal */}
      <Modal
        open={showCreateModal}
        onClose={() => {
          setShowCreateModal(false);
          setCreateForm({ pixelName: "", pixelId: "", accessToken: "" });
        }}
        title="Add Facebook Pixel"
        primaryAction={{
          content: "Add Pixel",
          onAction: handleCreate,
          loading: isLoading,
          disabled: !createForm.pixelName || !createForm.pixelId,
        }}
        secondaryActions={[
          {
            content: "Cancel",
            onAction: () => setShowCreateModal(false),
          },
        ]}
      >
        <Modal.Section>
          <BlockStack gap="400">
            <Banner tone="info">
              <p>Add your Facebook Pixel to start tracking conversions and building custom audiences.</p>
            </Banner>

            <TextField
              label="Pixel Name"
              value={createForm.pixelName}
              onChange={(value) => setCreateForm(prev => ({ ...prev, pixelName: value }))}
              placeholder="e.g., Main Store Pixel"
              helpText="A friendly name to identify this pixel"
              autoComplete="off"
              requiredIndicator
            />

            <TextField
              label="Facebook Pixel ID"
              value={createForm.pixelId}
              onChange={(value) => setCreateForm(prev => ({ ...prev, pixelId: value }))}
              placeholder="1234567890123456"
              helpText="Find this in your Facebook Ads Manager → Events Manager"
              autoComplete="off"
              requiredIndicator
            />

            <TextField
              label="Access Token (Optional)"
              value={createForm.accessToken}
              onChange={(value) => setCreateForm(prev => ({ ...prev, accessToken: value }))}
              type="password"
              placeholder="EAAxxxxxxxx..."
              helpText="For Conversions API - generate in Facebook Events Manager"
              autoComplete="off"
            />

            <Divider />

            <BlockStack gap="200">
              <Text variant="headingSm" as="h3">How to find your Facebook Pixel ID:</Text>
              <Text as="p" variant="bodySm" tone="subdued">
                1. Go to Facebook Ads Manager → Events Manager
              </Text>
              <Text as="p" variant="bodySm" tone="subdued">
                2. Select your pixel or create a new one
              </Text>
              <Text as="p" variant="bodySm" tone="subdued">
                3. Copy the Pixel ID from the overview page
              </Text>
            </BlockStack>
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