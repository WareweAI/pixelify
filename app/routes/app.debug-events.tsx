import type { ActionFunctionArgs, LoaderFunctionArgs } from "react-router";
import { Form, useActionData, useLoaderData } from "react-router";
import {
  Page,
  Layout,
  Card,
  Button,
  TextField,
  Banner,
  Text,
  Badge,
  Collapsible,
  DataTable,
} from "@shopify/polaris";
import { useState, useCallback } from "react";
import { getShopifyInstance } from "~/shopify.server";
import db from "../db.server";

export async function loader({ request }: LoaderFunctionArgs) {
  const shopify = getShopifyInstance();
  const { session } = await shopify.authenticate.admin(request);
  const shop = session.shop;

  const user = await db.user.findUnique({ where: { storeUrl: shop } });
  if (!user) {
    throw new Response("User not found for this shop", { status: 404 });
  }

  const app = await db.app.findFirst({
    where: { userId: user.id },
    include: {
      settings: true,
      customEvents: {
        where: { isActive: true },
        select: {
          id: true,
          name: true,
          displayName: true,
          selector: true,
          eventType: true,
          metaEventName: true,
        },
      }
    },
    orderBy: { createdAt: "desc" },
  });

  if (!app) {
    throw new Response("App not found for this shop", { status: 404 });
  }

  const twentyFourHoursAgo = new Date();
  twentyFourHoursAgo.setHours(twentyFourHoursAgo.getHours() - 24);

  const recentEcommerceEvents = await db.event.findMany({
    where: {
      appId: app.id,
      eventName: {
        in: ['AddToCart', 'InitiateCheckout', 'Purchase']
      },
      createdAt: { gte: twentyFourHoursAgo },
    },
    orderBy: { createdAt: "desc" },
    take: 20,
  });

  return Response.json({
    app,
    shop,
    recentEcommerceEvents,
  });
}

export async function action({ request }: ActionFunctionArgs) {
  const shopify = getShopifyInstance();
  const { session } = await shopify.authenticate.admin(request);
  const shop = session.shop;
  const formData = await request.formData();
  const action = formData.get("action");

  if (action === "test_event") {
    const eventName = formData.get("eventName") as string;
    const eventData = formData.get("eventData") as string;

    try {
      const user = await db.user.findUnique({ where: { storeUrl: shop } });
      if (!user) {
        return Response.json({ success: false, error: "User not found" });
      }

      const app = await db.app.findFirst({
        where: { userId: user.id },
        orderBy: { createdAt: "desc" },
      });

      if (!app) {
        return Response.json({ success: false, error: "App not found" });
      }

      // Check subscription for custom events
      const freeEvents = ['addToCart', 'viewContent', 'initiateCheckout', 'purchase', 'AddToCart', 'InitiateCheckout', 'Purchase', 'ViewContent', 'PageView'];
      if (app.plan === 'Free' && !freeEvents.includes(eventName)) {
        return Response.json({ success: false, error: "Custom events are not available on the free plan. Please upgrade to access custom event testing." });
      }

      // Parse event data
      let parsedEventData: any = {};
      if (eventData && eventData.trim() !== "") {
        try {
          parsedEventData = JSON.parse(eventData);
        } catch (e) {
          return Response.json({ success: false, error: "Invalid JSON in event data" });
        }
      }

      // Extract value and currency from parsed data
      const value = parsedEventData.value ? parseFloat(parsedEventData.value) : null;
      const currency = parsedEventData.currency || null;

      // Create test event
      await db.event.create({
        data: {
          appId: app.id,
          eventName: eventName,
          url: "https://debug-test.example.com",
          referrer: "debug-panel",
          sessionId: `debug_${Date.now()}`,
          fingerprint: `debug_${Date.now()}`,
          userAgent: "Debug Panel Test",
          browser: "Debug",
          os: "Debug",
          deviceType: "debug",
          pageTitle: "Debug Test Event",
          value: value,
          currency: currency,
          customData: {
            ...parsedEventData,
            debug_test: true,
            test_timestamp: new Date().toISOString(),
          },
        },
      });

      return Response.json({ 
        success: true, 
        message: `Test event "${eventName}" created successfully!` 
      });
    } catch (error) {
      console.error("Debug test event error:", error);
      return Response.json({ 
        success: false, 
        error: "Failed to create test event" 
      });
    }
  }

  return Response.json({ success: false, error: "Invalid action" });
}

type LoaderData = {
  app: any;
  shop: string;
  recentEcommerceEvents: any[];
};

type ActionData = {
  success?: boolean;
  error?: string;
  message?: string;
} | undefined;

