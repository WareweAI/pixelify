import { Card, InlineStack, BlockStack, Text, Badge, Button } from "@shopify/polaris";

interface FacebookConnectionProps {
  isConnected: boolean;
  user: any;
  pixelsCount: number;
  isRefreshing: boolean;
  onRefresh: () => void;
  onDisconnect: () => void;
}

export function FacebookConnection({
  isConnected,
  user,
  pixelsCount,
  isRefreshing,
  onRefresh,
  onDisconnect,
}: FacebookConnectionProps) {
  if (!isConnected || !user) {
    return (
      <Card>
        <InlineStack align="space-between" blockAlign="center">
          <InlineStack gap="400" blockAlign="center">
            <div style={{
              width: "56px",
              height: "56px",
              borderRadius: "50%",
              backgroundColor: "#e5e7eb",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              fontSize: "24px"
            }}>
              🔌
            </div>
            <BlockStack gap="100">
              <InlineStack gap="200" blockAlign="center">
                <Text as="p" variant="headingMd" fontWeight="bold">Facebook Not Connected</Text>
                <Badge tone="attention">Disconnected</Badge>
              </InlineStack>
              <Text as="p" variant="bodySm" tone="subdued">
                Connect your Facebook account to access pixels and catalogs
              </Text>
            </BlockStack>
          </InlineStack>
        </InlineStack>
      </Card>
    );
  }

  return (
    <Card background="bg-surface-success">
      <InlineStack align="space-between" blockAlign="center">
        <InlineStack gap="300" blockAlign="center">
          {user?.picture ? (
            <img 
              src={user.picture} 
              alt={user.name}
              style={{
                width: "48px",
                height: "48px",
                borderRadius: "50%",
                objectFit: "cover",
                border: "3px solid #1877f2"
              }}
            />
          ) : (
            <div style={{
              width: "48px",
              height: "48px",
              borderRadius: "50%",
              backgroundColor: "#1877f2",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              color: "white",
              fontWeight: "bold",
              fontSize: "20px"
            }}>
              {user?.name?.charAt(0)?.toUpperCase() || "F"}
            </div>
          )}
          <BlockStack gap="100">
            <InlineStack gap="200" blockAlign="center">
              <Text variant="headingMd" as="h3">Facebook Connected</Text>
              <Badge tone="success">Active</Badge>
            </InlineStack>
            <Text variant="bodySm" tone="subdued" as="p">
              Logged in as {user?.name || "Facebook User"} • {pixelsCount} pixel(s) available
            </Text>
          </BlockStack>
        </InlineStack>
        <InlineStack gap="200">
          <Button onClick={onRefresh} loading={isRefreshing}>
            Refresh
          </Button>
          <Button variant="plain" tone="critical" onClick={onDisconnect}>
            Disconnect
          </Button>
        </InlineStack>
      </InlineStack>
    </Card>
  );
}
