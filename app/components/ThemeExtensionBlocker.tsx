import { 
  Page, 
  Card, 
  BlockStack, 
  Text, 
  Button, 
  InlineStack,
  Icon,
  Banner,
  List
} from "@shopify/polaris";
import { AlertTriangleIcon, ExternalIcon } from "@shopify/polaris-icons";

interface ThemeExtensionBlockerProps {
  shop: string;
  themeName?: string;
  onRefresh?: () => void;
}

export function ThemeExtensionBlocker({ shop, themeName, onRefresh }: ThemeExtensionBlockerProps) {
  const themeEditorUrl = `https://${shop}/admin/themes/current/editor?context=apps`;
  
  return (
    <Page
      title="Theme Extension Required"
      subtitle="Enable the Pixelify theme extension to use tracking features"
    >
      <BlockStack gap="600">
        {/* Warning Banner */}
        <Banner tone="warning">
          <BlockStack gap="200">
            <Text variant="bodyMd" fontWeight="medium">
              Theme Extension Not Enabled
            </Text>
            <Text variant="bodySm">
              The Pixelify theme extension must be enabled in your theme to track customer events and conversions.
            </Text>
          </BlockStack>
        </Banner>

        {/* Main Instruction Card */}
        <Card>
          <BlockStack gap="400">
            <InlineStack gap="300" blockAlign="center">
              <div style={{ 
                padding: "12px", 
                backgroundColor: "#FFF4E5", 
                borderRadius: "8px",
                display: "flex",
                alignItems: "center",
                justifyContent: "center"
              }}>
                <Icon source={AlertTriangleIcon} tone="warning" />
              </div>
              <BlockStack gap="100">
                <Text variant="headingMd" as="h2">
                  Enable Theme Extension
                </Text>
                <Text variant="bodySm" tone="subdued">
                  Required for pixel tracking and analytics
                </Text>
              </BlockStack>
            </InlineStack>

            <Text variant="bodyMd">
              To start tracking customer behavior and conversions, you need to enable the Pixelify theme extension in your Shopify theme editor.
            </Text>

            {/* Step-by-step instructions */}
            <BlockStack gap="300">
              <Text variant="headingSm" as="h3">
                How to Enable:
              </Text>
              
              <List type="number">
                <List.Item>
                  Click the "Open Theme Editor" button below
                </List.Item>
                <List.Item>
                  In the theme editor, look for "App embeds" in the left sidebar
                </List.Item>
                <List.Item>
                  Find "Pixelify Tracker" and toggle it ON
                </List.Item>
                <List.Item>
                  Click "Save" in the theme editor
                </List.Item>
                <List.Item>
                  Return here and click "Check Again"
                </List.Item>
              </List>
            </BlockStack>

            {/* Action buttons */}
            <InlineStack gap="300">
              <Button
                variant="primary"
                size="large"
                url={themeEditorUrl}
                external
                icon={ExternalIcon}
              >
                Open Theme Editor
              </Button>
              
              {onRefresh && (
                <Button
                  size="large"
                  onClick={onRefresh}
                >
                  Check Again
                </Button>
              )}
            </InlineStack>
          </BlockStack>
        </Card>

        {/* Additional Information Card */}
        <Card>
          <BlockStack gap="300">
            <Text variant="headingSm" as="h3">
              Why is this required?
            </Text>
            
            <BlockStack gap="200">
              <Text variant="bodySm">
                • <strong>Event Tracking:</strong> Captures customer interactions like page views, add to cart, and purchases
              </Text>
              <Text variant="bodySm">
                • <strong>Conversion Analytics:</strong> Provides detailed insights into customer behavior
              </Text>
              <Text variant="bodySm">
                • <strong>Facebook Pixel Integration:</strong> Enables Facebook advertising optimization
              </Text>
              <Text variant="bodySm">
                • <strong>Custom Events:</strong> Tracks specific actions you define for your store
              </Text>
            </BlockStack>
          </BlockStack>
        </Card>

        {/* Troubleshooting Card */}
        <Card>
          <BlockStack gap="300">
            <Text variant="headingSm" as="h3">
              Need Help?
            </Text>
            
            <BlockStack gap="200">
              <Text variant="bodySm">
                If you're having trouble finding the theme extension:
              </Text>
              
              <List>
                <List.Item>
                  Make sure you're in the correct theme ({themeName || 'your published theme'})
                </List.Item>
                <List.Item>
                  Look for "App embeds" or "Apps" section in the theme editor sidebar
                </List.Item>
                <List.Item>
                  The extension might be listed as "Pixelify Tracker" or "Pixel Tracker"
                </List.Item>
                <List.Item>
                  Try refreshing the theme editor if you don't see it immediately
                </List.Item>
              </List>
            </BlockStack>

            <Text variant="bodySm" tone="subdued">
              Still having issues? Contact our support team for assistance.
            </Text>
          </BlockStack>
        </Card>
      </BlockStack>
    </Page>
  );
}