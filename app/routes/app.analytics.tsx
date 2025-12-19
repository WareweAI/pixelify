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
  EmptyState,
  Spinner,
  Box,
  Badge,
  ProgressBar,
} from "@shopify/polaris";
// ClientOnly removed - Polaris components work with SSR

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
    select: { id: true, appId: true, name: true },
  });

  return { apps };
};

interface AnalyticsData {
  overview: {
    totalEvents: number;
    pageviews: number;
    uniqueVisitors: number;
    sessions: number;
  };
  topPages: Array<{ url: string; count: number }>;
  topReferrers: Array<{ referrer: string; count: number }>;
  topCountries: Array<{ country: string; count: number }>;
  topBrowsers: Array<{ browser: string; count: number }>;
  deviceTypes: Array<{ type: string; count: number }>;
  topEvents: Array<{ event: string; count: number }>;
  dailyStats: Array<{
    date: string;
    pageviews: number;
    uniqueUsers: number;
    sessions: number;
  }>;
}

export default function AnalyticsPage() {
  const { apps } = useLoaderData<typeof loader>();
  const [selectedApp, setSelectedApp] = useState(apps[0]?.appId || "");
  const [dateRange, setDateRange] = useState("7d");
  const [analytics, setAnalytics] = useState<AnalyticsData | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const fetchAnalytics = useCallback(async () => {
    if (!selectedApp) return;

    setLoading(true);
    setError("");

    try {
      const res = await fetch(`/api/analytics?appId=${selectedApp}&range=${dateRange}`);
      const data = await res.json();

      if (data.error) {
        setError(data.error);
      } else {
        setAnalytics(data);
      }
    } catch (err) {
      setError("Failed to load analytics");
      console.error(err);
    } finally {
      setLoading(false);
    }
  }, [selectedApp, dateRange]);

  useEffect(() => {
    fetchAnalytics();
  }, [fetchAnalytics]);

  const appOptions = apps.map((app: { appId: string; name: string }) => ({
    label: app.name,
    value: app.appId,
  }));

  const dateRangeOptions = [
    { label: "Last 24 hours", value: "24h" },
    { label: "Last 7 days", value: "7d" },
    { label: "Last 30 days", value: "30d" },
    { label: "Last 90 days", value: "90d" },
  ];

  // Calculate max for progress bars
  const maxPageCount = analytics?.topPages?.reduce((max, p) => Math.max(max, p.count), 1) || 1;
  const maxCountryCount = analytics?.topCountries?.reduce((max, c) => Math.max(max, c.count), 1) || 1;
  const maxBrowserCount = analytics?.topBrowsers?.reduce((max, b) => Math.max(max, b.count), 1) || 1;
  const maxEventCount = analytics?.topEvents?.reduce((max, e) => Math.max(max, e.count), 1) || 1;

  if (apps.length === 0) {
    return (
      <Page title="Analytics">
        <Layout>
          <Layout.Section>
            <Card>
              <EmptyState
                heading="No pixels created"
                action={{ content: "Go to Dashboard", url: "/app/dashboard" }}
                image="https://cdn.shopify.com/s/files/1/0262/4071/2726/files/emptystate-files.png"
              >
                <p>Create a pixel first to view analytics.</p>
              </EmptyState>
            </Card>
          </Layout.Section>
        </Layout>
      </Page>
    );
  }

  return (
    <Page title="Analytics">
        <Layout>
          {/* Filters */}
          <Layout.Section>
            <Card>
              <InlineStack gap="400" wrap={false}>
                <div style={{ minWidth: "200px" }}>
                  <Select
                    label="Select Pixel"
                    options={appOptions}
                    value={selectedApp}
                    onChange={setSelectedApp}
                  />
                </div>
                <div style={{ minWidth: "200px" }}>
                  <Select
                    label="Date Range"
                    options={dateRangeOptions}
                    value={dateRange}
                    onChange={setDateRange}
                  />
                </div>
              </InlineStack>
            </Card>
          </Layout.Section>

          {loading ? (
            <Layout.Section>
              <Card>
                <BlockStack gap="400" inlineAlign="center">
                  <Spinner size="large" />
                  <Text as="p">Loading analytics...</Text>
                </BlockStack>
              </Card>
            </Layout.Section>
          ) : error ? (
            <Layout.Section>
              <Card>
                <Text as="p" tone="critical">{error}</Text>
              </Card>
            </Layout.Section>
          ) : analytics ? (
            <>
              {/* Overview Stats */}
              <Layout.Section>
                <InlineStack gap="400" wrap={false}>
                  <div style={{ flex: 1 }}>
                    <Card>
                      <BlockStack gap="200">
                        <Text variant="bodySm" as="p" tone="subdued">
                          Total Events
                        </Text>
                        <Text variant="heading2xl" as="p">
                          {analytics.overview.totalEvents.toLocaleString()}
                        </Text>
                      </BlockStack>
                    </Card>
                  </div>
                  <div style={{ flex: 1 }}>
                    <Card>
                      <BlockStack gap="200">
                        <Text variant="bodySm" as="p" tone="subdued">
                          Pageviews
                        </Text>
                        <Text variant="heading2xl" as="p">
                          {analytics.overview.pageviews.toLocaleString()}
                        </Text>
                      </BlockStack>
                    </Card>
                  </div>
                  <div style={{ flex: 1 }}>
                    <Card>
                      <BlockStack gap="200">
                        <Text variant="bodySm" as="p" tone="subdued">
                          Unique Visitors
                        </Text>
                        <Text variant="heading2xl" as="p">
                          {analytics.overview.uniqueVisitors.toLocaleString()}
                        </Text>
                      </BlockStack>
                    </Card>
                  </div>
                  <div style={{ flex: 1 }}>
                    <Card>
                      <BlockStack gap="200">
                        <Text variant="bodySm" as="p" tone="subdued">
                          Sessions
                        </Text>
                        <Text variant="heading2xl" as="p">
                          {analytics.overview.sessions.toLocaleString()}
                        </Text>
                      </BlockStack>
                    </Card>
                  </div>
                </InlineStack>
              </Layout.Section>

              {/* Top Pages */}
              <Layout.Section variant="oneHalf">
                <Card>
                  <BlockStack gap="400">
                    <Text variant="headingMd" as="h2">Top Pages</Text>
                    {analytics.topPages.length > 0 ? (
                      <BlockStack gap="300">
                        {analytics.topPages.slice(0, 5).map((page, idx) => {
                          let pathname = "-";
                          try {
                            pathname = page.url ? new URL(page.url).pathname : "-";
                          } catch {
                            pathname = page.url || "-";
                          }
                          return (
                            <BlockStack key={idx} gap="100">
                              <InlineStack align="space-between">
                                <Text as="p" truncate>{pathname}</Text>
                                <Text as="p" tone="subdued">{page.count}</Text>
                              </InlineStack>
                              <ProgressBar progress={(page.count / maxPageCount) * 100} size="small" />
                            </BlockStack>
                          );
                        })}
                      </BlockStack>
                    ) : (
                      <Text as="p" tone="subdued">No data yet</Text>
                    )}
                  </BlockStack>
                </Card>
              </Layout.Section>

              {/* Top Countries */}
              <Layout.Section variant="oneHalf">
                <Card>
                  <BlockStack gap="400">
                    <Text variant="headingMd" as="h2">Top Countries</Text>
                    {analytics.topCountries.length > 0 ? (
                      <BlockStack gap="300">
                        {analytics.topCountries.slice(0, 5).map((country, idx) => (
                          <BlockStack key={idx} gap="100">
                            <InlineStack align="space-between">
                              <Text as="p">{country.country || "Unknown"}</Text>
                              <Text as="p" tone="subdued">{country.count}</Text>
                            </InlineStack>
                            <ProgressBar progress={(country.count / maxCountryCount) * 100} size="small" tone="primary" />
                          </BlockStack>
                        ))}
                      </BlockStack>
                    ) : (
                      <Text as="p" tone="subdued">No data yet</Text>
                    )}
                  </BlockStack>
                </Card>
              </Layout.Section>

              {/* Top Browsers */}
              <Layout.Section variant="oneHalf">
                <Card>
                  <BlockStack gap="400">
                    <Text variant="headingMd" as="h2">Browsers</Text>
                    {analytics.topBrowsers.length > 0 ? (
                      <BlockStack gap="300">
                        {analytics.topBrowsers.slice(0, 5).map((browser, idx) => (
                          <BlockStack key={idx} gap="100">
                            <InlineStack align="space-between">
                              <Text as="p">{browser.browser || "Unknown"}</Text>
                              <Text as="p" tone="subdued">{browser.count}</Text>
                            </InlineStack>
                            <ProgressBar progress={(browser.count / maxBrowserCount) * 100} size="small" tone="success" />
                          </BlockStack>
                        ))}
                      </BlockStack>
                    ) : (
                      <Text as="p" tone="subdued">No data yet</Text>
                    )}
                  </BlockStack>
                </Card>
              </Layout.Section>

              {/* Device Types */}
              <Layout.Section variant="oneHalf">
                <Card>
                  <BlockStack gap="400">
                    <Text variant="headingMd" as="h2">Devices</Text>
                    {analytics.deviceTypes.length > 0 ? (
                      <InlineStack gap="200" wrap>
                        {analytics.deviceTypes.map((device, idx) => (
                          <Badge
                            key={String(idx)}
                            tone={device.type === "mobile" ? "info" : device.type === "tablet" ? "warning" : "success"}
                          >
                            {`${device.type || "Unknown"}: ${device.count}`}
                          </Badge>
                        ))}
                      </InlineStack>
                    ) : (
                      <Text as="p" tone="subdued">No data yet</Text>
                    )}
                  </BlockStack>
                </Card>
              </Layout.Section>

              {/* Top Events */}
              <Layout.Section variant="oneHalf">
                <Card>
                  <BlockStack gap="400">
                    <Text variant="headingMd" as="h2">Top Events</Text>
                    {analytics.topEvents.length > 0 ? (
                      <BlockStack gap="300">
                        {analytics.topEvents.slice(0, 5).map((event, idx) => (
                          <BlockStack key={idx} gap="100">
                            <InlineStack align="space-between">
                              <Badge>{event.event}</Badge>
                              <Text as="p" tone="subdued">{event.count}</Text>
                            </InlineStack>
                            <ProgressBar progress={(event.count / maxEventCount) * 100} size="small" tone="critical" />
                          </BlockStack>
                        ))}
                      </BlockStack>
                    ) : (
                      <Text as="p" tone="subdued">No custom events yet</Text>
                    )}
                  </BlockStack>
                </Card>
              </Layout.Section>

              {/* Top Referrers */}
              <Layout.Section variant="oneHalf">
                <Card>
                  <BlockStack gap="400">
                    <Text variant="headingMd" as="h2">Top Referrers</Text>
                    {analytics.topReferrers.length > 0 ? (
                      <BlockStack gap="200">
                        {analytics.topReferrers.slice(0, 5).map((ref, idx) => {
                          let domain = ref.referrer || "Direct";
                          try {
                            if (ref.referrer) {
                              domain = new URL(ref.referrer).hostname;
                            }
                          } catch {
                            domain = ref.referrer || "Direct";
                          }
                          return (
                            <InlineStack key={idx} align="space-between">
                              <Text as="p" truncate>{domain}</Text>
                              <Text as="p" tone="subdued">{ref.count}</Text>
                            </InlineStack>
                          );
                        })}
                      </BlockStack>
                    ) : (
                      <Text as="p" tone="subdued">No referrer data yet</Text>
                    )}
                  </BlockStack>
                </Card>
              </Layout.Section>

              {/* Daily Chart Placeholder */}
              {analytics.dailyStats.length > 0 && (
                <Layout.Section>
                  <Card>
                    <BlockStack gap="400">
                      <Text variant="headingMd" as="h2">Daily Pageviews</Text>
                      <Box padding="400" background="bg-surface-secondary" borderRadius="200">
                        <InlineStack gap="100" align="end" blockAlign="end">
                          {analytics.dailyStats.map((day, idx) => {
                            const maxPv = Math.max(...analytics.dailyStats.map(d => d.pageviews), 1);
                            const height = Math.max((day.pageviews / maxPv) * 100, 5);
                            return (
                              <div
                                key={idx}
                                style={{
                                  width: `${100 / analytics.dailyStats.length - 1}%`,
                                  minWidth: "20px",
                                  height: `${height}px`,
                                  backgroundColor: "#0f62fe",
                                  borderRadius: "4px 4px 0 0",
                                  display: "flex",
                                  alignItems: "flex-start",
                                  justifyContent: "center",
                                }}
                                title={`${day.date}: ${day.pageviews} pageviews`}
                              />
                            );
                          })}
                        </InlineStack>
                        <InlineStack gap="100" align="space-between">
                          {analytics.dailyStats.length > 0 && (
                            <>
                              <Text variant="bodySm" as="span" tone="subdued">
                                {analytics.dailyStats[0]?.date}
                              </Text>
                              <Text variant="bodySm" as="span" tone="subdued">
                                {analytics.dailyStats[analytics.dailyStats.length - 1]?.date}
                              </Text>
                            </>
                          )}
                        </InlineStack>
                      </Box>
                    </BlockStack>
                  </Card>
                </Layout.Section>
              )}
            </>
          ) : (
            <Layout.Section>
              <Card>
                <Text as="p" tone="subdued">Select a pixel to view analytics</Text>
              </Card>
            </Layout.Section>
          )}
        </Layout>
      </Page>
  );
} 