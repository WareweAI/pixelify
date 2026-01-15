import { useState, useEffect, useCallback, useMemo } from "react";
import type { LoaderFunctionArgs } from "react-router";
import { useLoaderData, useSearchParams, useNavigate } from "react-router";
import { getShopifyInstance } from "../shopify.server";
import prisma from "../db.server";
import { ConversionsService } from "../services/conversions.server";
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
  Button,
  Spinner,
} from "@shopify/polaris";

export const loader = async ({ request }: LoaderFunctionArgs) => {
  const shopify = getShopifyInstance();
  const { session } = await shopify.authenticate.admin(request);
  const shop = session.shop;

  const user = await prisma.user.findUnique({
    where: { storeUrl: shop },
  });

  if (!user) {
    return {
      pixels: [],
    };
  }

  const pixels = await ConversionsService.getUserPixels(user.id);

  return {
    pixels,
  };
};

interface ConversionData {
  conversions: Array<{
    id: string;
    eventName: string;
    url?: string;
    pixelName: string;
    createdAt: Date;
    value?: number | null;
    currency?: string | null;
  }>;
  conversionStats: Array<{
    eventName: string;
    count: number;
  }>;
  totalPurchases: number;
  totalAddToCarts: number;
  totalCheckouts: number;
  totalViewContent: number;
  conversionRate: string;
  totalCount: number;
}

type Conversion = ConversionData['conversions'][0];

