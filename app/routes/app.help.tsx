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

              <Text variant="headingMd" as="h3">How Custom Events Work</Text>
              <Text as="p">
                Track any user interaction and send it to Facebook for better ad optimization
              </Text>

              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(300px, 1fr))', gap: '20px', marginBottom: '24px' }}>
                <div style={{
                  background: 'linear-gradient(135deg, #f0f9ff 0%, #e0f2fe 100%)',
                  padding: '20px',
                  borderRadius: '12px',
                  border: '1px solid #0ea5e9',
                  position: 'relative',
                  overflow: 'hidden'
                }}>
                  <div style={{ position: 'absolute', top: '-10px', right: '-10px', fontSize: '40px', opacity: 0.1 }}>📝</div>
                  <div style={{ display: 'flex', alignItems: 'center', marginBottom: '12px' }}>
                    <span style={{ fontSize: '20px', marginRight: '12px' }}>📝</span>
                    <strong style={{ color: '#0c4a6e', fontSize: '16px' }}>1. Create Event</strong>
                  </div>
                  <p style={{ margin: 0, fontSize: '14px', color: '#0369a1', lineHeight: '1.5' }}>
                    Name your event and choose where it should trigger. Use templates for common e-commerce events.
                  </p>
                </div>

                <div style={{
                  background: 'linear-gradient(135deg, #f0fdf4 0%, #dcfce7 100%)',
                  padding: '20px',
                  borderRadius: '12px',
                  border: '1px solid #10b981',
                  position: 'relative',
                  overflow: 'hidden'
                }}>
                  <div style={{ position: 'absolute', top: '-10px', right: '-10px', fontSize: '40px', opacity: 0.1 }}>🔗</div>
                  <div style={{ display: 'flex', alignItems: 'center', marginBottom: '12px' }}>
                    <span style={{ fontSize: '20px', marginRight: '12px' }}>🔗</span>
                    <strong style={{ color: '#065f46', fontSize: '16px' }}>2. Map to Facebook</strong>
                  </div>
                  <p style={{ margin: 0, fontSize: '14px', color: '#047857', lineHeight: '1.5' }}>
                    Connect to Facebook events like Purchase, AddToCart, Lead for better ad optimization.
                  </p>
                </div>

                <div style={{
                  background: 'linear-gradient(135deg, #fefce8 0%, #fef3c7 100%)',
                  padding: '20px',
                  borderRadius: '12px',
                  border: '1px solid #f59e0b',
                  position: 'relative',
                  overflow: 'hidden'
                }}>
                  <div style={{ position: 'absolute', top: '-10px', right: '-10px', fontSize: '40px', opacity: 0.1 }}>⚡</div>
                  <div style={{ display: 'flex', alignItems: 'center', marginBottom: '12px' }}>
                    <span style={{ fontSize: '20px', marginRight: '12px' }}>⚡</span>
                    <strong style={{ color: '#92400e', fontSize: '16px' }}>3. Choose Trigger</strong>
                  </div>
                  <p style={{ margin: 0, fontSize: '14px', color: '#a16207', lineHeight: '1.5' }}>
                    Manual code triggers or automatic CSS selectors that detect user interactions.
                  </p>
                </div>

                <div style={{
                  background: 'linear-gradient(135deg, #f3e8ff 0%, #e9d5ff 100%)',
                  padding: '20px',
                  borderRadius: '12px',
                  border: '1px solid #8b5cf6',
                  position: 'relative',
                  overflow: 'hidden'
                }}>
                  <div style={{ position: 'absolute', top: '-10px', right: '-10px', fontSize: '40px', opacity: 0.1 }}>🛡️</div>
                  <div style={{ display: 'flex', alignItems: 'center', marginBottom: '12px' }}>
                    <span style={{ fontSize: '20px', marginRight: '12px' }}>🛡️</span>
                    <strong style={{ color: '#6b21a8', fontSize: '16px' }}>4. Adblocker-Proof</strong>
                  </div>
                  <p style={{ margin: 0, fontSize: '14px', color: '#7c2d92', lineHeight: '1.5' }}>
                    All events are sent server-side via Facebook CAPI, bypassing adblockers completely.
                  </p>
                </div>
              </div>

              <div style={{
                background: 'linear-gradient(135deg, #ecfdf5 0%, #d1fae5 100%)',
                padding: '20px',
                borderRadius: '12px',
                border: '1px solid #10b981',
                borderLeft: '6px solid #10b981'
              }}>
                <div style={{ display: 'flex', alignItems: 'flex-start' }}>
                  <span style={{ color: '#10b981', fontSize: '24px', marginRight: '12px', marginTop: '2px' }}>💡</span>
                  <div>
                    <strong style={{ color: '#065f46', fontSize: '16px' }}>Pro Tips:</strong>
                    <div style={{ marginTop: '8px', color: '#047857', fontSize: '14px', lineHeight: '1.6' }}>
                      <p style={{ margin: '0 0 8px 0' }}>
                        • Use <code style={{ background: '#bbf7d0', padding: '2px 6px', borderRadius: '4px', fontSize: '13px' }}>PixelAnalytics.track('event_name', data)</code> in your theme code for manual triggers
                      </p>
                      <p style={{ margin: '0 0 8px 0' }}>
                        • Set up automatic triggers with CSS selectors like <code style={{ background: '#bbf7d0', padding: '2px 6px', borderRadius: '4px', fontSize: '13px' }}>.add-to-cart-btn</code>
                      </p>
                      <p style={{ margin: 0 }}>
                        • Test events before going live using the built-in test functionality
                      </p>
                    </div>
                  </div>
                </div>
              </div>

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

                <Card background="bg-surface-secondary">
                  <BlockStack gap="200">
                    <Text variant="headingSm" as="h4">Add to Cart Selector Troubleshooting</Text>
                    <div style={{ marginTop: '12px', color: '#374151', fontSize: '14px', lineHeight: '1.6' }}>
                      <p style={{ margin: '0 0 12px 0' }}><strong>Common Shopify Add-to-Cart Selectors:</strong></p>
                      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '8px', marginBottom: '12px' }}>
                        <div style={{ background: '#f9fafb', padding: '8px', borderRadius: '6px', border: '1px solid #d1d5db' }}>
                          <code style={{ background: '#e5e7eb', padding: '2px 6px', borderRadius: '4px', fontSize: '13px', fontWeight: 'bold' }}>.add-to-cart</code>
                          <div style={{ fontSize: '12px', color: '#6b7280', marginTop: '4px' }}>Most common selector</div>
                        </div>
                        <div style={{ background: '#f9fafb', padding: '8px', borderRadius: '6px', border: '1px solid #d1d5db' }}>
                          <code style={{ background: '#e5e7eb', padding: '2px 6px', borderRadius: '4px', fontSize: '13px', fontWeight: 'bold' }}>.product-form__cart-submit</code>
                          <div style={{ fontSize: '12px', color: '#6b7280', marginTop: '4px' }}>Dawn theme</div>
                        </div>
                        <div style={{ background: '#f9fafb', padding: '8px', borderRadius: '6px', border: '1px solid #d1d5db' }}>
                          <code style={{ background: '#e5e7eb', padding: '2px 6px', borderRadius: '4px', fontSize: '13px', fontWeight: 'bold' }}>[name="add"]</code>
                          <div style={{ fontSize: '12px', color: '#6b7280', marginTop: '4px' }}>Form input attribute</div>
                        </div>
                        <div style={{ background: '#f9fafb', padding: '8px', borderRadius: '6px', border: '1px solid #d1d5db' }}>
                          <code style={{ background: '#e5e7eb', padding: '2px 6px', borderRadius: '4px', fontSize: '13px', fontWeight: 'bold' }}>.btn-add-to-cart</code>
                          <div style={{ fontSize: '12px', color: '#6b7280', marginTop: '4px' }}>Custom themes</div>
                        </div>
                      </div>
                      <div style={{ background: '#fefce8', padding: '12px', borderRadius: '8px', border: '1px solid #fbbf24' }}>
                        <strong style={{ color: '#92400e' }}>How to find the correct selector:</strong>
                        <ol style={{ margin: '8px 0 0 20px', padding: 0 }}>
                          <li style={{ marginBottom: '4px' }}>Open your product page in a browser</li>
                          <li style={{ marginBottom: '4px' }}>Right-click the "Add to Cart" button → "Inspect"</li>
                          <li style={{ marginBottom: '4px' }}>Copy the class name or ID from the HTML</li>
                          <li style={{ marginBottom: '4px' }}>Use "🧪 Test Event" to verify it works</li>
                          <li>Check Facebook Events Manager for test events</li>
                        </ol>
                      </div>
                    </div>
                  </BlockStack>
                </Card>
              </BlockStack>
            </BlockStack>
          </Card>
        </Layout.Section>
      </Layout>
    </Page>
  );
}
