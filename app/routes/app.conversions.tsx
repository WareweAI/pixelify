import { useState } from "react";
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
    where: { storeUrl: shop },
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
        in: [
          'purchase', 'Purchase',
          'addToCart', 'add_to_cart', 'AddToCart', 
          'initiateCheckout', 'initiate_checkout', 'InitiateCheckout',
          'add_payment_info', 'AddPaymentInfo',
          'viewContent', 'view_content', 'ViewContent',
          'pageview', 'page_view'
        ]
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
        in: [
          'purchase', 'Purchase',
          'addToCart', 'add_to_cart', 'AddToCart', 
          'initiateCheckout', 'initiate_checkout', 'InitiateCheckout',
          'add_payment_info', 'AddPaymentInfo',
          'viewContent', 'view_content', 'ViewContent',
          'pageview', 'page_view'
        ]
      },
      createdAt: { gte: last30Days },
    },
    _count: true,
  });

  return {
    pixels,
    conversions: conversions.map((c: any) => ({
      id: c.id,
      eventName: c.eventName,
      url: c.url || '',
      pixelName: c.app?.name || 'Unknown',
      createdAt: c.createdAt,
      value: c.value || null,
      currency: c.currency || null,
    })),
    conversionStats: conversionStats.map((s: any) => ({
      eventName: s.eventName,
      count: s._count || 0,
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

  const filteredConversions = selectedPixel === "all"
    ? conversions || []
    : (conversions || []).filter((c: any) => {
      const pixel = pixels.find((p: any) => p.name === c.pixelName);
      return pixel?.appId === selectedPixel;
    });

  // Conversion event mapping (handle multiple variations)
  const eventLabels: Record<string, string> = {
    purchase: "Purchase",
    Purchase: "Purchase",
    addToCart: "Add to Cart",
    add_to_cart: "Add to Cart", 
    AddToCart: "Add to Cart",
    initiateCheckout: "Initiate Checkout",
    initiate_checkout: "Initiate Checkout",
    InitiateCheckout: "Initiate Checkout",
    add_payment_info: "Add Payment Info",
    AddPaymentInfo: "Add Payment Info",
    viewContent: "View Content",
    view_content: "View Content",
    ViewContent: "View Content",
    pageview: "Page View",
    page_view: "Page View",
  };

  // Calculate totals (handle multiple event name variations)
  const purchaseEvents = ['purchase', 'Purchase'];
  const addToCartEvents = ['addToCart', 'add_to_cart', 'AddToCart'];
  const checkoutEvents = ['initiateCheckout', 'initiate_checkout', 'InitiateCheckout'];
  const viewContentEvents = ['viewContent', 'view_content', 'ViewContent', 'pageview', 'page_view'];

  const totalPurchases = conversionStats
    .filter((s: any) => purchaseEvents.includes(s.eventName))
    .reduce((sum: number, s: any) => sum + (s.count || 0), 0);
    
  const totalAddToCarts = conversionStats
    .filter((s: any) => addToCartEvents.includes(s.eventName))
    .reduce((sum: number, s: any) => sum + (s.count || 0), 0);
    
  const totalCheckouts = conversionStats
    .filter((s: any) => checkoutEvents.includes(s.eventName))
    .reduce((sum: number, s: any) => sum + (s.count || 0), 0);
    
  const totalViewContent = conversionStats
    .filter((s: any) => viewContentEvents.includes(s.eventName))
    .reduce((sum: number, s: any) => sum + (s.count || 0), 0);

  // Calculate conversion rate (ensure no division by zero)
  const conversionRate = totalViewContent > 0 ? ((totalPurchases / totalViewContent) * 100).toFixed(2) : "0.00";

  // Prepare data for table
  const tableRows = (filteredConversions || []).map((conversion: any) => [
    eventLabels[conversion.eventName] || conversion.eventName,
    conversion.pixelName || 'Unknown',
    conversion.url ? new URL(conversion.url).pathname : "-",
    conversion.value ? `${conversion.currency || 'USD'} ${conversion.value}` : "-",
    conversion.createdAt ? new Date(conversion.createdAt).toISOString().replace('T', ' ').split('.')[0] : "-",
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

        {/* Debug Section - Show what events are in database */}
        <Layout.Section>
          <Card>
            <BlockStack gap="400">
              <Text variant="headingMd" as="h2">🔍 Debug: Events in Database</Text>
              <Text variant="bodySm" as="p" tone="subdued">
                This shows what events are actually being tracked. If you don't see conversions above, check if the event names match.
              </Text>
              
              {conversionStats.length > 0 ? (
                <div>
                  <Text variant="bodyMd" as="p" fontWeight="bold">Event Types Found:</Text>
                  <div style={{ marginTop: '8px' }}>
                    {conversionStats.map((stat: any, index: number) => (
                      <div key={index} style={{
                        display: 'flex',
                        justifyContent: 'space-between',
                        padding: '4px 0',
                        borderBottom: index < conversionStats.length - 1 ? '1px solid #e2e8f0' : 'none'
                      }}>
                        <Text as="span" variant="bodySm">{stat.eventName}</Text>
                        <Badge>{`${stat.count} events`}</Badge>
                      </div>
                    ))}
                  </div>
                </div>
              ) : (
                <EmptyState
                  heading="No events found"
                  image="https://cdn.shopify.com/s/files/1/0262/4071/2726/files/emptystate-files.png"
                >
                  <p>No conversion events have been tracked yet. Make sure your pixel is installed and events are being sent.</p>
                </EmptyState>
              )}
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