export default function DebugEvents() {
  const { app, shop, recentEcommerceEvents } = useLoaderData<LoaderData>();
  const actionData = useActionData<ActionData>();
  const [testEventName, setTestEventName] = useState("test_debug_event");
  const [testEventData, setTestEventData] = useState(JSON.stringify({
    value: 29.99,
    currency: "USD",
    product_name: "Debug Test Product"
  }, null, 2));
  const [showInstructions, setShowInstructions] = useState(false);

  const handleTestEvent = useCallback(async (eventName: string, eventData?: any) => {
    try {
      const formData = new FormData();
      formData.append('action', 'test_event');
      formData.append('eventName', eventName);
      formData.append('eventData', eventData ? JSON.stringify(eventData) : testEventData);

      const response = await fetch('/app/debug-events', {
        method: 'POST',
        body: formData,
      });

      // Clone response for error handling
      const responseClone = response.clone();

      // Check if response is ok
      if (!response.ok) {
        const text = await response.text();
        console.error('Server error response:', text);
        alert(`❌ FAILED\n\nServer error (${response.status}). Check console for details.`);
        return;
      }

      let result;
      try {
        result = await response.json();
      } catch (parseError) {
        console.error('Failed to parse response as JSON:', parseError);
        try {
          const text = await responseClone.text();
          console.error('Raw response:', text);
        } catch (textError) {
          console.error('Could not read response text either:', textError);
        }
        alert(`❌ FAILED\n\nServer returned invalid JSON. Check console for details.`);
        return;
      }

      if (result.success) {
        alert(`✅ SUCCESS!\n\nTest event "${eventName}" created successfully!\n\n📍 The page will refresh to show the new event.`);
        window.location.reload(); // Refresh to show the new event
      } else {
        alert(`❌ FAILED\n\n${result.error || 'Unknown error'}`);
      }
    } catch (error: any) {
      console.error('Network error:', error);
      alert(`❌ ERROR\n\nFailed to send test event: ${error.message || error}`);
    }
  }, [testEventData]);

  return (
    <Page
      title="🔍 Event Debugging"
      subtitle="Test and debug your tracking events"
      backAction={{ content: "Settings", url: "/app/settings" }}
    >
      <Layout>
        {/* Success/Error Messages */}
        {actionData?.success && (
          <Layout.Section>
            <Banner tone="success" title="Success">
              <p>{actionData.message}</p>
            </Banner>
          </Layout.Section>
        )}

        {actionData?.error && (
          <Layout.Section>
            <Banner tone="critical" title="Error">
              <p>{actionData.error}</p>
            </Banner>
          </Layout.Section>
        )}

        {/* Debug Instructions */}
        <Layout.Section>
          <Card>
            <div style={{ padding: '20px' }}>
              <div style={{ display: 'flex', alignItems: 'center', marginBottom: '16px' }}>
                <div style={{
                  width: '40px',
                  height: '40px',
                  borderRadius: '10px',
                  backgroundColor: '#1e40af',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  marginRight: '12px'
                }}>
                  <span style={{ color: 'white', fontSize: '20px' }}>🔍</span>
                </div>
                <div>
                  <Text variant="headingMd" as="h2">Event Debugging Guide</Text>
                  <Text variant="bodyMd" as="p" tone="subdued">
                    Follow these steps to debug your tracking events
                  </Text>
                </div>
              </div>

              <Collapsible
                open={showInstructions}
                id="debug-instructions"
                transition={{ duration: '200ms', timingFunction: 'ease-in-out' }}
              >
                <div style={{ 
                  background: '#f8fafc', 
                  padding: '20px', 
                  borderRadius: '8px', 
                  border: '1px solid #e2e8f0',
                  marginTop: '16px'
                }}>
                  <div style={{ marginBottom: '20px' }}>
                    <Text variant="headingSm" as="h3">🚀 Step 1: Enable Debug Mode</Text>
                    <div style={{ marginTop: '8px', fontSize: '14px', lineHeight: '1.6' }}>
                      <p>Add this to your browser console on your store:</p>
                      <div style={{ 
                        background: '#1e293b', 
                        color: '#e2e8f0', 
                        padding: '12px', 
                        borderRadius: '6px', 
                        fontFamily: 'monospace',
                        fontSize: '13px',
                        marginTop: '8px'
                      }}>
                        PixelAnalytics.setDebug(true);
                      </div>
                    </div>
                  </div>

                  <div style={{ marginBottom: '20px' }}>
                    <Text variant="headingSm" as="h3">🧪 Step 2: Test Events</Text>
                    <div style={{ marginTop: '8px', fontSize: '14px', lineHeight: '1.6' }}>
                      <p>Use these console commands to test events:</p>
                      <div style={{ 
                        background: '#1e293b', 
                        color: '#e2e8f0', 
                        padding: '12px', 
                        borderRadius: '6px', 
                        fontFamily: 'monospace',
                        fontSize: '13px',
                        marginTop: '8px'
                      }}>
                        // Test Add to Cart<br/>
                        PixelAnalytics.debug.testAddToCart();<br/><br/>
                        // Test Custom Event<br/>
                        PixelAnalytics.debug.testCustomEvent('wishlist_add');<br/><br/>
                        // Analyze Page Elements<br/>
                        PixelAnalytics.debug.analyzeSelectors();
                      </div>
                    </div>
                  </div>

                  <div style={{ marginBottom: '20px' }}>
                    <Text variant="headingSm" as="h3">📊 Step 3: Check Facebook Events Manager</Text>
                    <div style={{ marginTop: '8px', fontSize: '14px', lineHeight: '1.6' }}>
                      <p>1. Go to Facebook Events Manager</p>
                      <p>2. Look for test events (they have "TEST" prefix)</p>
                      <p>3. Events should appear within 15-30 minutes</p>
                    </div>
                  </div>

                  <div>
                    <Text variant="headingSm" as="h3">🔧 Step 4: Fix Common Issues</Text>
                    <div style={{ marginTop: '8px', fontSize: '14px', lineHeight: '1.6' }}>
                      <p><strong>No Add to Cart events:</strong> Check CSS selectors in console output</p>
                      <p><strong>No Custom events:</strong> Verify selectors match your theme elements</p>
                      <p><strong>Events not in Facebook:</strong> Check Meta Pixel connection in Settings</p>
                    </div>
                  </div>
                </div>
              </Collapsible>

              <div style={{ marginTop: '16px' }}>
                <Button onClick={() => setShowInstructions(!showInstructions)}>
                  {showInstructions ? 'Hide Instructions' : 'Show Debug Instructions'}
                </Button>
              </div>
            </div>
          </Card>
        </Layout.Section>

        {/* Quick Tests */}
        <Layout.Section>
          <Card>
            <div style={{ padding: '20px' }}>
              <Text variant="headingMd" as="h2">⚡ Quick Event Tests</Text>
              <div style={{ marginBottom: '20px' }}>
                <Text variant="bodyMd" as="p" tone="subdued">
                  Test common e-commerce events instantly
                </Text>
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(250px, 1fr))', gap: '16px' }}>
                <Button 
                  variant="primary" 
                  onClick={() => handleTestEvent('addToCart', {
                    product_id: 'test-123',
                    product_name: 'Debug Test Product',
                    value: 29.99,
                    currency: 'USD',
                    quantity: 1
                  })}
                >
                  🛒 Test Add to Cart
                </Button>

                <Button 
                  onClick={() => handleTestEvent('viewContent', {
                    product_id: 'test-123',
                    product_name: 'Debug Test Product',
                    value: 29.99,
                    currency: 'USD',
                    content_type: 'product'
                  })}
                >
                  👁️ Test View Content
                </Button>

                <Button 
                  onClick={() => handleTestEvent('initiateCheckout', {
                    value: 59.98,
                    currency: 'USD',
                    num_items: 2
                  })}
                >
                  💳 Test Initiate Checkout
                </Button>

                <Button 
                  onClick={() => handleTestEvent('purchase', {
                    value: 59.98,
                    currency: 'USD',
                    transaction_id: 'test-order-123'
                  })}
                >
                  ✅ Test Purchase
                </Button>
              </div>
            </div>
          </Card>
        </Layout.Section>

        {/* Custom Event Test */}
        <Layout.Section>
          <Card>
            <div style={{ padding: '20px' }}>
              <Text variant="headingMd" as="h2">🎯 Custom Event Test</Text>
              <div style={{ marginBottom: '20px' }}>
                <Text variant="bodyMd" as="p" tone="subdued">
                  Test any custom event with custom data
                </Text>
              </div>

              <div style={{ display: 'grid', gap: '16px' }}>
                <TextField
                  label="Event Name"
                  value={testEventName}
                  onChange={setTestEventName}
                  placeholder="e.g., wishlist_add, newsletter_signup"
                  autoComplete="off"
                />

                <TextField
                  label="Event Data (JSON)"
                  value={testEventData}
                  onChange={setTestEventData}
                  multiline={6}
                  placeholder='{"value": 29.99, "currency": "USD"}'
                  autoComplete="off"
                />

                <Button 
                  variant="primary" 
                  onClick={() => handleTestEvent(testEventName)}
                >
                  🧪 Send Test Event
                </Button>
              </div>
            </div>
          </Card>
        </Layout.Section>

        {/* Active Events Summary */}
        <Layout.Section>
          <Card>
            <div style={{ padding: '20px' }}>
              <Text variant="headingMd" as="h2">📋 Active Events Summary</Text>
              <div style={{ marginBottom: '20px' }}>
                <Text variant="bodyMd" as="p" tone="subdued">
                  Current tracking configuration for {shop}
                </Text>
              </div>

              <div style={{ display: 'grid', gap: '12px' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '12px', background: '#f8fafc', borderRadius: '6px' }}>
                  <span>Page Views</span>
                  <Badge tone={app.settings?.autoTrackPageviews !== false ? 'success' : 'critical'}>
                    {app.settings?.autoTrackPageviews !== false ? 'Enabled' : 'Disabled'}
                  </Badge>
                </div>

                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '12px', background: '#f8fafc', borderRadius: '6px' }}>
                  <span>View Content</span>
                  <Badge tone={app.settings?.autoTrackViewContent !== false ? 'success' : 'critical'}>
                    {app.settings?.autoTrackViewContent !== false ? 'Enabled' : 'Disabled'}
                  </Badge>
                </div>

                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '12px', background: '#f8fafc', borderRadius: '6px' }}>
                  <span>Add to Cart</span>
                  <Badge tone={app.settings?.autoTrackAddToCart !== false ? 'success' : 'critical'}>
                    {app.settings?.autoTrackAddToCart !== false ? 'Enabled' : 'Disabled'}
                  </Badge>
                </div>

                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '12px', background: '#f8fafc', borderRadius: '6px' }}>
                  <span>Initiate Checkout</span>
                  <Badge tone={app.settings?.autoTrackInitiateCheckout !== false ? 'success' : 'critical'}>
                    {app.settings?.autoTrackInitiateCheckout !== false ? 'Enabled' : 'Disabled'}
                  </Badge>
                </div>

                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '12px', background: '#f8fafc', borderRadius: '6px' }}>
                  <span>Purchase</span>
                  <Badge tone={app.settings?.autoTrackPurchase !== false ? 'success' : 'critical'}>
                    {app.settings?.autoTrackPurchase !== false ? 'Enabled' : 'Disabled'}
                  </Badge>
                </div>

                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '12px', background: '#f8fafc', borderRadius: '6px' }}>
                  <span>Custom Events</span>
                  <Badge tone={app.customEvents?.length > 0 ? 'success' : 'attention'}>
                    {`${app.customEvents?.length || 0} Active`}
                  </Badge>
                </div>
              </div>
            </div>
          </Card>
        </Layout.Section>

        {/* Recent E-commerce Events */}
        <Layout.Section>
          <Card>
            <div style={{ padding: '20px' }}>
              <Text variant="headingMd" as="h2">🛒 Recent E-commerce Events</Text>
              <div style={{ marginBottom: '20px' }}>
                <Text variant="bodyMd" as="p" tone="subdued">
                  Latest Add to Cart, Initiate Checkout, and Purchase events from the last 24 hours
                </Text>
              </div>

              {recentEcommerceEvents.length > 0 ? (
                <DataTable
                  columnContentTypes={['text', 'text', 'text', 'text']}
                  headings={['Event Type', 'Value', 'Currency', 'Time']}
                  rows={recentEcommerceEvents.map((event: any) => [
                    <Badge
                      key={`event-${event.id}`}
                      tone={
                        event.eventName === 'Purchase' ? 'success' :
                        event.eventName === 'InitiateCheckout' ? 'warning' :
                        'info'
                      }
                    >
                      {event.eventName}
                    </Badge>,
                    <Text key={`value-${event.id}`} variant="bodyMd" fontWeight="medium" as="span">
                      {(() => {
                        const rawValue = event.value || event.customData?.value;
                        const numValue = typeof rawValue === 'number' ? rawValue : parseFloat(rawValue);
                        return !isNaN(numValue) ? `$${numValue.toFixed(2)}` : '-';
                      })()}
                    </Text>,
                    <Badge key={`currency-${event.id}`} tone="success">
                      {event.currency || event.customData?.currency || 'USD'}
                    </Badge>,
                    <Text key={`time-${event.id}`} variant="bodySm" tone="subdued" as="span">
                      {new Date(event.createdAt).toLocaleString()}
                    </Text>
                  ])}
                />
              ) : (
                <div style={{ textAlign: 'center', padding: '40px', color: '#6b7280' }}>
                  <Text variant="bodyMd" as="p">No e-commerce events in the last 24 hours</Text>
                  <Text variant="bodySm" as="p" tone="subdued">
                    Use the test buttons above to generate sample events
                  </Text>
                </div>
              )}
            </div>
          </Card>
        </Layout.Section>
      </Layout>
    </Page>
  );
}