import { useState, useEffect } from "react";
import type { LoaderFunctionArgs } from "react-router";
import { useLoaderData, useFetcher } from "react-router";
import { getShopifyInstance } from "../shopify.server";
import {
  Page,
  Card,
  Button,
  TextField,
  Layout,
  Text,
  BlockStack,
  InlineStack,
  Banner,
  Badge,
  IndexTable,
  Modal,
  Select,
  Box,
} from "@shopify/polaris";
import { EditIcon } from "@shopify/polaris-icons";

interface PixelData {
  id: string;
  appId: string;
  name: string;
  enabled: boolean;
  metaPixelId: string | null;
  metaPixelEnabled: boolean;
  testEventCode: string | null;
  trackingPages: string;
  serverSideEnabled: boolean;
}

export const loader = async ({ request }: LoaderFunctionArgs) => {
  const shopify = getShopifyInstance();
  if (!shopify?.authenticate) throw new Response("Shopify not configured", { status: 500 });

  // Only handle Shopify authentication
  let session;
  try {
    const authResult = await shopify.authenticate.admin(request);
    session = authResult.session;
  } catch (error) {
    if (error instanceof Response) throw error;
    throw new Response("Authentication failed", { status: 401 });
  }

  const shop = session.shop;

  // Return only shop info - all data will be fetched from API
  return { shop };
};

