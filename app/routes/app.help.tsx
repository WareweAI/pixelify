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
  Badge,
  Divider,
  List,
  Button,
  Banner,
} from "@shopify/polaris";
import { QuestionCircleIcon, CodeIcon, SettingsIcon } from "@shopify/polaris-icons";

export const loader = async ({ request }: LoaderFunctionArgs) => {
  const shopify = getShopifyInstance();
  const { session } = await shopify.authenticate.admin(request);

  return { shop: session.shop };
};

export default function Help() {
  const { shop } = useLoaderData<typeof loader>();

  return (
    <Page
      title="Help & Documentation"
      subtitle="Learn how to use Pixelify features effectively"
    >
      <Layout>
        <Layout.Section>
          <Card>
            <BlockStack gap="400">
              <InlineStack align="space-between">
                <Text variant="headingMd" as="h2">
                  Custom Events Documentation
                </Text>
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                  <QuestionCircleIcon />
                  <Badge tone="info">Guide</Badge>
                </div>
              </InlineStack>

              <Divider />

              <Text variant="headingMd" as="h3">What are Custom Events?</Text>
              <Text as="p">
                Custom events allow you to track specific user interactions on your store that aren't covered by default e-commerce events.
                You can track button clicks, form submissions, page scrolls, and more.
              </Text>

              <Text variant="headingMd" as="h3">Event Types</Text>
              <BlockStack gap="200">
                <Card background="bg-surface-secondary">
                  <BlockStack gap="200">
                    <Text variant="headingSm" as="h4">Click Events</Text>
                    <Text as="p">Track when users click specific elements like buttons, links, or images.</Text>
                    <Text variant="bodySm" tone="subdued" as="p">
                      Example: Track "Add to Wishlist" button clicks
                    </Text>
                  </BlockStack>
                </Card>

                <Card background="bg-surface-secondary">
                  <BlockStack gap="200">
                    <Text variant="headingSm" as="h4">Submit Events</Text>
                    <Text as="p">Track form submissions like newsletter signups, contact forms, or reviews.</Text>
                    <Text variant="bodySm" tone="subdued" as="p">
                      Example: Track newsletter subscription forms
                    </Text>
                  </BlockStack>
                </Card>

                <Card background="bg-surface-secondary">
                  <BlockStack gap="200">
                    <Text variant="headingSm" as="h4">Scroll Events</Text>
                    <Text as="p">Track when users scroll to specific sections of your pages.</Text>
                    <Text variant="bodySm" tone="subdued" as="p">
                      Example: Track when users reach product reviews section
                    </Text>
                  </BlockStack>
                </Card>

                <Card background="bg-surface-secondary">
                  <BlockStack gap="200">
                    <Text variant="headingSm" as="h4">Page Load Events</Text>
                    <Text as="p">Track when specific pages are loaded or viewed.</Text>
                    <Text variant="bodySm" tone="subdued" as="p">
                      Example: Track visits to specific collection pages
                    </Text>
                  </BlockStack>
                </Card>
              </BlockStack>

              <Text variant="headingMd" as="h3">CSS Selectors Guide</Text>
              <Text as="p">
                CSS selectors tell Pixelify which elements to track. Here are common patterns:
              </Text>

              <Card background="bg-surface-secondary">
                <BlockStack gap="300">
                  <Text variant="headingSm" as="h4">Common Selector Examples</Text>

                  <BlockStack gap="200">
                    <div>
                      <Text as="p" variant="bodySm" fontWeight="semibold">Class selector:</Text>
                      <span style={{ fontFamily: 'monospace', backgroundColor: '#f4f4f4', padding: '2px 4px', borderRadius: '3px', fontSize: '0.875rem' }}>.add-to-cart</span>
                      <Text variant="bodySm" tone="subdued" as="p">Tracks elements with class "add-to-cart"</Text>
                    </div>

                    <div>
                      <Text as="p" variant="bodySm" fontWeight="semibold">ID selector:</Text>
                      <span style={{ fontFamily: 'monospace', backgroundColor: '#f4f4f4', padding: '2px 4px', borderRadius: '3px', fontSize: '0.875rem' }}>#newsletter-form</span>
                      <Text variant="bodySm" tone="subdued" as="p">Tracks element with ID "newsletter-form"</Text>
                    </div>

                    <div>
                      <Text as="p" variant="bodySm" fontWeight="semibold">Multiple selectors:</Text>
                      <span style={{ fontFamily: 'monospace', backgroundColor: '#f4f4f4', padding: '2px 4px', borderRadius: '3px', fontSize: '0.875rem' }}>.btn-primary, .add-to-cart, [name="add"]</span>
                      <Text variant="bodySm" tone="subdued" as="p">Tracks any element matching these selectors</Text>
                    </div>

                    <div>
                      <Text as="p" variant="bodySm" fontWeight="semibold">Attribute selector:</Text>
                      <span style={{ fontFamily: 'monospace', backgroundColor: '#f4f4f4', padding: '2px 4px', borderRadius: '3px', fontSize: '0.875rem' }}>[data-action="add-to-cart"]</span>
                      <Text variant="bodySm" tone="subdued" as="p">Tracks elements with specific data attributes</Text>
                    </div>
                  </BlockStack>
                </BlockStack>
              </Card>

              <Text variant="headingMd" as="h3">Page Type Targeting</Text>
              <List type="bullet">
                <List.Item><strong>All Pages:</strong> Event triggers on every page of your store</List.Item>
                <List.Item><strong>Product Pages:</strong> Only triggers on individual product pages</List.Item>
                <List.Item><strong>Collection Pages:</strong> Only triggers on collection/category pages</List.Item>
                <List.Item><strong>Cart Page:</strong> Only triggers on the shopping cart page</List.Item>
                <List.Item><strong>Checkout Pages:</strong> Only triggers during the checkout process</List.Item>
                <List.Item><strong>Home Page:</strong> Only triggers on your store's homepage</List.Item>
                <List.Item><strong>Custom URL:</strong> Specify exact URLs or URL patterns</List.Item>
              </List>

              <Text variant="headingMd" as="h3">Meta Event Mapping</Text>
              <Text as="p">
                Map your custom events to Facebook Meta events for better ad optimization:
              </Text>

              <Card background="bg-surface-secondary">
                <BlockStack gap="200">
                  <Text variant="headingSm" as="h4">Popular Meta Events</Text>
                  <List type="bullet">
                    <List.Item><strong>AddToWishlist:</strong> For wishlist additions</List.Item>
                    <List.Item><strong>Contact:</strong> For contact form submissions</List.Item>
                    <List.Item><strong>Lead:</strong> For lead generation forms</List.Item>
                    <List.Item><strong>Search:</strong> For search interactions</List.Item>
                    <List.Item><strong>ViewContent:</strong> For content views</List.Item>
                    <List.Item><strong>CompleteRegistration:</strong> For account signups</List.Item>
                  </List>
                </BlockStack>
              </Card>

              <Text variant="headingMd" as="h3">Event Data (JSON)</Text>
              <Text as="p">
                Add custom data to your events using JSON format. This data is sent to Facebook for better targeting:
              </Text>

              <Card background="bg-surface-secondary">
                <BlockStack gap="200">
                  <Text variant="headingSm" as="h4">Example Event Data</Text>
                  <pre style={{ fontFamily: 'monospace', backgroundColor: '#f4f4f4', padding: '12px', borderRadius: '4px', overflow: 'auto', fontSize: '0.875rem', lineHeight: '1.5', margin: '0' }}>
                    {`{
  "content_category": "Electronics",
  "content_name": "Wireless Headphones",
  "value": 99.99,
  "currency": "USD"
}`}
                  </pre>
                </BlockStack>
              </Card>

              <Text variant="headingMd" as="h3">Testing Your Events</Text>
              <Banner tone="info">
                <Text as="p">
                  Use the "Test Event" button to verify your custom events are working correctly.
                  This sends a test event to Facebook and shows you the response.
                </Text>
              </Banner>

              <Text variant="headingMd" as="h3">Best Practices</Text>
              <List type="number">
                <List.Item>Use descriptive names for your events (e.g., "newsletter_signup" instead of "event1")</List.Item>
                <List.Item>Test selectors on your live store to ensure they work correctly</List.Item>
                <List.Item>Use specific selectors to avoid tracking unintended elements</List.Item>
                <List.Item>Map events to appropriate Meta events for better ad performance</List.Item>
                <List.Item>Include relevant event data for better audience targeting</List.Item>
                <List.Item>Regularly review and clean up unused events</List.Item>
              </List>

              <Text variant="headingMd" as="h3">Troubleshooting</Text>
              <BlockStack gap="200">
                <Card background="bg-surface-secondary">
                  <BlockStack gap="200">
                    <Text variant="headingSm" as="h4">Event Not Triggering?</Text>
                    <List type="bullet">
                      <List.Item>Check if the CSS selector matches elements on your page</List.Item>
                      <List.Item>Verify the page type setting matches where you're testing</List.Item>
                      <List.Item>Ensure the event is enabled (toggle switch is on)</List.Item>
                      <List.Item>Check browser console for any JavaScript errors</List.Item>
                    </List>
                  </BlockStack>
                </Card>

                <Card background="bg-surface-secondary">
                  <BlockStack gap="200">
                    <Text variant="headingSm" as="h4">Events Not Showing in Facebook?</Text>
                    <List type="bullet">
                      <List.Item>Verify your Facebook Pixel is connected and verified</List.Item>
                      <List.Item>Check that Meta event mapping is set correctly</List.Item>
                      <List.Item>Allow up to 20 minutes for events to appear in Facebook Events Manager</List.Item>
                      <List.Item>Use Facebook's Test Events tool to debug</List.Item>
                    </List>
                  </BlockStack>
                </Card>
              </BlockStack>
            </BlockStack>
          </Card>
        </Layout.Section>

        <Layout.Section variant="oneThird">
          <BlockStack gap="400">
            <Card>
              <BlockStack gap="300">
                <InlineStack align="space-between">
                  <Text variant="headingMd" as="h3">Quick Actions</Text>
                  <CodeIcon />
                </InlineStack>
                <Button url="/app/custom-events" variant="primary">
                  Manage Custom Events
                </Button>
                <Button url="/app/settings" variant="secondary">
                  Facebook Pixel Settings
                </Button>
                <Button url="/app/conversions" variant="secondary">
                  View Conversions
                </Button>
              </BlockStack>
            </Card>

            <Card>
              <BlockStack gap="300">
                <InlineStack align="space-between">
                  <Text variant="headingMd" as="h3">Need More Help?</Text>
                  <SettingsIcon />
                </InlineStack>
                <Text as="p">
                  If you need additional assistance, check out our detailed guides or contact support.
                </Text>
                <Button url="mailto:support@pixelify.app" external>
                  Contact Support
                </Button>
              </BlockStack>
            </Card>
          </BlockStack>
        </Layout.Section>
      </Layout>
    </Page>
  );
}
