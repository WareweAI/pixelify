import { useState } from "react";
import { Card, Text, InlineStack, DataTable, TextField, Button, Badge, BlockStack } from "@shopify/polaris";
import { ExportIcon } from "@shopify/polaris-icons";

interface PurchaseEvent {
  id: string;
  orderId: string;
  value: number | null;
  currency: string;
  pixelId: string;
  source: string;
  purchaseTime: string;
}

interface PurchaseReportsProps {
  recentPurchaseEvents: PurchaseEvent[];
  totalPurchaseEvents: number;
  purchaseLimit: number;
  currentPurchaseOffset: number;
}

export function PurchaseReports({
  recentPurchaseEvents,
  totalPurchaseEvents,
  purchaseLimit,
  currentPurchaseOffset,
}: PurchaseReportsProps) {
  const [purchaseSearchTerm, setPurchaseSearchTerm] = useState("");

  // Filter purchase events based on search term
  const filteredPurchaseEvents = recentPurchaseEvents.filter((event: PurchaseEvent) => {
    if (!purchaseSearchTerm) return true;

    const searchLower = purchaseSearchTerm.toLowerCase();
    return (
      event.orderId.toLowerCase().includes(searchLower) ||
      event.pixelId.toLowerCase().includes(searchLower) ||
      event.source.toLowerCase().includes(searchLower) ||
      event.currency.toLowerCase().includes(searchLower) ||
      (event.value && event.value.toString().includes(searchLower))
    );
  });

  const handleExportCSV = () => {
    // Create CSV content
    const headers = ['Order ID', 'Value', 'Currency', 'Pixel ID', 'Source', 'Purchase Time'];
    const csvContent = [
      headers.join(','),
      ...filteredPurchaseEvents.map((event: PurchaseEvent) => [
        `"${event.orderId}"`,
        event.value ? `"$${event.value.toFixed(2)}"` : '""',
        `"${event.currency}"`,
        `"${event.pixelId}"`,
        `"${event.source}"`,
        `"${new Date(event.purchaseTime).toLocaleString()}"`
      ].join(','))
    ].join('\n');

    // Create and download CSV file
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const link = document.createElement('a');
    const url = URL.createObjectURL(blob);
    link.setAttribute('href', url);
    link.setAttribute('download', `purchase-report-${new Date().toISOString().split('T')[0]}.csv`);
    link.style.visibility = 'hidden';
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  const handlePreviousPage = () => {
    const newOffset = Math.max(0, currentPurchaseOffset - purchaseLimit);
    window.location.href = `/app/dashboard?purchaseOffset=${newOffset}`;
  };

  const handleNextPage = () => {
    const newOffset = currentPurchaseOffset + purchaseLimit;
    window.location.href = `/app/dashboard?purchaseOffset=${newOffset}`;
  };

  if (recentPurchaseEvents.length === 0) {
    return null;
  }

  return (
    <Card>
      <BlockStack gap="400">
        <InlineStack align="space-between" blockAlign="center">
          <Text variant="headingMd" as="h3">Recent Purchase Reports</Text>
          <InlineStack gap="200" blockAlign="center">
            <Button
              icon={ExportIcon}
              onClick={handleExportCSV}
            >
              Export CSV
            </Button>
            <div style={{ width: "300px" }}>
              <TextField
                label=""
                value={purchaseSearchTerm}
                onChange={setPurchaseSearchTerm}
                placeholder="Search orders, pixels, sources..."
                autoComplete="off"
                clearButton
                onClearButtonClick={() => setPurchaseSearchTerm("")}
              />
            </div>
          </InlineStack>
        </InlineStack>

        <DataTable
          columnContentTypes={['text', 'numeric', 'text', 'text', 'text', 'text']}
          headings={['Order ID', 'Value', 'Currency', 'Pixel ID', 'Source', 'Purchase Time']}
          rows={filteredPurchaseEvents.map((event: PurchaseEvent) => [
            <Text key={`order-${event.id}`} variant="bodyMd" fontWeight="medium" as="span">
              {event.orderId}
            </Text>,
            <Text key={`value-${event.id}`} variant="bodyMd" fontWeight="medium" as="span">
              {(() => {
                const val = event.value;
                if (typeof val === 'number' && !isNaN(val)) {
                  return `$${val.toFixed(2)}`;
                }
                return '-';
              })()}
            </Text>,
            <Badge key={`currency-${event.id}`} tone="success">{event.currency}</Badge>,
            <Text key={`pixel-${event.id}`} variant="bodySm" tone="subdued" as="span">
              {event.pixelId}
            </Text>,
            <Text key={`source-${event.id}`} variant="bodySm" tone="subdued" as="span">
              {event.source}
            </Text>,
            <Text key={`time-${event.id}`} variant="bodySm" tone="subdued" as="span">
              {new Date(event.purchaseTime).toLocaleString()}
            </Text>,
          ])}
        />

        {totalPurchaseEvents > purchaseLimit && (
          <InlineStack align="center" gap="200">
            <Button
              disabled={currentPurchaseOffset === 0}
              onClick={handlePreviousPage}
            >
              Previous
            </Button>
            <Text as="span" tone="subdued">
              Page {Math.floor(currentPurchaseOffset / purchaseLimit) + 1} of {Math.ceil(totalPurchaseEvents / purchaseLimit)}
            </Text>
            <Button
              disabled={currentPurchaseOffset + purchaseLimit >= totalPurchaseEvents}
              onClick={handleNextPage}
            >
              Next
            </Button>
          </InlineStack>
        )}

        <Text variant="bodySm" tone="subdued" as="p">
          Report shows purchase events from the last 7 days across all your Facebook pixels.
          {filteredPurchaseEvents.length !== recentPurchaseEvents.length &&
            ` Showing ${filteredPurchaseEvents.length} of ${recentPurchaseEvents.length} purchases.`
          }
        </Text>
      </BlockStack>
    </Card>
  );
}
