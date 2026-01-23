import { Card, InlineStack, BlockStack, Text, Badge, Button } from "@shopify/polaris";
import { ClientOnly } from "~/components/ClientOnly";

interface FacebookConnectionStatusProps {
  mounted: boolean;
  isConnectedToFacebook: boolean;
  facebookUser: { id: string; name: string; picture?: string | null } | null;
  facebookPixels: Array<{ id: string; name: string; accountName: string }>;
  isRefreshingToken: boolean;
  onRefreshFacebookData: () => void;
  onDisconnectFacebook: () => void;
}

export function FacebookConnectionStatus({
  mounted,
  isConnectedToFacebook,
  facebookUser,
  facebookPixels,
  isRefreshingToken,
  onRefreshFacebookData,
  onDisconnectFacebook,
}: FacebookConnectionStatusProps) {
  return (
    <ClientOnly>
      {mounted && isConnectedToFacebook ? (
        <Card>
          <InlineStack align="space-between" blockAlign="center">
            <InlineStack gap="300" blockAlign="center">
              {facebookUser?.picture ? (
                <img 
                  src={facebookUser.picture} 
                  alt={facebookUser.name}
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
                  {facebookUser?.name?.charAt(0)?.toUpperCase() || "F"}
                </div>
              )}
              <BlockStack gap="100">
                <InlineStack gap="200" blockAlign="center">
                  <Text variant="headingMd" as="h3">Facebook Connected</Text>
                  <Badge tone="success">Active</Badge>
                </InlineStack>
                <Text variant="bodySm" tone="subdued" as="p">
                  Logged in as {facebookUser?.name || "Facebook User"} • {facebookPixels.length} pixel(s) available
                </Text>
              </BlockStack>
            </InlineStack>
            <InlineStack gap="200">
              <Button onClick={onRefreshFacebookData} loading={isRefreshingToken}>
                Refresh
              </Button>
              <Button variant="plain" tone="critical" onClick={onDisconnectFacebook}>
                Disconnect
              </Button>
            </InlineStack>
          </InlineStack>
        </Card>
      ) : null}
    </ClientOnly>
  );
}
