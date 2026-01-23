import { Button, Card, Text, Badge, InlineStack, DataTable, Banner, BlockStack } from "@shopify/polaris";
import { ExportIcon } from "@shopify/polaris-icons";

interface PixelTableProps {
  apps: any[];
  isLoading: boolean;
  onTogglePixel: (appId: string, enabled: boolean) => void;
  onShowWebsiteModal: (app: any) => void;
  onShowSnippet: (appId: string) => void;
  onShowRenameModal: (app: any) => void;
  onShowDeleteModal: (app: any) => void;
}

export function PixelTable({
  apps,
  isLoading,
  onTogglePixel,
  onShowWebsiteModal,
  onShowSnippet,
  onShowRenameModal,
  onShowDeleteModal,
}: PixelTableProps) {
  
  const handleExportCSV = () => {
    // Create CSV content for pixels with website domain info
    const headers = ['Pixel Name', 'Pixel ID', 'Website Domain', 'Status', 'Events', 'Sessions', 'Meta Connected', 'Timezone', 'Created Date'];
    const csvContent = [
      headers.join(','),
      ...apps.map((app: any) => {
        const { name, settings, _count, enabled, websiteDomain, createdAt } = app;
        const eventsCount = _count?.events || 0;
        const sessionsCount = _count?.analyticsSessions || 0;
        return [
          `"${name}"`,
          `"${settings?.metaPixelId || 'N/A'}"`,
          `"${websiteDomain || 'Unassigned'}"`,
          `"${enabled ? 'Enabled' : 'Disabled'}"`,
          `"${eventsCount.toLocaleString()}"`,
          `"${sessionsCount.toLocaleString()}"`,
          `"${settings?.metaPixelEnabled ? 'Yes' : 'No'}"`,
          `"${settings?.timezone || 'GMT+0'}"`,
          `"${new Date(createdAt).toLocaleDateString()}"`
        ].join(',');
      })
    ].join('\n');

    // Create and download CSV file
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const link = document.createElement('a');
    const url = URL.createObjectURL(blob);
    link.setAttribute('href', url);
    link.setAttribute('download', `pixels-website-report-${new Date().toISOString().split('T')[0]}.csv`);
    link.style.visibility = 'hidden';
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  return (
    <BlockStack gap="400">
      <InlineStack align="space-between" blockAlign="center">
        <Text variant="headingLg" as="h2">Your Facebook Pixels</Text>
        <InlineStack gap="200">
          <Button
            icon={ExportIcon}
            onClick={handleExportCSV}
          >
            Export CSV
          </Button>
          <Text as="h1" fontWeight="bold">Manage All Pixels</Text>
        </InlineStack>
      </InlineStack>

      {/* Website Assignment Info Banner */}
      <Banner tone="warning">
        <BlockStack gap="200">
          <Text as="p" variant="bodyMd" fontWeight="semibold">
            ⚠️ Strict Domain Matching - Pixels Only Fire on Assigned Domains
          </Text>
          <Text as="p" variant="bodySm">
            Each pixel must be assigned to a specific website domain. Pixels will ONLY track events from their assigned domain.
            If a domain is not assigned to any pixel, tracking will be disabled for that domain.
          </Text>
          <Text as="p" variant="bodySm">
            <strong>How to use:</strong> Click "Assign" to assign a pixel to your website domain (e.g., mystore.myshopify.com).
          </Text>
        </BlockStack>
      </Banner>
      
      <Card>
        <div style={{ width: '100%', overflowX: 'auto' }}>
          <DataTable
            columnContentTypes={[
              'text',
              'text', 
              'text',
              'text',
              'numeric',
              'numeric',
              'text',
              'text',
              'text'
            ]}
            headings={[
              'Pixel Name',
              'Pixel ID', 
              'Website Domain',
              'Status',
              'Events',
              'Sessions',
              'Meta Status',
              'Timezone',
              'Actions'
            ]}
            rows={apps.map((app: any) => {
              const { id, appId, name, _count, settings, enabled, websiteDomain } = app;
              const eventsCount = _count?.events || 0;
              const sessionsCount = _count?.analyticsSessions || 0;
              return [
                <Text variant="bodyMd" fontWeight="semibold" as="span">{name}</Text>,
                <Text variant="bodySm" as="span" tone="subdued">{settings?.metaPixelId || appId}</Text>,
                websiteDomain ? (
                  <InlineStack gap="100" blockAlign="center">
                    <Badge tone="info">{`🌐 ${websiteDomain}`}</Badge>
                  </InlineStack>
                ) : (
                  <Badge tone="attention">Unassigned</Badge>
                ),
                <Badge tone={enabled ? "success" : "critical"}>
                  {enabled ? "Enabled" : "Disabled"}
                </Badge>,
                <Text variant="bodySm" as="span">{eventsCount.toLocaleString()}</Text>,
                <Text variant="bodySm" as="span">{sessionsCount.toLocaleString()}</Text>,
                settings?.metaPixelEnabled ? (
                  <Badge tone="success">Connected</Badge>
                ) : (
                  <Badge tone="critical">Not Connected</Badge>
                ),
                <Text variant="bodySm" as="span" tone="subdued">
                  {settings?.timezone || 'GMT+0'}
                </Text>,
                <InlineStack gap="100">
                  <Button 
                    size="micro"
                    variant={enabled ? "primary" : "secondary"}
                    tone={enabled ? "critical" : "success"}
                    onClick={() => onTogglePixel(id, enabled)}
                    loading={isLoading}
                  >
                    {enabled ? "Disable" : "Enable"}
                  </Button>
                  <Button 
                    size="micro"
                    onClick={() => {
                      onShowWebsiteModal(app);
                    }}
                  >
                    {websiteDomain ? "Change" : "Assign"}
                  </Button>
                  <Button 
                    size="micro"
                    onClick={() => onShowSnippet(appId)}
                  >
                    Code
                  </Button>
                  <Button
                    size="micro"
                    onClick={() => {
                      onShowRenameModal(app);
                    }}
                  >
                    Rename
                  </Button>
                  <Button
                    size="micro"
                    tone="critical"
                    onClick={() => onShowDeleteModal(app)}
                  >
                    Delete
                  </Button>
                </InlineStack>
              ];
            })}
          />
        </div>
      </Card>
    </BlockStack>
  );
}
