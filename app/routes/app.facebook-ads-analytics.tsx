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
    select: { id: true, appId: true, name: true },
  });

  return { apps };
};

interface FacebookAdsMetrics {
  totalSessions: number;
  totalPageviews: number;
  totalEvents: number;
  totalConversions: number;
  totalRevenue: number;
  campaigns: Array<{
    campaign: string;
    sessions: number;
    pageviews: number;
    events: number;
    conversions: number;
    revenue: number;
    conversionRate: number;
    averageOrderValue: number;
  }>;
  sourceMediumBreakdown: Array<{
    source: string;
    medium: string;
    sessions: number;
    pageviews: number;
    events: number;
    conversions: number;
    revenue: number;
    conversionRate: number;
  }>;
  topCampaigns: Array<{
    campaign: string;
    sessions: number;
    pageviews: number;
    events: number;
    conversions: number;
    revenue: number;
    conversionRate: number;
    averageOrderValue: number;
  }>;
}

export default function FacebookAdsAnalyticsPage() {
  const { apps } = useLoaderData<typeof loader>();
  const [selectedApp, setSelectedApp] = useState(apps[0]?.appId || "");
  const [dateRange, setDateRange] = useState("30d");
  const [analytics, setAnalytics] = useState<FacebookAdsMetrics | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const fetchAnalytics = useCallback(async () => {
    if (!selectedApp) return;

    setLoading(true);
    setError("");

    try {
      const res = await fetch(`/api/utm-analytics?appId=${selectedApp}&range=${dateRange}&type=facebook`);
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

  const formatNumber = (num: number) => {
    if (num >= 1000000) return `${(num / 1000000).toFixed(1)}M`;
    if (num >= 1000) return `${(num / 1000).toFixed(1)}K`;
    return num.toLocaleString();
  };

  const formatCurrency = (num: number) => {
    return `$${num.toFixed(2)}`;
  };

  if (apps.length === 0) {
    return (
      <Page title="Facebook Ads Analytics">
        <Layout>
          <Layout.Section>
            <Card>
              <EmptyState
                heading="No pixels created"
                action={{ content: "Create Pixel", url: "/app/pixels" }}
                image="https://cdn.shopify.com/s/files/1/0262/4071/2726/files/emptystate-files.png"
              >
                <p>Create a pixel first to start tracking Facebook ad performance.</p>
              </EmptyState>
            </Card>
          </Layout.Section>
        </Layout>
      </Page>
    );
  }

  return (
    <Page
      title="Facebook Ads Analytics"
      subtitle="Track your Facebook ad performance with UTM analytics"
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
                      csvSections.push('FACEBOOK ADS OVERVIEW');
                      csvSections.push('Metric,Value');
                      csvSections.push(`Sessions,${analytics.totalSessions}`);
                      csvSections.push(`Pageviews,${analytics.totalPageviews}`);
                      csvSections.push(`Total Events,${analytics.totalEvents}`);
                      csvSections.push(`Conversions,${analytics.totalConversions}`);
                      csvSections.push(`Total Revenue,$${analytics.totalRevenue.toFixed(2)}`);
                      csvSections.push('');

                      // Campaign performance section
                      csvSections.push('CAMPAIGN PERFORMANCE');
                      csvSections.push('Campaign,Sessions,Pageviews,Events,Conversions,Revenue,Conversion Rate,AOV');
                      analytics.campaigns.forEach(campaign => {
                        csvSections.push(`"${campaign.campaign}",${campaign.sessions},${campaign.pageviews},${campaign.events},${campaign.conversions},${campaign.revenue.toFixed(2)},${campaign.conversionRate.toFixed(2)}%,${campaign.averageOrderValue.toFixed(2)}`);
                      });
                      csvSections.push('');

                      // Source/Medium breakdown section
                      csvSections.push('SOURCE/MEDIUM BREAKDOWN');
                      csvSections.push('Source,Medium,Sessions,Pageviews,Events,Conversions,Revenue,Conversion Rate');
                      analytics.sourceMediumBreakdown.forEach(sm => {
                        csvSections.push(`"${sm.source}","${sm.medium}",${sm.sessions},${sm.pageviews},${sm.events},${sm.conversions},${sm.revenue.toFixed(2)},${sm.conversionRate.toFixed(2)}%`);
                      });

                      // Join all sections
                      const csvContent = csvSections.join('\n');

                      // Create and download CSV file
                      const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
                      const link = document.createElement('a');
                      const url = URL.createObjectURL(blob);
                      link.setAttribute('href', url);
                      link.setAttribute('download', `facebook-ads-analytics-${selectedApp}-${dateRange}-${new Date().toISOString().split('T')[0]}.csv`);
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
                <Text as="p">Loading Facebook Ads analytics...</Text>
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
                      <Icon source={PersonIcon} tone="base" />
                      <BlockStack gap="100">
                        <Text variant="headingXl" as="h3">
                          {formatNumber(analytics.totalSessions)}
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
                      <Icon source={ViewIcon} tone="base" />
                      <BlockStack gap="100">
                        <Text variant="headingXl" as="h3">
                          {formatNumber(analytics.totalPageviews)}
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
                      <Icon source={CheckIcon} tone="base" />
                      <BlockStack gap="100">
                        <Text variant="headingXl" as="h3">
                          {formatNumber(analytics.totalConversions)}
                        </Text>
                        <Text variant="bodySm" as="p" tone="subdued">
                          Conversions
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
                          {formatCurrency(analytics.totalRevenue)}
                        </Text>
                        <Text variant="bodySm" as="p" tone="subdued">
                          Revenue
                        </Text>
                      </BlockStack>
                    </BlockStack>
                  </Card>
                </Grid.Cell>
              </Grid>
            </Layout.Section>

            {/* Campaign Performance Table */}
            <Layout.Section>
              <Card>
                <BlockStack gap="400">
                  <Text variant="headingMd" as="h3">Campaign Performance</Text>

                  {analytics.campaigns.length > 0 ? (
                    <DataTable
                      columnContentTypes={['text', 'numeric', 'numeric', 'numeric', 'numeric', 'numeric', 'numeric', 'numeric']}
                      headings={['Campaign', 'Sessions', 'Pageviews', 'Events', 'Conversions', 'Revenue', 'Conv. Rate', 'AOV']}
                      rows={analytics.campaigns.slice(0, 20).map(campaign => [
                        campaign.campaign,
                        formatNumber(campaign.sessions),
                        formatNumber(campaign.pageviews),
                        formatNumber(campaign.events),
                        formatNumber(campaign.conversions),
                        formatCurrency(campaign.revenue),
                        `${campaign.conversionRate.toFixed(1)}%`,
                        formatCurrency(campaign.averageOrderValue)
                      ])}
                    />
                  ) : (
                    <Text as="p" tone="subdued">No Facebook ad campaign data yet</Text>
                  )}
                </BlockStack>
              </Card>
            </Layout.Section>

            {/* Source/Medium Breakdown */}
            <Layout.Section>
              <Card>
                <BlockStack gap="400">
                  <Text variant="headingMd" as="h3">Traffic Sources</Text>

                  {analytics.sourceMediumBreakdown.length > 0 ? (
                    <DataTable
                      columnContentTypes={['text', 'text', 'numeric', 'numeric', 'numeric', 'numeric', 'numeric', 'numeric']}
                      headings={['Source', 'Medium', 'Sessions', 'Pageviews', 'Events', 'Conversions', 'Revenue', 'Conv. Rate']}
                      rows={analytics.sourceMediumBreakdown.slice(0, 15).map(sm => [
                        sm.source,
                        sm.medium,
                        formatNumber(sm.sessions),
                        formatNumber(sm.pageviews),
                        formatNumber(sm.events),
                        formatNumber(sm.conversions),
                        formatCurrency(sm.revenue),
                        `${sm.conversionRate.toFixed(1)}%`
                      ])}
                    />
                  ) : (
                    <Text as="p" tone="subdued">No Facebook ad traffic data yet</Text>
                  )}
                </BlockStack>
              </Card>
            </Layout.Section>
          </>
        ) : (
          <Layout.Section>
            <Card>
              <EmptyState
                heading="Select a pixel to view Facebook Ads analytics"
                image="https://cdn.shopify.com/s/files/1/0262/4071/2726/files/emptystate-files.png"
              >
                <p>Choose a pixel from the dropdown above to start viewing Facebook ad performance data.</p>
              </EmptyState>
            </Card>
          </Layout.Section>
        )}
      </Layout>
    </Page>
  );
}
