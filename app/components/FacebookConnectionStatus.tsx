import { Card, InlineStack, BlockStack, Text, Badge, Button } from "@shopify/polaris";

interface FacebookConnectionStatusProps {
  isConnected: boolean;
  facebookUser?: {
    id: string;
    name: string;
    picture?: string | null;
  } | null;
  onConnect?: () => void;
  onDisconnect?: () => void;
  showActions?: boolean;
}

export function FacebookConnectionStatus({
  isConnected,
  facebookUser,
  onConnect,
  onDisconnect,
  showActions = true,
}: FacebookConnectionStatusProps) {
  if (!isConnected || !facebookUser) {
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
          {showActions && onConnect && (
            <Button variant="primary" onClick={onConnect}>
              Connect Facebook
            </Button>
          )}
        </InlineStack>
      </Card>
    );
  }

  return (
    <Card>
      <InlineStack align="space-between" blockAlign="center">
        <InlineStack gap="400" blockAlign="center">
          {facebookUser.picture ? (
            <img 
              src={facebookUser.picture} 
              alt={facebookUser.name}
              style={{
                width: "56px",
                height: "56px",
                borderRadius: "50%",
                objectFit: "cover",
                border: "3px solid #1877f2"
              }}
            />
          ) : (
            <div style={{
              width: "56px",
              height: "56px",
              borderRadius: "50%",
              backgroundColor: "#1877f2",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              color: "white",
              fontWeight: "bold",
              fontSize: "24px"
            }}>
              {facebookUser.name.charAt(0).toUpperCase()}
            </div>
          )}
          <BlockStack gap="100">
            <InlineStack gap="200" blockAlign="center">
              <Text as="p" variant="headingMd" fontWeight="bold">{facebookUser.name}</Text>
              <Badge tone="success">Connected</Badge>
            </InlineStack>
            <Text as="p" variant="bodySm" tone="subdued">
              Facebook account is connected and active
            </Text>
          </BlockStack>
        </InlineStack>
        {showActions && onDisconnect && (
          <Button onClick={onDisconnect}>
            Disconnect
          </Button>
        )}
      </InlineStack>
    </Card>
  );
}
