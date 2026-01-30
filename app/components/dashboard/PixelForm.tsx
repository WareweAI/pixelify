import { useState, useCallback, useEffect } from "react";
import { useFetcher } from "react-router";
import {
  Card,
  TextField,
  Text,
  BlockStack,
  InlineStack,
  Banner,
  RadioButton,
  Button,
  Select,
  Divider,
} from "@shopify/polaris";
import { ClientOnly } from "../ClientOnly";

interface Pixel {
  id: string;
  name: string;
  accountName: string;
}

interface PageType {
  label: string;
  value: string;
  type: string;
}

interface PixelFormProps {
  apps: any[];
  inputMethod: "auto" | "manual";
  isConnectedToFacebook: boolean;
  facebookPixels: Pixel[];
  facebookAccessToken: string;
  pageTypeOptions: PageType[];
  onMethodChange: (method: "auto" | "manual") => void;
  onCreatePixel: () => void;
  onFacebookConnect: () => void;
  onFacebookModalOpen: () => void;
  fetcher: any;
  shopifyPages?: any[];
  onLoadShopifyPages?: () => void;
}

export function PixelForm({
  apps,
  inputMethod,
  isConnectedToFacebook,
  facebookPixels,
  facebookAccessToken,
  pageTypeOptions,
  onMethodChange,
  onCreatePixel,
  onFacebookConnect,
  onFacebookModalOpen,
  fetcher,
  shopifyPages = [],
  onLoadShopifyPages,
}: PixelFormProps) {
  const [pixelForm, setPixelForm] = useState({
    pixelName: "",
    pixelId: "",
    trackingPages: "all",
    selectedCollections: [] as string[],
    selectedProductTypes: [] as string[],
    selectedProductTags: [] as string[],
    selectedProducts: [] as string[],
    selectedPages: [] as string[],
  });

  const [showPageSelector, setShowPageSelector] = useState(false);

  const [selectedFacebookPixel, setSelectedFacebookPixel] = useState("");
  const [facebookError, setFacebookError] = useState("");
  const [isValidatingPixel, setIsValidatingPixel] = useState(false);
  const [pixelValidationResult, setPixelValidationResult] = useState<{
    valid: boolean;
    pixelName?: string;
    error?: string;
  } | null>(null);

  const isLoading = fetcher.state !== "idle";

  // Load Shopify pages when component mounts
  useEffect(() => {
    if (onLoadShopifyPages && shopifyPages.length === 0) {
      onLoadShopifyPages();
    }
  }, [onLoadShopifyPages, shopifyPages.length]);

  // Validate pixel using Facebook SDK
  const validatePixelWithSDK = useCallback((pixelId: string, accessToken: string) => {
    const FB = (window as any).FB;
    
    setIsValidatingPixel(true);
    setPixelValidationResult(null);
    
    console.log(`[PixelForm] Validating pixel: ${pixelId}`);
    
    if (FB) {
      // Use Facebook SDK to validate
      FB.api(`/${pixelId}`, 'GET', { fields: 'id,name,creation_time,last_fired_time' }, function(response: any) {
        setIsValidatingPixel(false);
        
        if (response.error) {
          console.log(`[PixelForm] Pixel validation FAILED:`, response.error.message);
          setPixelValidationResult({
            valid: false,
            error: response.error.message
          });
        } else {
          console.log(`[PixelForm] Pixel validation SUCCESS!`);
          console.log(`[PixelForm] Pixel Name: ${response.name}`);
          console.log(`[PixelForm] Pixel ID: ${response.id}`);
          console.log(`[PixelForm] Last Fired: ${response.last_fired_time || 'Never'}`);
          
          setPixelValidationResult({
            valid: true,
            pixelName: response.name
          });
        }
      });
    } else {
      // Fallback to server-side validation
      console.log(`[PixelForm] Facebook SDK not available, using server validation...`);
      
      fetch(`https://graph.facebook.com/v24.0/${pixelId}?fields=id,name&access_token=${accessToken}`)
        .then(res => res.json())
        .then(data => {
          setIsValidatingPixel(false);
          
          if (data.error) {
            console.log(`[PixelForm] Pixel validation FAILED:`, data.error.message);
            setPixelValidationResult({
              valid: false,
              error: data.error.message
            });
          } else {
            console.log(`[PixelForm] Pixel validation SUCCESS!`);
            console.log(`[PixelForm] Pixel Name: ${data.name}`);
            
            setPixelValidationResult({
              valid: true,
              pixelName: data.name
            });
          }
        })
        .catch(err => {
          setIsValidatingPixel(false);
          console.log(`[PixelForm] Pixel validation error:`, err);
          setPixelValidationResult({
            valid: false,
            error: 'Failed to validate pixel'
          });
        });
    }
  }, []);

  // Auto-validate when pixel is selected
  useEffect(() => {
    if (selectedFacebookPixel && selectedFacebookPixel !== "manual" && facebookAccessToken) {
      validatePixelWithSDK(selectedFacebookPixel, facebookAccessToken);
    } else {
      setPixelValidationResult(null);
    }
  }, [selectedFacebookPixel, facebookAccessToken, validatePixelWithSDK]);

  const handleSelectFacebookPixel = useCallback(() => {
    const selectedPixel = facebookPixels.find(p => p.id === selectedFacebookPixel);
    if (!selectedPixel) return;

    setPixelForm(prev => ({
      ...prev,
      pixelName: selectedPixel.name,
      pixelId: selectedPixel.id,
      trackingPages: "all",
    }));
  }, [facebookPixels, selectedFacebookPixel]);

  // Handle fetcher response for validation
  useEffect(() => {
    if (fetcher.data?.success && fetcher.data?.message?.includes("validated successfully")) {
      setPixelValidationResult({
        valid: true,
        pixelName: fetcher.data.message.match(/Name: (\w+)/)?.[1]
      });
    } else if (fetcher.data?.error) {
      setPixelValidationResult({
        valid: false,
        error: fetcher.data.error
      });
    }
  }, [fetcher.data]);

  return (
    <BlockStack gap="400">
      <Text variant="headingLg" as="h2">
        Create New Pixel
      </Text>

      <Banner tone="info">
        <p>
          <strong>Two ways to add pixels:</strong> Connect your Facebook account to auto-fetch existing pixels, or manually enter your Pixel ID and Access Token.
        </p>
      </Banner>

      {/* Input Method Tabs */}
      <div style={{ 
        display: "flex", 
        gap: "1px", 
        backgroundColor: "#e5e7eb", 
        borderRadius: "8px", 
        padding: "4px" 
      }}>
        <button
          onClick={() => {
            onMethodChange("auto");
            setPixelForm({ 
              pixelName: "", 
              pixelId: "", 
              trackingPages: "all",
              selectedCollections: [],
              selectedProductTypes: [],
              selectedProductTags: [],
              selectedProducts: [],
              selectedPages: [],
            });
          }}
          style={{
            flex: 1,
            padding: "12px 24px",
            backgroundColor: inputMethod === "auto" ? "white" : "transparent",
            border: "none",
            borderRadius: "6px",
            cursor: "pointer",
            fontWeight: inputMethod === "auto" ? "600" : "400",
            color: inputMethod === "auto" ? "#1f2937" : "#6b7280"
          }}
          suppressHydrationWarning={true}
        >
          Auto Input Pixel
        </button>
        <button
          onClick={() => {
            onMethodChange("manual");
            setPixelForm({ 
              pixelName: "", 
              pixelId: "", 
              trackingPages: "all",
              selectedCollections: [],
              selectedProductTypes: [],
              selectedProductTags: [],
              selectedProducts: [],
              selectedPages: [],
            });
          }}
          style={{
            flex: 1,
            padding: "12px 24px",
            backgroundColor: inputMethod === "manual" ? "white" : "transparent",
            border: "none",
            borderRadius: "6px",
            cursor: "pointer",
            fontWeight: inputMethod === "manual" ? "600" : "400",
            color: inputMethod === "manual" ? "#1f2937" : "#6b7280"
          }}
          suppressHydrationWarning={true}
        >
          Manual Input
        </button>
      </div>

      {/* Form Fields */}
      <BlockStack gap="400">
        {inputMethod === "auto" ? (
          // Auto Input - Facebook Integration
          <BlockStack gap="400">
            {facebookError && (
              <Banner tone="critical" onDismiss={() => setFacebookError("")}>
                <p>{facebookError}</p>
              </Banner>
            )}
            
            <ClientOnly>
              {!isConnectedToFacebook ? (
                <Card background="bg-surface-secondary">
                  <BlockStack gap="300">
                    <Text variant="headingSm" as="h3">
                      Connect to Facebook
                    </Text>
                    <Text as="p" tone="subdued">
                      Connect your Facebook account to automatically fetch your available pixels.
                    </Text>
                    <InlineStack gap="200">
                      <Button 
                        variant="primary" 
                        onClick={onFacebookConnect}
                      >
                        Connect to Facebook
                      </Button>
                      <Button 
                        variant="secondary" 
                        onClick={onFacebookModalOpen}
                      >
                        Manual Token
                      </Button>
                    </InlineStack>
                  </BlockStack>
                </Card>
              ) : (
                <BlockStack gap="300">
                  <Banner tone="success">
                    <p>✅ Connected to Facebook! Found {facebookPixels.length} pixel(s).</p>
                  </Banner>
                  
                  {facebookPixels.length > 0 && (
                    <>
                      <Select
                        label="Select a Facebook Pixel"
                        options={[
                          { label: "Choose a pixel...", value: "" },
                          ...facebookPixels
                            .filter(pixel => {
                              // Filter out pixels that are already added
                              return !apps.some((app: any) => app.settings?.metaPixelId === pixel.id);
                            })
                            .map(pixel => ({
                              label: `${pixel.name} (${pixel.accountName})`,
                              value: pixel.id
                            }))
                        ]}
                        value={selectedFacebookPixel}
                        onChange={(value) => {
                          setSelectedFacebookPixel(value);
                          const selectedPixel = facebookPixels.find(p => p.id === value);
                          if (selectedPixel) {
                            setPixelForm(prev => ({
                              ...prev,
                              pixelName: selectedPixel.name,
                              pixelId: selectedPixel.id,
                            }));
                          }
                        }}
                      />
                      
                      {/* Show message if some pixels are already added */}
                      {facebookPixels.some(pixel => apps.some((app: any) => app.settings?.metaPixelId === pixel.id)) && (
                        <Banner tone="info">
                          <p>
                            Some pixels are hidden because they're already added to your app. 
                            Each pixel can only be added once.
                          </p>
                        </Banner>
                      )}
                      
                      {/* Show message if all pixels are already added */}
                      {facebookPixels.every(pixel => apps.some((app: any) => app.settings?.metaPixelId === pixel.id)) && (
                        <Banner tone="warning">
                          <p>
                            All your Facebook pixels are already added to this app. 
                            You can manage them from the main dashboard.
                          </p>
                        </Banner>
                      )}
                    </>
                  )}
                </BlockStack>
              )}
            </ClientOnly>
          </BlockStack>
        ) : (
          // Manual Input
          <BlockStack gap="400">
            <TextField
              label="Name your pixel"
              value={pixelForm.pixelName}
              onChange={(value) => setPixelForm(prev => ({ ...prev, pixelName: value }))}
              placeholder="Any name will do. This is just so you can manage different pixels easily."
              helpText="Name is required"
              error={!pixelForm.pixelName && fetcher.data?.error ? "Name is required" : undefined}
              autoComplete="off"
              requiredIndicator
            />

            <div>
              <Text as="p" variant="bodyMd" fontWeight="medium">
                Pixel ID (Dataset ID) <Text as="span" tone="critical">*</Text>
              </Text>
              <div style={{ marginTop: "8px", marginBottom: "4px" }}>
                <TextField
                  label=""
                  value={pixelForm.pixelId}
                  onChange={(value) => setPixelForm(prev => ({ ...prev, pixelId: value }))}
                  placeholder="Enter your Facebook Pixel ID / Dataset ID"
                  error={
                    (!pixelForm.pixelId && fetcher.data?.error) 
                      ? "Facebook Pixel ID is required" 
                      : (pixelForm.pixelId && apps.some((app: any) => app.settings?.metaPixelId === pixelForm.pixelId))
                        ? "This pixel is already added to your app"
                        : undefined
                  }
                  autoComplete="off"
                />
              </div>
              <Text as="p" variant="bodySm" tone="subdued">
                This is your Facebook Pixel ID (also called Dataset ID)
              </Text>
              
              {/* Show warning if pixel already exists */}
              {pixelForm.pixelId && 
               apps.some((app: any) => app.settings?.metaPixelId === pixelForm.pixelId) && (
                <div style={{ marginTop: "8px" }}>
                  <Banner tone="critical">
                    <p>
                      This pixel ID is already added to your app as "{apps.find((app: any) => app.settings?.metaPixelId === pixelForm.pixelId)?.name}". 
                      Each pixel can only be added once.
                    </p>
                  </Banner>
                </div>
              )}
            </div>

            <div>
              <Text as="p" variant="bodyMd" fontWeight="medium">
                Access Token <Text as="span" tone="critical">*</Text>
              </Text>
              <div style={{ marginTop: "8px", marginBottom: "4px" }}>
                <TextField
                  label=""
                  value={facebookAccessToken}
                  onChange={(value) => {/* This should be handled by parent */}}
                  type="password"
                  placeholder="Enter your Facebook access token"
                  error={!facebookAccessToken && fetcher.data?.error ? "Access token is required" : undefined}
                  autoComplete="off"
                  disabled={true}
                />
              </div>
              <Text as="p" variant="bodySm" tone="subdued">
                Required to validate the pixel and create connection
              </Text>
            </div>

            <Banner tone="info">
              <p>Both Pixel ID and Access Token are required to validate and create the pixel connection.</p>
            </Banner>

            {pixelForm.pixelId && facebookAccessToken && (
              <Button 
                onClick={() => {
                  fetcher.submit(
                    {
                      intent: "validate-pixel",
                      pixelId: pixelForm.pixelId,
                      accessToken: facebookAccessToken,
                    },
                    { method: "POST" }
                  );
                }}
                loading={isLoading}
                variant="secondary"
              >
                Test Connection
              </Button>
            )}
          </BlockStack>
        )}

        {/* Common fields for both methods */}
        {(inputMethod === "manual" || (inputMethod === "auto" && pixelForm.pixelId)) && (
          <div>
            <Text as="p" variant="bodyMd" fontWeight="medium">
              Tracking on pages
            </Text>
            <div style={{ marginTop: "12px" }}>
              <BlockStack gap="200">
                <RadioButton
                  label="All pages"
                  checked={pixelForm.trackingPages === "all"}
                  id="all-pages"
                  name="tracking-pages"
                  onChange={() => setPixelForm(prev => ({ ...prev, trackingPages: "all" }))}
                />
                <RadioButton
                  label="Selected pages"
                  checked={pixelForm.trackingPages === "selected"}
                  id="selected-pages"
                  name="tracking-pages"
                  onChange={() => setPixelForm(prev => ({ ...prev, trackingPages: "selected" }))}
                />
                <RadioButton
                  label="Excluded pages"
                  checked={pixelForm.trackingPages === "excluded"}
                  id="excluded-pages"
                  name="tracking-pages"
                  onChange={() => setPixelForm(prev => ({ ...prev, trackingPages: "excluded" }))}
                />
              </BlockStack>

              {/* Collection/Product/Tag Selectors */}
              {(pixelForm.trackingPages === "selected" || pixelForm.trackingPages === "excluded") && (
                <div style={{ marginTop: "16px" }}>
                  <BlockStack gap="300">
                    {/* Collection Selector */}
                    <div style={{ 
                      padding: "12px", 
                      backgroundColor: "#f6f6f7", 
                      borderRadius: "8px" 
                    }}>
                      <BlockStack gap="200">
                        <Button 
                          onClick={() => {/* TODO: Open collection selector modal */}}
                          variant="plain"
                          textAlign="left"
                        >
                          + Select collection(s)
                        </Button>
                        {pixelForm.selectedCollections.length > 0 && (
                          <Text as="p" variant="bodySm" tone="subdued">
                            {pixelForm.selectedCollections.length} collection(s) {pixelForm.trackingPages === "selected" ? "selected" : "excluded"}
                          </Text>
                        )}
                      </BlockStack>
                    </div>

                    {/* Product Type Selector */}
                    <div style={{ 
                      padding: "12px", 
                      backgroundColor: "#f6f6f7", 
                      borderRadius: "8px" 
                    }}>
                      <BlockStack gap="200">
                        <Button 
                          onClick={() => {/* TODO: Open product type selector modal */}}
                          variant="plain"
                          textAlign="left"
                        >
                          + Product with Type(s)
                        </Button>
                        {pixelForm.selectedProductTypes.length > 0 && (
                          <Text as="p" variant="bodySm" tone="subdued">
                            {pixelForm.selectedProductTypes.length} type(s) {pixelForm.trackingPages === "selected" ? "selected" : "excluded"}
                          </Text>
                        )}
                      </BlockStack>
                    </div>

                    {/* Product Tag Selector */}
                    <div style={{ 
                      padding: "12px", 
                      backgroundColor: "#f6f6f7", 
                      borderRadius: "8px" 
                    }}>
                      <BlockStack gap="200">
                        <Button 
                          onClick={() => {/* TODO: Open product tag selector modal */}}
                          variant="plain"
                          textAlign="left"
                        >
                          + Product with Tag(s)
                        </Button>
                        {pixelForm.selectedProductTags.length > 0 && (
                          <Text as="p" variant="bodySm" tone="subdued">
                            {pixelForm.selectedProductTags.length} tag(s) {pixelForm.trackingPages === "selected" ? "selected" : "excluded"}
                          </Text>
                        )}
                      </BlockStack>
                    </div>

                    {/* Product Selector */}
                    <div style={{ 
                      padding: "12px", 
                      backgroundColor: "#f6f6f7", 
                      borderRadius: "8px" 
                    }}>
                      <BlockStack gap="200">
                        <Button 
                          onClick={() => {/* TODO: Open product selector modal */}}
                          variant="plain"
                          textAlign="left"
                        >
                          + Select Product(s)
                        </Button>
                        {pixelForm.selectedProducts.length > 0 && (
                          <Text as="p" variant="bodySm" tone="subdued">
                            {pixelForm.selectedProducts.length} product(s) {pixelForm.trackingPages === "selected" ? "selected" : "excluded"}
                          </Text>
                        )}
                      </BlockStack>
                    </div>

                    {/* Shopify Pages Selector */}
                    <div style={{ 
                      padding: "12px", 
                      backgroundColor: "#f6f6f7", 
                      borderRadius: "8px" 
                    }}>
                      <BlockStack gap="200">
                        <Button 
                          onClick={() => setShowPageSelector(true)}
                          variant="plain"
                          textAlign="left"
                        >
                          + Select Shopify Page(s)
                        </Button>
                        {pixelForm.selectedPages.length > 0 && (
                          <Text as="p" variant="bodySm" tone="subdued">
                            {pixelForm.selectedPages.length} page(s) {pixelForm.trackingPages === "selected" ? "selected" : "excluded"}
                          </Text>
                        )}
                      </BlockStack>
                    </div>
                  </BlockStack>
                </div>
              )}
            </div>
          </div>
        )}
      </BlockStack>

      {/* Page Selector Modal */}
      {showPageSelector && (
        <ClientOnly>
          <PageSelector
            open={showPageSelector}
            onClose={() => setShowPageSelector(false)}
            onSelectPages={(pages: any) => {
              setPixelForm(prev => ({ ...prev, selectedPages: pages }));
              setShowPageSelector(false);
            }}
            initialSelectedPages={pixelForm.selectedPages}
            availablePages={shopifyPages.map((page: any) => ({
              label: page.title,
              value: `/pages/${page.handle}`,
              type: "page",
              pageId: page.id,
            }))}
          />
        </ClientOnly>
      )}

      {/* Create Button */}
      <div style={{ 
        display: "flex", 
        justifyContent: "flex-end", 
        alignItems: "center",
        paddingTop: "24px",
        borderTop: "1px solid #e5e7eb"
      }}>
        <Button 
          variant="primary" 
          onClick={onCreatePixel}
          loading={isLoading}
          disabled={
            inputMethod === "auto" 
              ? !pixelForm.pixelId || !selectedFacebookPixel
              : !pixelForm.pixelName || 
                !pixelForm.pixelId || 
                !facebookAccessToken ||
                apps.some((app: any) => app.settings?.metaPixelId === pixelForm.pixelId)
          }
        >
          {inputMethod === "manual" ? "Validate & Create Pixel" : "Next"}
        </Button>
      </div>
    </BlockStack>
  );
}
