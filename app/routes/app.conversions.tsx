import { useState, useEffect, useCallback } from "react";
import type { LoaderFunctionArgs } from "react-router";
import { useLoaderData } from "react-router";
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
  Badge,
  EmptyState,
  DataTable,
  Box,
  Divider,
} from "@shopify/polaris";

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
    return { pixels: [], conversions: [], conversionStats: [] };
  }

  const pixels = await prisma.app.findMany({
    where: { userId: user.id },
    include: { settings: true },
  });

  // Get conversion events (purchases, add to cart, etc.)
  const conversions = await prisma.event.findMany({
    where: {
      app: {
        userId: user.id,
      },
      eventName: {
        in: ['purchase', 'add_to_cart', 'initiate_checkout', 'add_payment_info', 'view_content']
      },
    },
    orderBy: { createdAt: 'desc' },
    take: 100,
    include: {
      app: {
        select: { name: true, appId: true },
      },
    },
  });

  // Calculate conversion metrics
  const last30Days = new Date();
  last30Days.setDate(last30Days.getDate() - 30);

  const conversionStats = await prisma.event.groupBy({
    by: ['eventName'],
    where: {
      app: {
        userId: user.id,
      },
      eventName: {
        in: ['purchase', 'add_to_cart', 'initiate_checkout', 'add_payment_info', 'view_content']
      },
      createdAt: { gte: last30Days },
    },
    _count: true,
  });

  return {
    pixels,
    conversions: conversions.map(c => ({
      id: c.id,
      eventName: c.eventName,
      url: c.url,
      pixelName: c.app.name,
      createdAt: c.createdAt,
      value: c.value,
      currency: c.currency,
    })),
    conversionStats: conversionStats.map(s => ({
      eventName: s.eventName,
      count: s._count,
    })),
  };
};

