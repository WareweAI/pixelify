import { useState } from "react";
import type { ActionFunctionArgs, LoaderFunctionArgs } from "react-router";
import { useLoaderData, useFetcher } from "react-router";
import { getShopifyInstance } from "../shopify.server";
import prisma from "../db.server";
import { FacebookCatalogService } from "../services/facebook-catalog.server";
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
} from "@shopify/polaris";

export const loader = async ({ request }: LoaderFunctionArgs) => {
  const shopify = getShopifyInstance();

  if (!shopify?.authenticate) {
    console.error("Shopify not configured in app.catalog loader");
    throw new Response("Shopify configuration not found", { status: 500 });
  }

  const { session } = await shopify.authenticate.admin(request);
  const shop = session.shop;

  const user = await prisma.user.findUnique({
    where: { storeUrl: shop },
  });

  if (!user) {
    throw new Response("User not found", { status: 404 });
  }

  // Get user's apps to check for Facebook tokens
  const apps = await prisma.app.findMany({
    where: { userId: user.id },
    include: {
      settings: {
        select: {
          metaAccessToken: true,
          metaPixelEnabled: true,
        },
      },
    },
  });

  // Find an app with a valid Facebook token
  const appWithToken = apps.find(app => app.settings?.metaAccessToken);

  return {
    hasFacebookToken: !!appWithToken,
    facebookToken: appWithToken?.settings?.metaAccessToken || null,
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

  if (intent === "create-catalog") {
    const catalogName = formData.get("catalogName") as string;

    if (!catalogName) {
      return { error: "Catalog name is required" };
    }

    // Get Facebook token from user's apps
    const apps = await prisma.app.findMany({
      where: { userId: user.id },
      include: {
        settings: {
          select: {
            metaAccessToken: true,
          },
        },
      },
    });

    const appWithToken = apps.find(app => app.settings?.metaAccessToken);
    const accessToken = appWithToken?.settings?.metaAccessToken;

    if (!accessToken) {
      return { error: "Facebook access token not found. Please connect Facebook first." };
    }

    try {
      const catalogId = await FacebookCatalogService.createCatalog(accessToken, catalogName);

      return {
        success: true,
        message: `Catalog "${catalogName}" created successfully!`,
        catalogId,
      };
    } catch (error) {
      console.error("Error creating catalog:", error);
      return {
        error: error instanceof Error ? error.message : "Failed to create catalog"
      };
    }
  }

  return { error: "Invalid action" };
};

export default function CatalogPage() {
  const { hasFacebookToken, facebookToken } = useLoaderData<typeof loader>();
  const fetcher = useFetcher();
  const [catalogName, setCatalogName] = useState("");

  const isLoading = fetcher.state !== "idle";

  const handleCreateCatalog = () => {
    if (!catalogName.trim()) return;

    fetcher.submit(
      {
        intent: "create-catalog",
        catalogName: catalogName.trim(),
      },
      { method: "POST" }
    );
  };

  return (
    <Page
      title="Facebook Catalog"
      subtitle="Create and manage your Facebook product catalogs"
    >
      <Layout>
        {/* Success/Error Banner */}
        {fetcher.data?.success && (
          <Layout.Section>
            <Banner tone="success">
              <p>{fetcher.data.message}</p>
              {fetcher.data.catalogId && (
                <p><strong>Catalog ID:</strong> {fetcher.data.catalogId}</p>
              )}
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

        <Layout.Section>
          <Card>
            <BlockStack gap="400">
              <Text variant="headingMd" as="h2">
                Create New Catalog
              </Text>

              <Text as="p" variant="bodyMd">
                Create a new Facebook product catalog to organize your products for advertising.
              </Text>

              {!hasFacebookToken ? (
                <Banner tone="warning">
                  <p>
                    You need to connect Facebook first. Please go to the Dashboard and connect your Facebook account to get an access token.
                  </p>
                </Banner>
              ) : (
                <BlockStack gap="400">
                  <TextField
                    label="Catalog Name"
                    value={catalogName}
                    onChange={setCatalogName}
                    placeholder="e.g., My Store Products"
                    helpText="Choose a descriptive name for your catalog"
                    autoComplete="off"
                    requiredIndicator
                  />

                  <Banner tone="info">
                    <BlockStack gap="200">
                      <Text as="p" variant="bodyMd" fontWeight="medium">
                        <strong>Important:</strong> Your access token needs the <code>catalog_management</code> permission.
                      </Text>
                      <Text as="p" variant="bodySm">
                        If you're getting a "Missing Permission" error, you need to regenerate your access token with the <code>catalog_management</code> permission:
                      </Text>
                      <Text as="p" variant="bodySm">
                        1. Go to <a href="https://developers.facebook.com/tools/explorer/" target="_blank" rel="noopener noreferrer" style={{color: "#2563eb"}}>Facebook Graph API Explorer</a>
                      </Text>
                      <Text as="p" variant="bodySm">
                        2. Select your app and click "Generate Access Token"
                      </Text>
                      <Text as="p" variant="bodySm">
                        3. In the permissions dialog, make sure to check <code>catalog_management</code> along with your other permissions
                      </Text>
                      <Text as="p" variant="bodySm">
                        4. Copy the new token and update it in your Dashboard settings
                      </Text>
                    </BlockStack>
                  </Banner>

                  <InlineStack gap="200">
                    <Button
                      variant="primary"
                      onClick={handleCreateCatalog}
                      loading={isLoading}
                      disabled={!catalogName.trim()}
                    >
                      Create Catalog
                    </Button>
                  </InlineStack>
                </BlockStack>
              )}
            </BlockStack>
          </Card>
        </Layout.Section>

        <Layout.Section>
          <Card>
            <BlockStack gap="300">
              <Text variant="headingMd" as="h2">
                About Facebook Catalogs
              </Text>

              <Text as="p" variant="bodyMd">
                Facebook catalogs allow you to organize your products for use in Facebook and Instagram ads.
                Once created, you can upload your Shopify products to the catalog for dynamic product ads.
              </Text>

              <BlockStack gap="200">
                <Text as="p" variant="bodyMd" fontWeight="medium">
                  Benefits of using catalogs:
                </Text>
                <Text as="p" variant="bodySm">
                  • Create dynamic product ads automatically
                </Text>
                <Text as="p" variant="bodySm">
                  • Show relevant products to interested customers
                </Text>
                <Text as="p" variant="bodySm">
                  • Improve ad performance with better targeting
                </Text>
                <Text as="p" variant="bodySm">
                  • Sync inventory and pricing automatically
                </Text>
              </BlockStack>
            </BlockStack>
          </Card>
        </Layout.Section>
      </Layout>
    </Page>
  );
}