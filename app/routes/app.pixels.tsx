import { useState, useCallback } from "react";
import type { LoaderFunctionArgs, ActionFunctionArgs } from "react-router";
import { useLoaderData, useSubmit, useNavigation, useActionData } from "react-router";
import {
  Page,
  Layout,
  Card,
  Text,
  BlockStack,
  InlineStack,
  Badge,
  Button,
  TextField,
  Banner,
  Box,
  Modal,
  FormLayout,
  Divider,
} from "@shopify/polaris";
import { authenticate } from "~/shopify.server";
import prisma from "~/db.server";

export async function loader({ request }: LoaderFunctionArgs) {
  const { session } = await authenticate.admin(request);
  const shop = session.shop;

  // Find user and their app
  const user = await prisma.user.findUnique({
    where: { storeUrl: shop },
    include: {
      apps: {
        include: { settings: true },
        orderBy: { createdAt: "desc" },
        take: 1,
      },
    },
  });

  if (!user || user.apps.length === 0) {
    return {
      app: null,
      settings: null,
      shop,
    };
  }

  const app = user.apps[0];
  return {
    app: {
      id: app.id,
      appId: app.appId,
      name: app.name,
    },
    settings: app.settings,
    shop,
  };
}

export async function action({ request }: ActionFunctionArgs) {
  const { session } = await authenticate.admin(request);
  const shop = session.shop;
  const formData = await request.formData();
  const actionType = formData.get("action");

  const user = await prisma.user.findUnique({
    where: { storeUrl: shop },
    include: {
      apps: {
        include: { settings: true },
        orderBy: { createdAt: "desc" },
        take: 1,
      },
    },
  });

  if (!user || user.apps.length === 0) {
    return { error: "No app found" };
  }

  const app = user.apps[0];

  if (actionType === "update-meta") {
    const metaPixelId = formData.get("metaPixelId") as string;
    const metaAccessToken = formData.get("metaAccessToken") as string;

    if (!app.settings) {
      await prisma.appSettings.create({
        data: {
          appId: app.id,
          metaPixelId: metaPixelId || null,
          metaAccessToken: metaAccessToken || null,
          metaPixelEnabled: !!metaPixelId,
        },
      });
    } else {
      await prisma.appSettings.update({
        where: { id: app.settings.id },
        data: {
          metaPixelId: metaPixelId || null,
          metaAccessToken: metaAccessToken || null,
          metaPixelEnabled: !!metaPixelId,
        },
      });
    }

    return { success: true, message: "Meta Pixel settings updated" };
  }

  if (actionType === "validate-meta") {
    const metaPixelId = formData.get("metaPixelId") as string;
    const metaAccessToken = formData.get("metaAccessToken") as string;

    if (!metaPixelId || !metaAccessToken) {
      return { error: "Both Pixel ID and Access Token are required" };
    }

    try {
      const response = await fetch(
        `https://graph.facebook.com/v24.0/${metaPixelId}?fields=id,name&access_token=${metaAccessToken}`
      );
      const data = await response.json();

      if (data.error) {
        return { error: data.error.message || "Invalid credentials" };
      }

      // Update settings with verified status
      if (app.settings) {
        await prisma.appSettings.update({
          where: { id: app.settings.id },
          data: {
            metaPixelId,
            metaAccessToken,
            metaPixelEnabled: true,
            metaVerified: true,
          },
        });
      } else {
        await prisma.appSettings.create({
          data: {
            appId: app.id,
            metaPixelId,
            metaAccessToken,
            metaPixelEnabled: true,
            metaVerified: true,
          },
        });
      }

      return { success: true, message: `Connected to ${data.name || "Meta Pixel"}` };
    } catch (error) {
      return { error: "Failed to validate Meta credentials" };
    }
  }

  return { error: "Unknown action" };
}