export default function ConversionsPage() {
  const { pixels } = useLoaderData<typeof loader>();
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();

  const [conversionData, setConversionData] = useState<ConversionData | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const selectedPixel = searchParams.get('pixel') || 'all';
  const timeRange = searchParams.get('range') || '30d';
  const page = parseInt(searchParams.get('page') || '1', 10);

  const fetchConversionData = useCallback(async () => {
    setLoading(true);
    setError("");

    try {
      const params = new URLSearchParams({
        range: timeRange,
        pixel: selectedPixel,
        page: page.toString(),
      });

      const res = await fetch(`/api/conversions?${params.toString()}`);
      const data = await res.json();

      if (data.error) {
        setError(data.error);
      } else {
        setConversionData(data);
      }
    } catch (err) {
      setError("Failed to load conversion data");
      console.error(err);
    } finally {
      setLoading(false);
    }
  }, [selectedPixel, timeRange, page]);

  useEffect(() => {
    fetchConversionData();
  }, [fetchConversionData]);

  const updateFilters = useCallback((pixel?: string, range?: string, page?: number) => {
    const params = new URLSearchParams(searchParams);
    if (pixel !== undefined) params.set('pixel', pixel);
    if (range !== undefined) params.set('range', range);
    if (page !== undefined) params.set('page', page.toString());
    navigate(`?${params.toString()}`, { replace: true });
  }, [searchParams, navigate]);

  // Memoize options to prevent unnecessary re-renders
  const pixelOptions = useMemo(() => [
    { label: "All Pixels", value: "all" },
    ...pixels.map((pixel: any) => ({
      label: pixel.name,
      value: pixel.appId,
    })),
  ], [pixels]);

  const timeRangeOptions = useMemo(() => [
    { label: "Last 7 days", value: "7d" },
    { label: "Last 30 days", value: "30d" },
    { label: "Last 90 days", value: "90d" },
  ], []);

  // Memoize event labels
  const eventLabels: Record<string, string> = useMemo(() => ({
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
  }), []);

  // Memoize table rows to prevent recalculation on every render
  const tableRows = useMemo(() => {
    if (!conversionData?.conversions) return [];
    return (conversionData.conversions || []).map((conversion: Conversion) => [
      eventLabels[conversion.eventName] || conversion.eventName,
      conversion.pixelName || 'Unknown',
      conversion.url ? new URL(conversion.url).pathname : "-",
      conversion.value ? `${conversion.currency || 'USD'} ${conversion.value}` : "-",
      conversion.createdAt ? new Date(conversion.createdAt).toISOString().replace('T', ' ').split('.')[0] : "-",
    ]);
  }, [conversionData?.conversions, eventLabels]);

  // Memoize pagination info
  const paginationInfo = useMemo(() => {
    if (!conversionData) return { totalPages: 1, startPage: 1 };
    const totalPages = Math.ceil(conversionData.totalCount / 15);
    const startPage = Math.max(1, Math.min(totalPages - 9, page - 4));
    return { totalPages, startPage };
  }, [conversionData?.totalCount, page]);

  // Loading state component - CENTERED
  if (loading && !conversionData) {
    return (
      <Page
        title="Conversions"
        subtitle="Track and analyze your Facebook Pixel conversions"
      >
        <Layout>
          <Layout.Section>
            <Card>
              <div style={{ 
                display: 'flex', 
                justifyContent: 'center', 
                alignItems: 'center', 
                minHeight: '400px',
                flexDirection: 'column',
                gap: '16px'
              }}>
                <Spinner size="large" />
                <Text variant="bodyMd" as="p" alignment="center">Loading conversion data...</Text>
              </div>
            </Card>
          </Layout.Section>
        </Layout>
      </Page>
    );
  }

  // Error state
  if (error && !conversionData) {
    return (
      <Page
        title="Conversions"
        subtitle="Track and analyze your Facebook Pixel conversions"
      >
        <Layout>
          <Layout.Section>
            <Card>
              <EmptyState
                heading="Error loading conversions"
                image="https://cdn.shopify.com/s/files/1/0262/4071/2726/files/emptystate-files.png"
              >
                <p>{error}</p>
                <Button onClick={fetchConversionData}>Try Again</Button>
              </EmptyState>
            </Card>
          </Layout.Section>
        </Layout>
      </Page>
    );
  }

  const {
    conversions = [],
    conversionStats = [],
    totalPurchases = 0,
    totalAddToCarts = 0,
    totalCheckouts = 0,
    totalViewContent = 0,
    conversionRate = "0.00",
    totalCount = 0,
  } = conversionData || {};

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
              <div style={{ minWidth: "200px", flex: 1 }}>
                <Select
                  label="Select Pixel"
                  options={pixelOptions}
                  value={selectedPixel}
                  disabled={loading}
                  onChange={(value) => {
                    setLoading(true);
                    updateFilters(value, undefined, 1);
                  }}
                />
              </div>
              <div style={{ minWidth: "150px", flex: 1 }}>
                <Select
                  label="Time Range"
                  options={timeRangeOptions}
                  value={timeRange}
                  disabled={loading}
                  onChange={(value) => {
                    setLoading(true);
                    updateFilters(undefined, value, 1);
                  }}
                />
              </div>
              {loading && (
                <div style={{ 
                  display: 'flex', 
                  alignItems: 'flex-end', 
                  paddingBottom: '8px' 
                }}>
                  <Spinner size="small" />
                </div>
              )}
            </InlineStack>
          </Card>
        </Layout.Section>

        {/* Show centered loader when filtering */}
        {loading && conversionData && (
          <Layout.Section>
            <Card>
              <div style={{ 
                display: 'flex', 
                justifyContent: 'center', 
                alignItems: 'center', 
                minHeight: '200px',
                flexDirection: 'column',
                gap: '16px'
              }}>
                <Spinner size="large" />
                <Text variant="bodyMd" as="p" alignment="center">Updating data...</Text>
              </div>
            </Card>
          </Layout.Section>
        )}

        {/* Conversion Overview */}
        {!loading && (
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
        )}

        {/* Conversion Funnel */}
        {!loading && (
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
        )}

        {/* Debug Section - Show what events are in database */}
        {!loading && (
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
        )}

        {/* Recent Conversions */}
        {!loading && (
          <Layout.Section>
            <Card>
              <BlockStack gap="400">
                <Text variant="headingMd" as="h2">Recent Conversions</Text>

                {tableRows.length === 0 ? (
                  <EmptyState
                    heading="No conversions yet"
                    image="https://cdn.shopify.com/s/files/1/0262/4071/2726/files/emptystate-files.png"
                  >
                    <p>Start tracking conversions by adding Facebook Pixels to your store.</p>
                  </EmptyState>
                ) : (
                  <>
                    <DataTable
                      columnContentTypes={['text', 'text', 'text', 'text', 'text']}
                      headings={['Event', 'Pixel', 'Page', 'Value', 'Date']}
                      rows={tableRows}
                    />
                    {totalCount > 15 && (
                      <div style={{ marginTop: '16px', display: 'flex', justifyContent: 'center', gap: '8px', alignItems: 'center' }}>
                        <Button
                          disabled={page <= 1}
                          onClick={() => updateFilters(undefined, undefined, page - 1)}
                        >
                          Previous
                        </Button>
                        <Text variant="bodySm" as="span">Page {page} of {paginationInfo.totalPages}</Text>
                        {Array.from({ length: Math.min(10, paginationInfo.totalPages) }, (_, i) => {
                          const p = paginationInfo.startPage + i;
                          if (p > paginationInfo.totalPages) return null;
                          return (
                            <Button
                              key={p}
                              variant={p === page ? 'primary' : 'secondary'}
                              onClick={() => updateFilters(undefined, undefined, p)}
                            >
                              {p.toString()}
                            </Button>
                          );
                        })}
                        <Button
                          disabled={page * 15 >= totalCount}
                          onClick={() => updateFilters(undefined, undefined, page + 1)}
                        >
                          Next
                        </Button>
                      </div>
                    )}
                  </>
                )}
              </BlockStack>
            </Card>
          </Layout.Section>
        )}

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