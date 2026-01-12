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
    ProgressBar,
    Button,
    Icon,
    Grid,
    DataTable,
    Tooltip,
  } from "@shopify/polaris";
  import {
    AlertTriangleIcon,
    ViewIcon,
    PersonIcon,
    ClockIcon,
    DesktopIcon,
    MobileIcon,
    TabletIcon,
    CheckIcon,
    OrderIcon,
    ExportIcon
  } from "@shopify/polaris-icons";

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
        settings: {
          select: {
            metaPixelId: true,
          },
        },
      },
    });

    return { apps };
  };

  interface AnalyticsData {
    app: {
      id: string;
      name: string;
      appId: string;
    };
    range: string;
    overview: {
      totalEvents: number;
      pageviews: number;
      uniqueVisitors: number;
      sessions: number;
      totalRevenue: number;
      currency: string;
      addToCartEvents: number;
      initiateCheckoutEvents: number;
      purchaseEvents: number;
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
    const [conversionRows, setConversionRows] = useState<any[]>([]);
    const [conversionLoading, setConversionLoading] = useState(false);
    const [conversionError, setConversionError] = useState("");

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

    const fetchConversionTable = useCallback(async () => {
      if (!apps || apps.length === 0) return;

      setConversionLoading(true);
      setConversionError("");

      try {
        const results = await Promise.all(
          apps.map(async (app: any) => {
            try {
              const res = await fetch(`/api/analytics?appId=${app.appId}&range=${dateRange}`);
              const data = await res.json();

              if (data.error || !data.overview) {
                return null;
              }

              const overview = data.overview as AnalyticsData["overview"];
              const atc = overview.addToCartEvents || 0;
              const ic = overview.initiateCheckoutEvents || 0;
              const pur = overview.purchaseEvents || 0;

              const atcToIc = atc > 0 ? (ic / atc) * 100 : 0;
              const icToPur = ic > 0 ? (pur / ic) * 100 : 0;

              const currency = overview.currency || "USD";
              const metaPixelId = app.settings?.metaPixelId || "—";

              return [
                app.name,
                app.appId,
                metaPixelId,
                atc.toLocaleString(),
                ic.toLocaleString(),
                pur.toLocaleString(),
                `${atcToIc.toFixed(2)}%`,
                `${icToPur.toFixed(2)}%`,
                `${currency} ${overview.totalRevenue.toFixed(3)}`,
                overview.totalEvents.toLocaleString(),
              ];
            } catch (err) {
              console.error("Failed to load conversion row for app", app.appId, err);
              return null;
            }
          })
        );

        setConversionRows(results.filter(Boolean) as any[]);
      } catch (err) {
        console.error("Failed to load conversion table", err);
        setConversionError("Failed to load conversion table");
      } finally {
        setConversionLoading(false);
      }
    }, [apps, dateRange]);

    useEffect(() => {
      fetchAnalytics();
      fetchConversionTable();
    }, [fetchAnalytics, fetchConversionTable]);

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

    const formatNumber = (num: number) => {
      if (num >= 1000000) return `${(num / 1000000).toFixed(1)}M`;
      if (num >= 1000) return `${(num / 1000).toFixed(1)}K`;
      return num.toLocaleString();
    };

    const getDeviceIcon = (type: string) => {
      switch (type.toLowerCase()) {
        case 'mobile': return MobileIcon;
        case 'tablet': return TabletIcon;
        default: return DesktopIcon;
      }
    };

    if (apps.length === 0) {
      return (
        <Page title="Analytics">
          <Layout>
            <Layout.Section>
              <Card>
                <EmptyState
                  heading="No pixels created"
                  action={{ content: "Create Pixel", url: "/app/pixels" }}
                  image="https://cdn.shopify.com/s/files/1/0262/4071/2726/files/emptystate-files.png"
                >
                  <p>Create a pixel first to start tracking and view analytics.</p>
                </EmptyState>
              </Card>
            </Layout.Section>
          </Layout>
        </Page>
      );
    }

    return (
      <Page
        title="Analytics Dashboard"
        subtitle="Track your website performance and user behavior"
      >
        <Layout>
          {/* Header Controls */}
          <Layout.Section>
            <Card>
              <BlockStack gap="400">
                <InlineStack gap="400" wrap={false} align="space-between">
                  <InlineStack gap="300">
                    <div style={{ minWidth: "200px" }}>
                      <Select
                        label="Select Pixel"
                        options={appOptions}
                        value={selectedApp}
                        onChange={setSelectedApp}
                      />
                    </div>
                    <div style={{ minWidth: "150px" }}>
                      <Select
                        label="Date Range"
                        options={dateRangeOptions}
                        value={dateRange}
                        onChange={setDateRange}
                      />
                    </div>
                  </InlineStack>
                  <InlineStack gap="200">
                    <Button
                      icon={ExportIcon}
                      onClick={() => {
                        if (!analytics) return;

                        // Create CSV content
                        const csvSections = [];

                        // Overview section
                        csvSections.push('OVERVIEW METRICS');
                        csvSections.push('Metric,Value');
                        csvSections.push(`Pageviews,${analytics.overview.pageviews}`);
                        csvSections.push(`Unique Visitors,${analytics.overview.uniqueVisitors}`);
                        csvSections.push(`Sessions,${analytics.overview.sessions}`);
                        csvSections.push(`Total Events,${analytics.overview.totalEvents}`);
                        csvSections.push(`Total Revenue,$${analytics.overview.totalRevenue.toFixed(2)}`);
                        csvSections.push('');

                        // Daily stats section
                        csvSections.push('DAILY TRENDS');
                        csvSections.push('Date,Pageviews,Unique Users,Sessions');
                        analytics.dailyStats.forEach(day => {
                          csvSections.push(`${day.date},${day.pageviews},${day.uniqueUsers},${day.sessions}`);
                        });
                        csvSections.push('');

                        // Device types section
                        csvSections.push('DEVICE TYPES');
                        csvSections.push('Device Type,Count');
                        analytics.deviceTypes.forEach(device => {
                          csvSections.push(`${device.type},${device.count}`);
                        });
                        csvSections.push('');

                        // Top pages section
                        csvSections.push('TOP PAGES');
                        csvSections.push('Page,Views');
                        analytics.topPages.forEach(page => {
                          let pathname = page.url || "-";
                          try {
                            pathname = page.url ? new URL(page.url).pathname : "-";
                          } catch {
                            pathname = page.url || "-";
                          }
                          csvSections.push(`"${pathname}",${page.count}`);
                        });
                        csvSections.push('');

                        // Traffic sources section
                        csvSections.push('TRAFFIC SOURCES');
                        csvSections.push('Source,Visitors');
                        analytics.topReferrers.forEach(ref => {
                          let domain = ref.referrer || "Direct";
                          try {
                            if (ref.referrer) {
                              domain = new URL(ref.referrer).hostname;
                            }
                          } catch {
                            domain = ref.referrer || "Direct";
                          }
                          csvSections.push(`"${domain}",${ref.count}`);
                        });
                        csvSections.push('');

                        // Top countries section
                        csvSections.push('TOP COUNTRIES');
                        csvSections.push('Country,Visitors');
                        analytics.topCountries.forEach(country => {
                          csvSections.push(`"${country.country}",${country.count}`);
                        });
                        csvSections.push('');

                        // Top browsers section
                        csvSections.push('TOP BROWSERS');
                        csvSections.push('Browser,Visitors');
                        analytics.topBrowsers.forEach(browser => {
                          csvSections.push(`"${browser.browser}",${browser.count}`);
                        });
                        csvSections.push('');

                        // Top events section
                        csvSections.push('TOP EVENTS');
                        csvSections.push('Event,Count');
                        analytics.topEvents.forEach(event => {
                          csvSections.push(`"${event.event}",${event.count}`);
                        });
                        csvSections.push('');


                        // Join all sections
                        const csvContent = csvSections.join('\n');

                        // Create and download CSV file
                        const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
                        const link = document.createElement('a');
                        const url = URL.createObjectURL(blob);
                        link.setAttribute('href', url);
                        link.setAttribute('download', `analytics-${analytics.app.name}-${dateRange}-${new Date().toISOString().split('T')[0]}.csv`);
                        link.style.visibility = 'hidden';
                        document.body.appendChild(link);
                        link.click();
                        document.body.removeChild(link);
                      }}
                      disabled={!analytics}
                    >
                      Export CSV
                    </Button>
                    <Button onClick={fetchAnalytics} loading={loading}>
                      Refresh
                    </Button>
                  </InlineStack>
                </InlineStack>
              </BlockStack>
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
                <BlockStack gap="300" inlineAlign="center">
                  <Icon source={AlertTriangleIcon} tone="critical" />
                  <Text as="p" tone="critical" variant="headingMd">{error}</Text>
                  <Button onClick={fetchAnalytics}>Try Again</Button>
                </BlockStack>
              </Card>
            </Layout.Section>
          ) : analytics ? (
            <>
              {/* Key Metrics Cards */}
              <Layout.Section>
                <Grid>
                  <Grid.Cell columnSpan={{xs: 6, sm: 4, md: 3, lg: 2, xl: 2}}>
                    <Card>
                      <BlockStack gap="200">
                        <Icon source={ViewIcon} tone="base" />
                        <BlockStack gap="100">
                          <Text variant="headingXl" as="h3">
                            {formatNumber(analytics.overview.pageviews)}
                          </Text>
                          <Text variant="bodySm" as="p" tone="subdued">
                            Pageviews
                          </Text>
                        </BlockStack>
                      </BlockStack>
                    </Card>
                  </Grid.Cell>

                  <Grid.Cell columnSpan={{xs: 6, sm: 4, md: 3, lg: 2, xl: 2}}>
                    <Card>
                      <BlockStack gap="200">
                        <Icon source={PersonIcon} tone="base" />
                        <BlockStack gap="100">
                          <Text variant="headingXl" as="h3">
                            {formatNumber(analytics.overview.uniqueVisitors)}
                          </Text>
                          <Text variant="bodySm" as="p" tone="subdued">
                            Unique Visitors
                          </Text>
                        </BlockStack>
                      </BlockStack>
                    </Card>
                  </Grid.Cell>

                  <Grid.Cell columnSpan={{xs: 6, sm: 4, md: 3, lg: 2, xl: 2}}>
                    <Card>
                      <BlockStack gap="200">
                        <Icon source={ClockIcon} tone="base" />
                        <BlockStack gap="100">
                          <Text variant="headingXl" as="h3">
                            {formatNumber(analytics.overview.sessions)}
                          </Text>
                          <Text variant="bodySm" as="p" tone="subdued">
                            Sessions
                          </Text>
                        </BlockStack>
                      </BlockStack>
                    </Card>
                  </Grid.Cell>

                  <Grid.Cell columnSpan={{xs: 6, sm: 4, md: 3, lg: 2, xl: 2}}>
                    <Card>
                      <BlockStack gap="200">
                        <Icon source={CheckIcon} tone="base" />
                        <BlockStack gap="100">
                          <Text variant="headingXl" as="h3">
                            {formatNumber(analytics.overview.totalEvents)}
                          </Text>
                          <Text variant="bodySm" as="p" tone="subdued">
                            Total Events
                          </Text>
                        </BlockStack>
                      </BlockStack>
                    </Card>
                  </Grid.Cell>

                  <Grid.Cell columnSpan={{xs: 6, sm: 4, md: 3, lg: 2, xl: 2}}>
                    <Card>
                      <BlockStack gap="200">
                        <Icon source={OrderIcon} tone="base" />
                        <BlockStack gap="100">
                          <Text variant="headingXl" as="h3">
                            ${analytics.overview.totalRevenue.toFixed(2)}
                          </Text>
                          <Text variant="bodySm" as="p" tone="subdued">
                            Total Revenue
                          </Text>
                        </BlockStack>
                      </BlockStack>
                    </Card>
                  </Grid.Cell>
                </Grid>
              </Layout.Section>

              {/* Conversion Performance Table (all pixels) */}
              <Layout.Section>
                <Card>
                  <BlockStack gap="400">
                    <InlineStack align="space-between" blockAlign="center">
                      <Text variant="headingMd" as="h3">
                        Pixel Conversion Performance
                      </Text>
                      <Text as="p" tone="subdued" variant="bodySm">
                        Funnel performance for each pixel (ATC = Add to Cart, IC = Initiate Checkout, PUR = Purchase)
                      </Text>
                    </InlineStack>

                    {conversionLoading ? (
                      <BlockStack gap="200" inlineAlign="center">
                        <Spinner size="large" />
                        <Text as="p" tone="subdued">
                          Loading conversion data for all pixels...
                        </Text>
                      </BlockStack>
                    ) : conversionError ? (
                      <BlockStack gap="200" inlineAlign="center">
                        <Text as="p" tone="critical">
                          {conversionError}
                        </Text>
                      </BlockStack>
                    ) : conversionRows.length === 0 ? (
                      <Text as="p" tone="subdued">
                        No conversion data yet for your pixels in this date range.
                      </Text>
                    ) : (
                      <DataTable
                        columnContentTypes={[
                          'text',   // Pixel
                          'text',   // Pixel ID
                          'text',   // Meta Pixel ID
                          'numeric',// Add to Cart
                          'numeric',// Initiate Checkout
                          'numeric',// Purchase
                          'numeric',// ATC > IC
                          'numeric',// IC > PUR
                          'numeric',// Revenue
                          'numeric' // Total events
                        ]}
                        headings={[
                          'Pixel',
                          'Pixel ID',
                          'Meta Pixel ID',
                          'ADD TO CART',
                          'INITIATE CHECKOUT',
                          'PURCHASE',
                          'ATC > IC',
                          'IC > PUR',
                          'Revenue',
                          'Total events',
                        ]}
                        rows={conversionRows}
                      />
                    )}
                  </BlockStack>
                </Card>
              </Layout.Section>

              {/* Charts and Data */}
              <Layout.Section>
                <Grid>
                  {/* Daily Chart */}
                  <Grid.Cell columnSpan={{xs: 6, sm: 6, md: 4, lg: 8, xl: 8}}>
                    <Card>
                      <BlockStack gap="400">
                        <Text variant="headingMd" as="h3">Daily Trends</Text>

                        {analytics.dailyStats.length > 0 && (
                          <Box padding="400" background="bg-surface-secondary" borderRadius="200">
                            <InlineStack gap="100" align="end" blockAlign="end">
                              {analytics.dailyStats.map((day, idx) => {
                                const maxPv = Math.max(...analytics.dailyStats.map(d => d.pageviews), 1);
                                const height = Math.max((day.pageviews / maxPv) * 120, 5);
                                return (
                                  <Tooltip key={idx} content={`${day.date}: ${day.pageviews} pageviews, ${day.uniqueUsers} visitors`}>
                                    <div
                                      style={{
                                        width: `${100 / analytics.dailyStats.length - 0.5}%`,
                                        minWidth: "8px",
                                        height: `${height}px`,
                                        background: "linear-gradient(to top, #0f62fe, #4589ff)",
                                        borderRadius: "4px 4px 0 0",
                                        cursor: "pointer",
                                      }}
                                    />
                                  </Tooltip>
                                );
                              })}
                            </InlineStack>
                            <Box paddingBlockStart="200">
                              <InlineStack align="space-between">
                                <Text variant="bodySm" as="p" tone="subdued">
                                  {analytics.dailyStats[0]?.date}
                                </Text>
                                <Text variant="bodySm" as="p" tone="subdued">
                                  {analytics.dailyStats[analytics.dailyStats.length - 1]?.date}
                                </Text>
                              </InlineStack>
                            </Box>
                          </Box>
                        )}
                      </BlockStack>
                    </Card>
                  </Grid.Cell>

                  {/* Device Breakdown */}
                  <Grid.Cell columnSpan={{xs: 6, sm: 6, md: 2, lg: 4, xl: 4}}>
                    <Card>
                      <BlockStack gap="400">
                        <Text variant="headingMd" as="h3">Device Types</Text>
                        <BlockStack gap="300">
                          {analytics.deviceTypes.map((device, idx) => {
                            const total = analytics.deviceTypes.reduce((sum, d) => sum + d.count, 0);
                            const percentage = total > 0 ? (device.count / total) * 100 : 0;
                            return (
                              <BlockStack key={idx} gap="200">
                                <InlineStack align="space-between">
                                  <InlineStack gap="200">
                                    <Icon source={getDeviceIcon(device.type)} />
                                    <Text as="p" variant="bodyMd" fontWeight="medium">
                                      {device.type || "Unknown"}
                                    </Text>
                                  </InlineStack>
                                  <Text as="p" tone="subdued">
                                    {percentage.toFixed(1)}%
                                  </Text>
                                </InlineStack>
                                <ProgressBar
                                  progress={percentage}
                                  tone="success"
                                />
                              </BlockStack>
                            );
                          })}
                        </BlockStack>
                      </BlockStack>
                    </Card>
                  </Grid.Cell>
                </Grid>
              </Layout.Section>

              {/* Detailed Tables */}
              <Layout.Section>
                <Grid>
                  <Grid.Cell columnSpan={{xs: 6, sm: 6, md: 3, lg: 6, xl: 6}}>
                    <Card>
                      <BlockStack gap="400">
                        <Text variant="headingMd" as="h3">Top Pages</Text>

                        {analytics.topPages.length > 0 ? (
                          <DataTable
                            columnContentTypes={['text', 'numeric']}
                            headings={['Page', 'Views']}
                            rows={analytics.topPages.slice(0, 10).map(page => {
                              let pathname = "-";
                              try {
                                pathname = page.url ? new URL(page.url).pathname : "-";
                              } catch {
                                pathname = page.url || "-";
                              }
                              return [
                                pathname,
                                formatNumber(page.count)
                              ];
                            })}
                          />
                        ) : (
                          <Text as="p" tone="subdued">No page data yet</Text>
                        )}
                      </BlockStack>
                    </Card>
                  </Grid.Cell>

                  <Grid.Cell columnSpan={{xs: 6, sm: 6, md: 3, lg: 6, xl: 6}}>
                    <Card>
                      <BlockStack gap="400">
                        <Text variant="headingMd" as="h3">Traffic Sources</Text>

                        {analytics.topReferrers.length > 0 ? (
                          <DataTable
                            columnContentTypes={['text', 'numeric']}
                            headings={['Source', 'Visitors']}
                            rows={analytics.topReferrers.slice(0, 10).map(ref => {
                              let domain = ref.referrer || "Direct";
                              try {
                                if (ref.referrer) {
                                  domain = new URL(ref.referrer).hostname;
                                }
                              } catch {
                                domain = ref.referrer || "Direct";
                              }
                              return [
                                domain,
                                formatNumber(ref.count)
                              ];
                            })}
                          />
                        ) : (
                          <Text as="p" tone="subdued">No referrer data yet</Text>
                        )}
                      </BlockStack>
                    </Card>
                  </Grid.Cell>
                </Grid>
              </Layout.Section>

            </>
          ) : (
            <Layout.Section>
              <Card>
                <EmptyState
                  heading="Select a pixel to view analytics"
                  image="https://cdn.shopify.com/s/files/1/0262/4071/2726/files/emptystate-files.png"
                >
                  <p>Choose a pixel from the dropdown above to start viewing analytics data.</p>
                </EmptyState>
              </Card>
            </Layout.Section>
          )}
        </Layout>
      </Page>
    );
  }