export default function PixelsPage() {
  const { app, settings, shop } = useLoaderData<typeof loader>();
  const actionData = useActionData<any>();
  const submit = useSubmit();
  const navigation = useNavigation();
  const isLoading = navigation.state === "submitting";

  const [metaPixelId, setMetaPixelId] = useState(settings?.metaPixelId || "");
  const [metaAccessToken, setMetaAccessToken] = useState(settings?.metaAccessToken || "");
  const [showMetaModal, setShowMetaModal] = useState(false);
  
  const handleValidateMeta = useCallback(() => {
    const formData = new FormData();
    formData.append("action", "validate-meta");
    formData.append("metaPixelId", metaPixelId);
    formData.append("metaAccessToken", metaAccessToken);
    submit(formData, { method: "post" });
    setShowMetaModal(false);
  }, [metaPixelId, metaAccessToken, submit]);

  if (!app) {
    return (
      <Page title="Facebook Pixel Manager">
        <Layout>
          <Layout.Section>
            <Banner tone="warning">
              <p>No pixel configured. Please set up your pixel first.</p>
            </Banner>
          </Layout.Section>
        </Layout>
      </Page>
    );
  }

  return (
    <Page title="Facebook Pixel Manager">
      <Layout>
        <Layout.Section>
          <BlockStack gap="400">
            {/* Success/Error Messages */}
            {actionData?.success && (
              <Banner tone="success">
                <p>{actionData.message}</p>
              </Banner>
            )}
            {actionData?.error && (
              <Banner tone="critical">
                <p>{actionData.error}</p>
              </Banner>
            )}

            {/* Pixel Info Card */}
            <Card>
              <BlockStack gap="400">
                <Text as="h2" variant="headingMd">Your Pixel</Text>
                <InlineStack gap="200" align="start">
                  <Text as="span" variant="bodyMd">Pixel ID:</Text>
                  <Text as="span" variant="bodyMd" fontWeight="semibold">{app.appId}</Text>
                  <Badge tone="success">Active</Badge>
                </InlineStack>
              </BlockStack>
            </Card>

            {/* Meta/Facebook Pixel Integration */}
            <Card>
              <BlockStack gap="400">
                <InlineStack align="space-between">
                  <Text as="h2" variant="headingMd">Meta (Facebook) Pixel</Text>
                  {settings?.metaPixelEnabled && settings?.metaPixelId && settings?.metaAccessToken ? (
                    <Badge tone="success">Connected</Badge>
                  ) : (
                    <Badge tone="critical">Not Connected</Badge>
                  )}
                </InlineStack>
                
                <Text as="p" variant="bodyMd" tone="subdued">
                  Connect your Meta Pixel to send events via the Conversions API (CAPI) for better tracking accuracy.
                </Text>

                {settings?.metaPixelEnabled && settings?.metaPixelId && settings?.metaAccessToken ? (
                  <BlockStack gap="200">
                    <InlineStack gap="200">
                      <Text as="span" variant="bodyMd">Meta Pixel ID:</Text>
                      <Text as="span" variant="bodyMd" fontWeight="semibold">{settings.metaPixelId}</Text>
                    </InlineStack>
                    <InlineStack gap="200">
                      <Text as="span" variant="bodyMd">CAPI Status:</Text>
                      <Badge tone="success">Enabled</Badge>
                    </InlineStack>
                    <InlineStack gap="200">
                      <Text as="span" variant="bodyMd">Access Token:</Text>
                      <Text as="span" variant="bodyMd" fontWeight="semibold">
                        {settings.metaAccessToken ? `${settings.metaAccessToken.substring(0, 10)}...` : 'Not set'}
                      </Text>
                    </InlineStack>
                  </BlockStack>
                ) : (
                  <Banner tone="info">
                    <p>🔗 Connect your Meta Pixel to enable server-side tracking via Conversions API.</p>
                  </Banner>
                )}

                <Button onClick={() => setShowMetaModal(true)}>
                  {settings?.metaPixelEnabled && settings?.metaPixelId && settings?.metaAccessToken ? "Edit Meta Pixel" : "Connect Meta Pixel"}
                </Button>
              </BlockStack>
            </Card>

            {/* Installation Instructions */}
            <Card>
              <BlockStack gap="400">
                <Text as="h2" variant="headingMd">Installation</Text>
                <Text as="p" variant="bodyMd" tone="subdued">
                  The pixel is automatically installed via the theme app extension. Make sure it's enabled in your theme settings.
                </Text>
                <Box paddingBlockStart="200">
                  <Text as="p" variant="bodySm" tone="subdued">
                    Go to Online Store → Themes → Customize → App embeds → Enable "Pixel Tracker"
                  </Text>
                </Box>
              </BlockStack>
            </Card>
          </BlockStack>
        </Layout.Section>
      </Layout>

      {/* Meta Pixel Modal */}
      <Modal
        open={showMetaModal}
        onClose={() => setShowMetaModal(false)}
        title="Connect Meta Pixel"
        primaryAction={{
          content: "Validate & Connect",
          onAction: handleValidateMeta,
          loading: isLoading,
          disabled: !metaPixelId || !metaAccessToken,
        }}
        secondaryActions={[
          {
            content: "Cancel",
            onAction: () => setShowMetaModal(false),
          },
        ]}
      >
        <Modal.Section>
          <BlockStack gap="400">
            {/* Current Status */}
            {settings?.metaPixelEnabled && settings?.metaPixelId && settings?.metaAccessToken && (
              <Banner tone="success">
                <p>✅ Currently connected to Meta Pixel ID: <strong>{settings.metaPixelId}</strong></p>
              </Banner>
            )}
            
            <FormLayout>
              <TextField
                label="Meta Pixel ID (Dataset ID)"
                value={metaPixelId}
                onChange={setMetaPixelId}
                placeholder="123456789012345"
                helpText="Find this in Meta Events Manager → Data Sources → Select your dataset → Dataset ID"
                autoComplete="off"
                requiredIndicator
              />
              <TextField
                label="Conversions API Access Token"
                value={metaAccessToken}
                onChange={setMetaAccessToken}
                placeholder="EAAxxxxxxx..."
                helpText="Generate in Meta Events Manager → Settings → Conversions API → Generate Access Token"
                autoComplete="off"
                type="password"
                requiredIndicator
              />
            </FormLayout>

            <Banner tone="info">
              <BlockStack gap="100">
                <Text as="p" variant="bodyMd" fontWeight="medium">How to get your credentials:</Text>
                <Text as="p" variant="bodySm">
                  1. Go to <a href="https://business.facebook.com/events_manager2" target="_blank" rel="noopener noreferrer" style={{color: "#2563eb"}}>Meta Events Manager</a>
                </Text>
                <Text as="p" variant="bodySm">
                  2. Select your pixel → Data Sources → Copy the Dataset ID
                </Text>
                <Text as="p" variant="bodySm">
                  3. Go to Settings → Conversions API → Generate Access Token
                </Text>
              </BlockStack>
            </Banner>

            {(!metaPixelId || !metaAccessToken) && (
              <Banner tone="warning">
                <p>Both Pixel ID and Access Token are required to establish connection.</p>
              </Banner>
            )}
          </BlockStack>
        </Modal.Section>
      </Modal>
    </Page>
  );
}