export default function PixelsPage() {
  const { shop } = useLoaderData<typeof loader>();
  const fetcher = useFetcher();
  
  // Pixels data state (loaded from API)
  const [pixels, setPixels] = useState<PixelData[]>([]);
  const [isLoadingData, setIsLoadingData] = useState(true);
  
  const [searchQuery, setSearchQuery] = useState("");
  const [showTestModal, setShowTestModal] = useState(false);
  const [selectedPixel, setSelectedPixel] = useState<PixelData | null>(null);
  const [testEventName, setTestEventName] = useState("TestEvent");
  const [isSendingTest, setIsSendingTest] = useState(false);
  const [testResult, setTestResult] = useState<{ success: boolean; message: string } | null>(null);

  // Load pixels data from API on mount
  useEffect(() => {
    const loadPixelsData = async () => {
      try {
        setIsLoadingData(true);
        const response = await fetch('/api/pixel');
        const data = await response.json();
        
        if (data.error) {
          console.error('[Pixels] Error loading data:', data.error);
        } else if (data.pixels) {
          setPixels(data.pixels);
        }
      } catch (error) {
        console.error('[Pixels] Failed to load data:', error);
      } finally {
        setIsLoadingData(false);
      }
    };
    
    loadPixelsData();
  }, []);

  const filteredPixels = pixels.filter(p => 
    p.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
    p.appId.toLowerCase().includes(searchQuery.toLowerCase()) ||
    (p.metaPixelId && p.metaPixelId.toLowerCase().includes(searchQuery.toLowerCase()))
  );

  useEffect(() => {
    if (fetcher.data?.pixels) {
      setPixels(fetcher.data.pixels);
    }
    if (fetcher.data?.testResult) {
      setTestResult(fetcher.data.testResult);
      setIsSendingTest(false);
    }
  }, [fetcher.data]);

  const handleToggleServerSide = (pixelId: string, enabled: boolean) => {
    setPixels(prev => prev.map(p => 
      p.id === pixelId ? { ...p, serverSideEnabled: !enabled } : p
    ));
    fetcher.submit(
      { intent: "toggle-server-side", pixelId, enabled: String(!enabled) },
      { method: "POST", action: "/api/pixel" }
    );
  };

  const handleSendTestEvent = () => {
    if (!selectedPixel) return;
    setIsSendingTest(true);
    setTestResult(null);
    
    fetcher.submit(
      {
        intent: "send-test-event",
        pixelId: selectedPixel.id,
        eventName: testEventName,
      },
      { method: "POST", action: "/api/pixel" }
    );
  };

  const openTestModal = (pixel: PixelData) => {
    setSelectedPixel(pixel);
    setShowTestModal(true);
    setTestResult(null);
  };

  const getTrackingPagesLabel = (trackingPages: string) => {
    switch (trackingPages) {
      case "all": return "All pages";
      case "selected": return "Selected pages";
      case "excluded": return "Excluded pages";
      default: return "All pages";
    }
  };

  return (
    <Page 
      title="Pixel" 
      primaryAction={{
        content: "Add Pixel",
        url: "/app/dashboard",
      }}
    >
      <Layout>
        {fetcher.data?.message && (
          <Layout.Section>
            <Banner tone="success" onDismiss={() => {}}>
              {fetcher.data.message}
            </Banner>
          </Layout.Section>
        )}
        {fetcher.data?.error && (
          <Layout.Section>
            <Banner tone="critical" onDismiss={() => {}}>
              {fetcher.data.error}
            </Banner>
          </Layout.Section>
        )}

        {/* Search Bar */}
        <Layout.Section>
          <Card padding="400">
            <TextField
              label=""
              labelHidden
              value={searchQuery}
              onChange={setSearchQuery}
              placeholder="Filter by pixel title, pixel ID"
              autoComplete="off"
              clearButton
              onClearButtonClick={() => setSearchQuery("")}
            />
          </Card>
        </Layout.Section>

        {/* Pixels Table */}
        <Layout.Section>
          {isLoadingData ? (
            <Card>
              <Box padding="600">
                <InlineStack align="center" gap="200">
                  <Text as="p" tone="subdued">Loading pixels...</Text>
                </InlineStack>
              </Box>
            </Card>
          ) : (
            <Card padding="0">
              <IndexTable
                itemCount={filteredPixels.length}
                headings={[
                  { title: "Status" },
                  { title: "Pixel ID" },
                  { title: "Title" },
                  { title: "Pages" },
                  { title: "Server-Side API ⓘ" },
                  { title: "Test Server Events" },
                  { title: "Action" },
                ]}
                selectable={false}
              >
              {filteredPixels.map((pixel, index) => (
                <IndexTable.Row id={pixel.id} key={pixel.id} position={index}>
                  {/* Status */}
                  <IndexTable.Cell>
                    <Badge tone={pixel.enabled ? "success" : "critical"}>
                      {pixel.enabled ? "Active" : "Inactive"}
                    </Badge>
                  </IndexTable.Cell>

                  {/* Pixel ID */}
                  <IndexTable.Cell>
                    <Text as="span" variant="bodyMd" fontWeight="medium">
                      {pixel.metaPixelId || pixel.appId}
                    </Text>
                  </IndexTable.Cell>

                  {/* Title */}
                  <IndexTable.Cell>
                    <Text as="span" variant="bodyMd">
                      {pixel.name}
                    </Text>
                  </IndexTable.Cell>

                  {/* Pages */}
                  <IndexTable.Cell>
                    <Badge tone="success">
                      {getTrackingPagesLabel(pixel.trackingPages)}
                    </Badge>
                  </IndexTable.Cell>

                  {/* Server-Side API Toggle */}
                  <IndexTable.Cell>
                    <div 
                      onClick={() => handleToggleServerSide(pixel.id, pixel.serverSideEnabled)}
                      style={{ 
                        width: "44px", 
                        height: "24px", 
                        borderRadius: "12px", 
                        backgroundColor: pixel.serverSideEnabled ? "#000" : "#ccc", 
                        position: "relative", 
                        cursor: "pointer",
                        display: "inline-block"
                      }}
                    >
                      <div style={{ 
                        width: "18px", 
                        height: "18px", 
                        borderRadius: "50%", 
                        backgroundColor: "#fff", 
                        position: "absolute", 
                        top: "3px", 
                        right: pixel.serverSideEnabled ? "3px" : "23px", 
                        transition: "right 0.2s" 
                      }} />
                    </div>
                  </IndexTable.Cell>

                  {/* Test Server Events */}
                  <IndexTable.Cell>
                    {pixel.serverSideEnabled && pixel.testEventCode ? (
                      <Button 
                        size="slim" 
                        onClick={() => openTestModal(pixel)}
                      >
                        Set up
                      </Button>
                    ) : (
                      <Text as="span" tone="subdued">-</Text>
                    )}
                  </IndexTable.Cell>

                  {/* Action */}
                  <IndexTable.Cell>
                    <Button 
                      icon={EditIcon} 
                      variant="plain" 
                      url={`/app/dashboard`}
                      accessibilityLabel="Edit pixel"
                    />
                  </IndexTable.Cell>
                </IndexTable.Row>
              ))}
            </IndexTable>

            {filteredPixels.length === 0 && !isLoadingData && (
              <Box padding="600">
                <Text as="p" tone="subdued" alignment="center">
                  No pixels found. Add a pixel to get started.
                </Text>
              </Box>
            )}

            {/* Pagination */}
            {filteredPixels.length > 0 && (
              <Box padding="400">
                <InlineStack align="center" gap="200">
                  <Text as="span" variant="bodySm" tone="subdued">
                    Rows per page:
                  </Text>
                  <Select
                    label=""
                    labelHidden
                    options={[
                      { label: "5", value: "5" },
                      { label: "10", value: "10" },
                      { label: "20", value: "20" },
                    ]}
                    value="5"
                    onChange={() => {}}
                  />
                  <Text as="span" variant="bodySm" tone="subdued">
                    1/1
                  </Text>
                </InlineStack>
              </Box>
            )}
          </Card>
          )}
        </Layout.Section>

        {/* Footer */}
        <Layout.Section>
          <Box padding="400">
            <InlineStack align="center" gap="200">
              <Text as="p" tone="subdued">ⓘ For more guidance, visit our</Text>
              <a href="https://pixelify-red.vercel.app/docs" target="_blank" rel="noopener noreferrer" style={{ color: "#2563eb" }}>
                knowledge base
              </a>
              <Text as="p" tone="subdued">or</Text>
              <a href="mailto:support@warewe.online" style={{ color: "#2563eb" }}>
                request support
              </a>
            </InlineStack>
          </Box>
        </Layout.Section>
      </Layout>

      {/* Test Event Modal */}
      <Modal
        open={showTestModal}
        onClose={() => {
          setShowTestModal(false);
          setTestResult(null);
        }}
        title="Test Server Event"
        primaryAction={{
          content: isSendingTest ? "Sending..." : "Send Test Event",
          onAction: handleSendTestEvent,
          loading: isSendingTest,
          disabled: !testEventName || isSendingTest,
        }}
        secondaryActions={[
          {
            content: "Cancel",
            onAction: () => {
              setShowTestModal(false);
              setTestResult(null);
            },
          },
        ]}
      >
        <Modal.Section>
          <BlockStack gap="400">
            {selectedPixel && (
              <Banner tone="info">
                <p>
                  Testing pixel: <strong>{selectedPixel.name}</strong> ({selectedPixel.metaPixelId})
                </p>
                <p style={{ marginTop: "8px" }}>
                  Test Event Code: <strong>{selectedPixel.testEventCode}</strong>
                </p>
              </Banner>
            )}

            <TextField
              label="Event Name"
              value={testEventName}
              onChange={setTestEventName}
              placeholder="TestEvent"
              autoComplete="off"
              helpText="Name of the test event to send (e.g., TestEvent, PageView, Purchase)"
            />

            {testResult && (
              <Banner tone={testResult.success ? "success" : "critical"}>
                <p>{testResult.message}</p>
              </Banner>
            )}

            <Banner tone="info">
              <BlockStack gap="100">
                <Text as="p" variant="bodyMd" fontWeight="medium">How to verify:</Text>
                <Text as="p" variant="bodySm">
                  1. Send the test event using this form
                </Text>
                <Text as="p" variant="bodySm">
                  2. Go to Meta Events Manager → Test Events tab
                </Text>
                <Text as="p" variant="bodySm">
                  3. Enter your test event code: <strong>{selectedPixel?.testEventCode}</strong>
                </Text>
                <Text as="p" variant="bodySm">
                  4. You should see the test event appear within a few seconds
                </Text>
              </BlockStack>
            </Banner>
          </BlockStack>
        </Modal.Section>
      </Modal>
    </Page>
  );
}