  import { useState, useEffect, useCallback } from "react";
  import type { LoaderFunctionArgs } from "react-router";
  import { useLoaderData } from "react-router";
  import { getShopifyInstance } from "../shopify.server";
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
    if (!shopify?.authenticate) {
      throw new Response("Shopify configuration not found", { status: 500 });
    }
    
    const { session, admin } = await shopify.authenticate.admin(request);
    const shop = session.shop;
    
    return Response.json({
      shop,
    });
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
    const { shop, extensionStatus } = useLoaderData<typeof loader>();
    
    // State for apps data
    const [apps, setApps] = useState<any[]>([]);
    const [appsLoading, setAppsLoading] = useState(true);
    const [appsError, setAppsError] = useState<string | null>(null);
    
    const [selectedApp, setSelectedApp] = useState("");
    const [dateRange, setDateRange] = useState("7d");
    const [analytics, setAnalytics] = useState<AnalyticsData | null>(null);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState("");
    const [conversionRows, setConversionRows] = useState<any[]>([]);
    const [conversionLoading, setConversionLoading] = useState(false);
    const [conversionError, setConversionError] = useState("");
    // Debounce state
    const [debounceTimer, setDebounceTimer] = useState<NodeJS.Timeout | null>(null);

    // Fetch apps from API on mount
    useEffect(() => {
      const fetchApps = async () => {
        try {
          setAppsLoading(true);
          const response = await fetch('/api/analytics-data');
          if (!response.ok) {
            throw new Error('Failed to fetch apps data');
          }
          const data = await response.json();
          setApps(data.apps || []);
          if (data.apps && data.apps.length > 0) {
            setSelectedApp(data.apps[0].appId);
          }
          setAppsError(null);
        } catch (error: any) {
          console.error('[Analytics] Error fetching apps:', error);
          setAppsError(error.message);
        } finally {
          setAppsLoading(false);
        }
      };

      fetchApps();
    }, []);

    // Cache for analytics data
    const getCacheKey = (appId: string, range: string) => `analytics_${appId}_${range}`;
    const getCachedData = (key: string) => {
      try {
        const cached = sessionStorage.getItem(key);
        if (cached) {
          const parsed = JSON.parse(cached);
          // Check if cache is still valid (5 minutes)
          if (Date.now() - parsed.timestamp < 5 * 60 * 1000) {
            return parsed.data;
          }
        }
      } catch (err) {
        // Ignore cache errors
      }
      return null;
    };
    const setCachedData = (key: string, data: any) => {
      try {
        sessionStorage.setItem(key, JSON.stringify({
          data,
          timestamp: Date.now()
        }));
      } catch (err) {
        // Ignore cache errors
      }
    };

    const fetchAnalytics = useCallback((opts?: { debounce?: boolean }) => {
      if (!selectedApp) return;
      const cacheKey = getCacheKey(selectedApp, dateRange);
      const cachedData = getCachedData(cacheKey);
      if (cachedData) setAnalytics(cachedData);
      if (debounceTimer) clearTimeout(debounceTimer);
      const doFetch = async () => {
        setLoading(true);
        setError("");
        try {
          const res = await fetch(`/api/analytics?appId=${selectedApp}&range=${dateRange}`);
          const data = await res.json();
          if (data.error) {
            setError(data.error);
          } else {
            setAnalytics(data);
            setCachedData(cacheKey, data);
          }
        } catch (err) {
          setError("Failed to load analytics");
          console.error(err);
        } finally {
          setLoading(false);
        }
      };
      if (opts?.debounce) {
        const timer = setTimeout(doFetch, 350);
        setDebounceTimer(timer);
      } else {
        doFetch();
      }
    }, [selectedApp, dateRange, debounceTimer]);

    const fetchConversionTable = useCallback((opts?: { debounce?: boolean }) => {
      if (!apps || apps.length === 0) return;
      const cacheKey = `conversion_table_${dateRange}_${apps.map((a: any) => a.appId).sort().join('_')}`;
      const cachedData = getCachedData(cacheKey);
      if (cachedData) setConversionRows(cachedData);
      if (debounceTimer) clearTimeout(debounceTimer);
      const doFetch = async () => {
        setConversionLoading(true);
        setConversionError("");
        try {
          const appIds = apps.map((app: any) => app.appId).join(',');
          const res = await fetch(`/api/bulk-analytics?appIds=${appIds}&range=${dateRange}`);
          const bulkData = await res.json();
          if (bulkData.error) {
            setConversionError(bulkData.error);
            return;
          }
          const results = bulkData.map((item: any) => {
            const atc = item.addToCartEvents || 0;
            const ic = item.initiateCheckoutEvents || 0;
            const pur = item.purchaseEvents || 0;
            const atcToIc = atc > 0 ? (ic / atc) * 100 : 0;
            const icToPur = ic > 0 ? (pur / ic) * 100 : 0;
            const currency = item.currency || "USD";
            return [
              item.name,
              item.appId,
              item.metaPixelId || "—",
              atc.toLocaleString(),
              ic.toLocaleString(),
              pur.toLocaleString(),
              `${atcToIc.toFixed(2)}%`,
              `${icToPur.toFixed(2)}%`,
              `${currency} ${item.totalRevenue.toFixed(3)}`,
              item.totalEvents.toLocaleString(),
            ];
          });
          setConversionRows(results);
          setCachedData(cacheKey, results);
        } catch (err) {
          console.error("Failed to load conversion table", err);
          setConversionError("Failed to load conversion table");
        } finally {
          setConversionLoading(false);
        }
      };
      if (opts?.debounce) {
        const timer = setTimeout(doFetch, 350);
        setDebounceTimer(timer);
      } else {
        doFetch();
      }
    }, [apps, dateRange, debounceTimer]);

    useEffect(() => {
      fetchAnalytics({ debounce: true });
      fetchConversionTable({ debounce: true });
    }, [selectedApp, dateRange]);

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

    // Show loading state while fetching apps
    if (appsLoading) {
      return (
          <Page title="Analytics" fullWidth>
            <Layout>
              <Layout.Section fullWidth>
                <Card>
                  <div style={{ padding: '60px', textAlign: 'center' }}>
                    <Spinner size="large" />
                    <div style={{ marginTop: '16px' }}>
                      <Text as="p">Loading analytics data...</Text>
                    </div>
                  </div>
                </Card>
              </Layout.Section>
            </Layout>
          </Page>
      );
    }

    // Show error state
    if (appsError) {
      return (
          <Page title="Analytics" fullWidth>
            <Layout>
              <Layout.Section fullWidth>
                <Card>
                  <div style={{ padding: '60px', textAlign: 'center' }}>
                    <div style={{ fontSize: '48px', marginBottom: '16px' }}>❌</div>
                    <Text variant="headingMd" as="h3">Error loading analytics data</Text>
                    <p style={{ marginTop: '8px', color: '#64748b' }}>{appsError}</p>
                  </div>
                </Card>
              </Layout.Section>
            </Layout>
          </Page>
      );
    }

    if (apps.length === 0) {
      return (
          <Page title="Analytics" fullWidth>
          <Layout>
            <Layout.Section fullWidth>
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
        fullWidth
      >
        <Layout>
          {/* Header Controls */}
          <Layout.Section fullWidth>
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
                        if (!analytics || !analytics.overview) return;

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
                        if (analytics.dailyStats && analytics.dailyStats.length > 0) {
                          csvSections.push('DAILY TRENDS');
                          csvSections.push('Date,Pageviews,Unique Users,Sessions');
                          analytics.dailyStats.forEach(day => {
                            csvSections.push(`${day.date},${day.pageviews},${day.uniqueUsers},${day.sessions}`);
                          });
                          csvSections.push('');
                        }

                        // Device types section
                        if (analytics.deviceTypes && analytics.deviceTypes.length > 0) {
                          csvSections.push('DEVICE TYPES');
                          csvSections.push('Device Type,Count');
                          analytics.deviceTypes.forEach(device => {
                            csvSections.push(`${device.type},${device.count}`);
                          });
                          csvSections.push('');
                        }

                        // Top pages section
                        if (analytics.topPages && analytics.topPages.length > 0) {
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
                        }

                        // Traffic sources section
                        if (analytics.topReferrers && analytics.topReferrers.length > 0) {
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
                        }

                        // Top countries section
                        if (analytics.topCountries && analytics.topCountries.length > 0) {
                          csvSections.push('TOP COUNTRIES');
                          csvSections.push('Country,Visitors');
                          analytics.topCountries.forEach(country => {
                            csvSections.push(`"${country.country}",${country.count}`);
                          });
                          csvSections.push('');
                        }

                        // Top browsers section
                        if (analytics.topBrowsers && analytics.topBrowsers.length > 0) {
                          csvSections.push('TOP BROWSERS');
                          csvSections.push('Browser,Visitors');
                          analytics.topBrowsers.forEach(browser => {
                            csvSections.push(`"${browser.browser}",${browser.count}`);
                          });
                          csvSections.push('');
                        }

                        // Top events section
                        if (analytics.topEvents && analytics.topEvents.length > 0) {
                          csvSections.push('TOP EVENTS');
                          csvSections.push('Event,Count');
                          analytics.topEvents.forEach(event => {
                            csvSections.push(`"${event.event}",${event.count}`);
                          });
                          csvSections.push('');
                        }


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
                      disabled={!analytics || !analytics.overview}
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
            <Layout.Section fullWidth>
              <Card>
                <BlockStack gap="400" inlineAlign="center">
                  <Spinner size="large" />
                  <Text as="p">Loading analytics...</Text>
                </BlockStack>
              </Card>
            </Layout.Section>
          ) : error ? (
            <Layout.Section fullWidth>
              <Card>
                <BlockStack gap="300" inlineAlign="center">
                  <Icon source={AlertTriangleIcon} tone="critical" />
                  <Text as="p" tone="critical" variant="headingMd">{error}</Text>
                  <Button onClick={fetchAnalytics}>Try Again</Button>
                </BlockStack>
              </Card>
            </Layout.Section>
          ) : analytics && analytics.overview ? (
            <>
              {/* Key Metrics Cards */}
              <Layout.Section fullWidth>
                <Grid>
                  <Grid.Cell columnSpan={{xs: 6, sm: 4, md: 3, lg: 2, xl: 2}}>
                    <Card>
                      <BlockStack gap="200">
                        <Icon source={ViewIcon} tone="base" />
                        <BlockStack gap="100">
                          <Text variant="headingXl" as="h3">
                            {formatNumber(analytics.overview.pageviews || 0)}
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
                            {formatNumber(analytics.overview.uniqueVisitors || 0)}
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
                            {formatNumber(analytics.overview.sessions || 0)}
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
                            {formatNumber(analytics.overview.totalEvents || 0)}
                          </Text>
                          <Text variant="bodySm" as="p" tone="subdued">
                            Total Events
                          </Text>
                        </BlockStack>
                      </BlockStack>
                    </Card>
                  </Grid.Cell>
                </Grid>
              </Layout.Section>

              {/* Conversion Performance Table (all pixels) */}
              <Layout.Section fullWidth>
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
              <Layout.Section fullWidth>
                <Grid>
                  {/* Daily Chart */}
                  <Grid.Cell columnSpan={{xs: 6, sm: 6, md: 4, lg: 8, xl: 8}}>
                    <Card>
                      <BlockStack gap="400">
                        <Text variant="headingMd" as="h3">Daily Trends</Text>

                        {analytics.dailyStats && analytics.dailyStats.length > 0 && (
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
                          {analytics.deviceTypes && analytics.deviceTypes.map((device, idx) => {
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
              <Layout.Section fullWidth>
                <Grid>
                  <Grid.Cell columnSpan={{xs: 6, sm: 6, md: 3, lg: 6, xl: 6}}>
                    <Card>
                      <BlockStack gap="400">
                        <Text variant="headingMd" as="h3">Top Pages</Text>

                        {analytics.topPages && analytics.topPages.length > 0 ? (
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

                        {analytics.topReferrers && analytics.topReferrers.length > 0 ? (
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
            <Layout.Section fullWidth>
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