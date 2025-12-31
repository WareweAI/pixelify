import { redirect } from "react-router";
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

  return Response.json({
    app,
    shop,
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

      // Parse event data
      let parsedEventData = {};
      if (eventData && eventData.trim() !== "") {
        try {
          parsedEventData = JSON.parse(eventData);
        } catch (e) {
          return Response.json({ success: false, error: "Invalid JSON in event data" });
        }
      }

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
};

type ActionData = {
  success?: boolean;
  error?: string;
  message?: string;
} | undefined;

export default function DebugEvents() {
  const { app, shop } = useLoaderData<LoaderData>();
  const actionData = useActionData<ActionData>();
  const [testEventName, setTestEventName] = useState("test_debug_event");
  const [testEventData, setTestEventData] = useState(JSON.stringify({
    value: 29.99,
    currency: "USD",
    product_name: "Debug Test Product"
  }, null, 2));
  const [showInstructions, setShowInstructions] = useState(false);

  const handleTestEvent = useCallback((eventName: string, eventData?: any) => {
    const form = document.createElement('form');
    form.method = 'POST';
    form.style.display = 'none';
    
    const actionInput = document.createElement('input');
    actionInput.type = 'hidden';
    actionInput.name = 'action';
    actionInput.value = 'test_event';
    form.appendChild(actionInput);
    
    const nameInput = document.createElement('input');
    nameInput.type = 'hidden';
    nameInput.name = 'eventName';
    nameInput.value = eventName;
    form.appendChild(nameInput);
    
    const dataInput = document.createElement('input');
    dataInput.type = 'hidden';
    dataInput.name = 'eventData';
    dataInput.value = eventData ? JSON.stringify(eventData) : testEventData;
    form.appendChild(dataInput);
    
    document.body.appendChild(form);
    form.submit();
    document.body.removeChild(form);
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
            <Banner status="success" title="Success">
              <p>{actionData.message}</p>
            </Banner>
          </Layout.Section>
        )}

        {actionData?.error && (
          <Layout.Section>
            <Banner status="critical" title="Error">
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
              <Text variant="bodyMd" as="p" tone="subdued" style={{ marginBottom: '20px' }}>
                Test common e-commerce events instantly
              </Text>

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
              <Text variant="bodyMd" as="p" tone="subdued" style={{ marginBottom: '20px' }}>
                Test any custom event with custom data
              </Text>

              <div style={{ display: 'grid', gap: '16px' }}>
                <TextField
                  label="Event Name"
                  value={testEventName}
                  onChange={setTestEventName}
                  placeholder="e.g., wishlist_add, newsletter_signup"
                />

                <TextField
                  label="Event Data (JSON)"
                  value={testEventData}
                  onChange={setTestEventData}
                  multiline={6}
                  placeholder='{"value": 29.99, "currency": "USD"}'
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
              <Text variant="bodyMd" as="p" tone="subdued" style={{ marginBottom: '20px' }}>
                Current tracking configuration for {shop}
              </Text>

              <div style={{ display: 'grid', gap: '12px' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '12px', background: '#f8fafc', borderRadius: '6px' }}>
                  <span>Page Views</span>
                  <Badge status={app.settings?.autoTrackPageviews !== false ? 'success' : 'critical'}>
                    {app.settings?.autoTrackPageviews !== false ? 'Enabled' : 'Disabled'}
                  </Badge>
                </div>

                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '12px', background: '#f8fafc', borderRadius: '6px' }}>
                  <span>View Content</span>
                  <Badge status={app.settings?.autoTrackViewContent !== false ? 'success' : 'critical'}>
                    {app.settings?.autoTrackViewContent !== false ? 'Enabled' : 'Disabled'}
                  </Badge>
                </div>

                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '12px', background: '#f8fafc', borderRadius: '6px' }}>
                  <span>Add to Cart</span>
                  <Badge status={app.settings?.autoTrackAddToCart !== false ? 'success' : 'critical'}>
                    {app.settings?.autoTrackAddToCart !== false ? 'Enabled' : 'Disabled'}
                  </Badge>
                </div>

                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '12px', background: '#f8fafc', borderRadius: '6px' }}>
                  <span>Initiate Checkout</span>
                  <Badge status={app.settings?.autoTrackInitiateCheckout !== false ? 'success' : 'critical'}>
                    {app.settings?.autoTrackInitiateCheckout !== false ? 'Enabled' : 'Disabled'}
                  </Badge>
                </div>

                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '12px', background: '#f8fafc', borderRadius: '6px' }}>
                  <span>Purchase</span>
                  <Badge status={app.settings?.autoTrackPurchase !== false ? 'success' : 'critical'}>
                    {app.settings?.autoTrackPurchase !== false ? 'Enabled' : 'Disabled'}
                  </Badge>
                </div>

                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '12px', background: '#f8fafc', borderRadius: '6px' }}>
                  <span>Custom Events</span>
                  <Badge status={app.customEvents?.length > 0 ? 'success' : 'attention'}>
                    {app.customEvents?.length || 0} Active
                  </Badge>
                </div>
              </div>
            </div>
          </Card>
        </Layout.Section>
      </Layout>
    </Page>
  );
}