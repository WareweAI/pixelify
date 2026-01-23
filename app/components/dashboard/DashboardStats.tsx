import { Card, Text, InlineStack, BlockStack } from "@shopify/polaris";

interface DashboardStatsProps {
  stats: {
    totalPixels: number;
    totalEvents: number;
    totalSessions: number;
    todayEvents: number;
  };
  apps: any[];
}

export function DashboardStats({ stats, apps }: DashboardStatsProps) {
  return (
    <BlockStack gap="400">
      <Text variant="headingLg" as="h2">Performance Overview</Text>
      <InlineStack gap="400" wrap={false}>
        <Card>
          <BlockStack gap="200">
            <Text variant="bodySm" as="p" tone="subdued">Active Pixels</Text>
            <Text variant="headingXl" as="p">{stats.totalPixels}</Text>
            <Text variant="bodySm" as="p" tone="success">Facebook Pixels</Text>
          </BlockStack>
        </Card>
        <Card>
          <BlockStack gap="200">
            <Text variant="bodySm" as="p" tone="subdued">Assigned Domains</Text>
            <Text variant="headingXl" as="p">{apps.filter((app: any) => app.websiteDomain).length}</Text>
            <Text variant="bodySm" as="p" tone="info">Domain-specific pixels</Text>
          </BlockStack>
        </Card>
        <Card>
          <BlockStack gap="200">
            <Text variant="bodySm" as="p" tone="subdued">Conversions Tracked</Text>
            <Text variant="headingXl" as="p">{stats.totalEvents.toLocaleString()}</Text>
            <Text variant="bodySm" as="p" tone="subdued">All time</Text>
          </BlockStack>
        </Card>
        <Card>
          <BlockStack gap="200">
            <Text variant="bodySm" as="p" tone="subdued">Unique Visitors</Text>
            <Text variant="headingXl" as="p">{stats.totalSessions.toLocaleString()}</Text>
            <Text variant="bodySm" as="p" tone="subdued">This month</Text>
          </BlockStack>
        </Card>
        <Card>
          <BlockStack gap="200">
            <Text variant="bodySm" as="p" tone="subdued">Events Today</Text>
            <Text variant="headingXl" as="p">{stats.todayEvents.toLocaleString()}</Text>
            <Text variant="bodySm" as="p" tone="subdued">Live tracking</Text>
          </BlockStack>
        </Card>
      </InlineStack>
    </BlockStack>
  );
}