export default function ConversionsPage() {
  const { pixels, conversions, conversionStats } = useLoaderData<typeof loader>();
  const [selectedPixel, setSelectedPixel] = useState("all");
  const [timeRange, setTimeRange] = useState("30d");

  const pixelOptions = [
    { label: "All Pixels", value: "all" },
    ...pixels.map((pixel: any) => ({
      label: pixel.name,
      value: pixel.appId,
    })),
  ];

  const timeRangeOptions = [
    { label: "Last 7 days", value: "7d" },
    { label: "Last 30 days", value: "30d" },
    { label: "Last 90 days", value: "90d" },
  ];

  // Filter conversions based on selected pixel
  const filteredConversions = selectedPixel === "all"
    ? conversions
    : conversions.filter((c: any) => {
      const pixel = pixels.find((p: any) => p.name === c.pixelName);
      return pixel?.appId === selectedPixel;
    });

  // Conversion event mapping
  const eventLabels: Record<string, string> = {
    purchase: "Purchase",
    add_to_cart: "Add to Cart",
    initiate_checkout: "Initiate Checkout",
    add_payment_info: "Add Payment Info",
    view_content: "View Content",
  };

  // Calculate totals
  const totalPurchases = conversionStats.find(s => s.eventName === 'purchase')?.count || 0;
  const totalAddToCarts = conversionStats.find(s => s.eventName === 'add_to_cart')?.count || 0;
  const totalCheckouts = conversionStats.find(s => s.eventName === 'initiate_checkout')?.count || 0;
  const totalViewContent = conversionStats.find(s => s.eventName === 'view_content')?.count || 0;

  // Calculate conversion rate
  const conversionRate = totalViewContent > 0 ? ((totalPurchases / totalViewContent) * 100).toFixed(2) : "0.00";

  // Prepare data for table
  const tableRows = filteredConversions.map((conversion: any) => [
    eventLabels[conversion.eventName] || conversion.eventName,
    conversion.pixelName,
    conversion.url ? new URL(conversion.url).pathname : "-",
    conversion.value ? `${conversion.currency || 'USD'} ${conversion.value}` : "-",
    new Date(conversion.createdAt).toLocaleString(),
  ]);

  return (
    <Page
      title="Conversions"
      subtitle="Track and analyze your Facebook Pixel conversions"
    >
      <Layout>
        {/* Filters */}
        <Layout.Section>
          <Card>
            <InlineStack gap="400" wrap={false}>
              <div style={{ minWidth: "200px" }}>
                <Select
                  label="Select Pixel"
                  options={pixelOptions}
                  value={selectedPixel}
                  onChange={setSelectedPixel}
                />
              </div>
              <div style={{ minWidth: "150px" }}>
                <Select
                  label="Time Range"
                  options={timeRangeOptions}
                  value={timeRange}
                  onChange={setTimeRange}
                />
              </div>
            </InlineStack>
          </Card>
        </Layout.Section>

        {/* Conversion Overview */}
        <Layout.Section>
          <Card>
            <BlockStack gap="400">
              <Text variant="headingMd" as="h2">Conversion Overview</Text>

              <InlineStack gap="400" wrap={false}>
                <Card background="bg-surface-secondary">
                  <BlockStack gap="200">
                    <Text variant="bodySm" as="p" tone="subdued">
                      Total Purchases
                    </Text>
                    <Text variant="headingXl" as="p">
                      {totalPurchases.toLocaleString()}
                    </Text>
                  </BlockStack>
                </Card>

                <Card background="bg-surface-secondary">
                  <BlockStack gap="200">
                    <Text variant="bodySm" as="p" tone="subdued">
                      Add to Carts
                    </Text>
                    <Text variant="headingXl" as="p">
                      {totalAddToCarts.toLocaleString()}
                    </Text>
                  </BlockStack>
                </Card>

                <Card background="bg-surface-secondary">
                  <BlockStack gap="200">
                    <Text variant="bodySm" as="p" tone="subdued">
                      Checkouts Started
                    </Text>
                    <Text variant="headingXl" as="p">
                      {totalCheckouts.toLocaleString()}
                    </Text>
                  </BlockStack>
                </Card>

                <Card background="bg-surface-secondary">
                  <BlockStack gap="200">
                    <Text variant="bodySm" as="p" tone="subdued">
                      Conversion Rate
                    </Text>
                    <Text variant="headingXl" as="p">
                      {conversionRate}%
                    </Text>
                  </BlockStack>
                </Card>
              </InlineStack>
            </BlockStack>
          </Card>
        </Layout.Section>

        {/* Conversion Funnel */}
        <Layout.Section>
          <Card>
            <BlockStack gap="400">
              <Text variant="headingMd" as="h2">Conversion Funnel</Text>

              <BlockStack gap="300">
                <InlineStack align="space-between" blockAlign="center">
                  <InlineStack gap="200" blockAlign="center">
                    <div style={{
                      width: "12px",
                      height: "12px",
                      backgroundColor: "#3b82f6",
                      borderRadius: "50%"
                    }} />
                    <Text as="p">Page Views</Text>
                  </InlineStack>
                  <Text as="p" fontWeight="bold">{totalViewContent.toLocaleString()}</Text>
                </InlineStack>

                <Divider />

                <InlineStack align="space-between" blockAlign="center">
                  <InlineStack gap="200" blockAlign="center">
                    <div style={{
                      width: "12px",
                      height: "12px",
                      backgroundColor: "#10b981",
                      borderRadius: "50%"
                    }} />
                    <Text as="p">Add to Cart</Text>
                  </InlineStack>
                  <Text as="p" fontWeight="bold">{totalAddToCarts.toLocaleString()}</Text>
                </InlineStack>

                <Divider />

                <InlineStack align="space-between" blockAlign="center">
                  <InlineStack gap="200" blockAlign="center">
                    <div style={{
                      width: "12px",
                      height: "12px",
                      backgroundColor: "#f59e0b",
                      borderRadius: "50%"
                    }} />
                    <Text as="p">Initiate Checkout</Text>
                  </InlineStack>
                  <Text as="p" fontWeight="bold">{totalCheckouts.toLocaleString()}</Text>
                </InlineStack>

                <Divider />

                <InlineStack align="space-between" blockAlign="center">
                  <InlineStack gap="200" blockAlign="center">
                    <div style={{
                      width: "12px",
                      height: "12px",
                      backgroundColor: "#ef4444",
                      borderRadius: "50%"
                    }} />
                    <Text as="p">Purchase</Text>
                  </InlineStack>
                  <Text as="p" fontWeight="bold">{totalPurchases.toLocaleString()}</Text>
                </InlineStack>
              </BlockStack>
            </BlockStack>
          </Card>
        </Layout.Section>

        {/* Recent Conversions */}
        <Layout.Section>
          <Card>
            <BlockStack gap="400">
              <Text variant="headingMd" as="h2">Recent Conversions</Text>

              {filteredConversions.length === 0 ? (
                <EmptyState
                  heading="No conversions yet"
                  image="https://cdn.shopify.com/s/files/1/0262/4071/2726/files/emptystate-files.png"
                >
                  <p>Start tracking conversions by adding Facebook Pixels to your store.</p>
                </EmptyState>
              ) : (
                <DataTable
                  columnContentTypes={['text', 'text', 'text', 'text', 'text']}
                  headings={['Event', 'Pixel', 'Page', 'Value', 'Date']}
                  rows={tableRows}
                  pagination={{
                    hasNext: false,
                    hasPrevious: false,
                    onNext: () => { },
                    onPrevious: () => { },
                  }}
                />
              )}
            </BlockStack>
          </Card>
        </Layout.Section>

        {/* Conversion Tips */}
        <Layout.Section>
          <Card>
            <BlockStack gap="400">
              <Text variant="headingMd" as="h2">Optimization Tips</Text>

              <BlockStack gap="300">
                <InlineStack gap="200" blockAlign="start">
                  <div style={{ minWidth: "24px" }}>💡</div>
                  <BlockStack gap="100">
                    <Text as="p" fontWeight="bold">Improve Add to Cart Rate</Text>
                    <Text as="p" variant="bodySm" tone="subdued">
                      Use retargeting ads to show products to people who viewed them but didn't add to cart
                    </Text>
                  </BlockStack>
                </InlineStack>

                <InlineStack gap="200" blockAlign="start">
                  <div style={{ minWidth: "24px" }}>💡</div>
                  <BlockStack gap="100">
                    <Text as="p" fontWeight="bold">Reduce Cart Abandonment</Text>
                    <Text as="p" variant="bodySm" tone="subdued">
                      Create ads targeting people who added to cart but didn't complete purchase
                    </Text>
                  </BlockStack>
                </InlineStack>

                <InlineStack gap="200" blockAlign="start">
                  <div style={{ minWidth: "24px" }}>💡</div>
                  <BlockStack gap="100">
                    <Text as="p" fontWeight="bold">Build Lookalike Audiences</Text>
                    <Text as="p" variant="bodySm" tone="subdued">
                      Use your purchaser data to find similar customers who are likely to buy
                    </Text>
                  </BlockStack>
                </InlineStack>
              </BlockStack>
            </BlockStack>
          </Card>
        </Layout.Section>
      </Layout>
    </Page>
  );
}