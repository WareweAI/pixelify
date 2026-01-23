import { 
  Card, 
  Text, 
  BlockStack, 
  InlineStack, 
  Button, 
  Banner, 
  RadioButton, 
  TextField,
  Select,
  Divider,
  Icon
} from "@shopify/polaris";
import { CheckIcon, ConnectIcon } from "@shopify/polaris-icons";
import { ClientOnly } from "~/components/ClientOnly";

interface OnboardingFlowProps {
  currentStep: number;
  inputMethod: string;
  pixelForm: {
    pixelName: string;
    pixelId: string;
    trackingPages: string;
    selectedCollections: string[];
    selectedProductTypes: string[];
    selectedProductTags: string[];
    selectedProducts: string[];
  };
  facebookError: string;
  isConnectedToFacebook: boolean;
  facebookPixels: Array<{ id: string; name: string; accountName: string }>;
  selectedFacebookPixel: string;
  facebookAccessToken: string;
  selectedTimezone: string;
  timezoneOptions: Array<{ label: string; value: string }>;
  apps: Array<any>;
  isLoading: boolean;
  mounted: boolean;
  onCurrentStepChange: (step: number) => void;
  onInputMethodChange: (method: string) => void;
  onPixelFormChange: (form: any) => void;
  onFacebookErrorChange: (error: string) => void;
  onSelectedFacebookPixelChange: (value: string) => void;
  onFacebookAccessTokenChange: (value: string) => void;
  onSelectedTimezoneChange: (value: string) => void;
  onConnectToFacebook: () => void;
  onCreatePixel: () => void;
  onShowFacebookModal: () => void;
  onValidatePixel: () => void;
}

export function OnboardingFlow({
  currentStep,
  inputMethod,
  pixelForm,
  facebookError,
  isConnectedToFacebook,
  facebookPixels,
  selectedFacebookPixel,
  facebookAccessToken,
  selectedTimezone,
  timezoneOptions,
  apps,
  isLoading,
  mounted,
  onCurrentStepChange,
  onInputMethodChange,
  onPixelFormChange,
  onFacebookErrorChange,
  onSelectedFacebookPixelChange,
  onFacebookAccessTokenChange,
  onSelectedTimezoneChange,
  onConnectToFacebook,
  onCreatePixel,
  onShowFacebookModal,
  onValidatePixel,
}: OnboardingFlowProps) {
  return (
    <div style={{ 
      backgroundColor: "#f6f6f7", 
      minHeight: "100vh", 
      padding: "40px 20px" 
    }}>
      <div style={{ 
        maxWidth: "1200px", 
        margin: "0 auto" 
      }}>
        {/* Header */}
        <div style={{ textAlign: "center", marginBottom: "40px" }}>
          <Text variant="heading2xl" as="h1" alignment="center">
            Get your Pixels ready
          </Text>
          <Text as="p" tone="subdued" alignment="center" variant="bodyLg">
            Install the right pixels, and install the pixels right
          </Text>
        </div>

        <div style={{ 
          display: "grid", 
          gridTemplateColumns: "300px 1fr", 
          gap: "40px",
          alignItems: "start"
        }}>
          {/* Left Sidebar - Steps */}
          <Card>
            <BlockStack gap="400">
              {/* Step 1 */}
              <div style={{ 
                display: "flex", 
                alignItems: "flex-start", 
                gap: "12px",
                padding: "16px",
                backgroundColor: currentStep === 1 ? "#f0f8ff" : "transparent",
                borderRadius: "8px"
              }}>
                <div style={{
                  width: "24px",
                  height: "24px",
                  borderRadius: "50%",
                  backgroundColor: currentStep >= 1 ? "#2563eb" : "#e5e7eb",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  flexShrink: 0,
                  marginTop: "2px"
                }}>
                  {currentStep > 1 ? (
                    <Icon source={CheckIcon} tone="base" />
                  ) : (
                    <Text as="span" variant="bodySm" tone={currentStep === 1 ? "base" : "subdued"}>
                      1
                    </Text>
                  )}
                </div>
                <BlockStack gap="100">
                  <Text variant="headingSm" as="h3">
                    Add Facebook Pixel
                  </Text>
                  <Text variant="bodySm" as="p" tone="subdued">
                    Install the right pixels, and install the pixels right
                  </Text>
                </BlockStack>
              </div>

              {/* Step 2 */}
              <div style={{ 
                display: "flex", 
                alignItems: "flex-start", 
                gap: "12px",
                padding: "16px",
                backgroundColor: currentStep === 2 ? "#f0f8ff" : "transparent",
                borderRadius: "8px"
              }}>
                <div style={{
                  width: "24px",
                  height: "24px",
                  borderRadius: "50%",
                  backgroundColor: currentStep >= 2 ? "#2563eb" : "#e5e7eb",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  flexShrink: 0,
                  marginTop: "2px"
                }}>
                  <Text as="span" variant="bodySm" tone={currentStep >= 2 ? "base" : "subdued"}>
                    2
                  </Text>
                </div>
                <BlockStack gap="100">
                  <Text variant="headingSm" as="h3">
                    Conversion API
                  </Text>
                  <Text variant="bodySm" as="p" tone="subdued">
                    Track all customer behavior events bypassing the browser's limitation
                  </Text>
                </BlockStack>
              </div>

              {/* Step 3 */}
              <div style={{ 
                display: "flex", 
                alignItems: "flex-start", 
                gap: "12px",
                padding: "16px",
                backgroundColor: currentStep === 3 ? "#f0f8ff" : "transparent",
                borderRadius: "8px"
              }}>
                <div style={{
                  width: "24px",
                  height: "24px",
                  borderRadius: "50%",
                  backgroundColor: currentStep >= 3 ? "#2563eb" : "#e5e7eb",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  flexShrink: 0,
                  marginTop: "2px"
                }}>
                  <Text as="span" variant="bodySm" tone={currentStep >= 3 ? "base" : "subdued"}>
                    3
                  </Text>
                </div>
                <BlockStack gap="100">
                  <Text variant="headingSm" as="h3">
                    Timezone
                  </Text>
                  <Text variant="bodySm" as="p" tone="subdued">
                    Set the timezone for sending tracking events
                  </Text>
                </BlockStack>
              </div>

              {/* Step 4 */}
              <div style={{ 
                display: "flex", 
                alignItems: "flex-start", 
                gap: "12px",
                padding: "16px",
                backgroundColor: currentStep === 4 ? "#f0f8ff" : "transparent",
                borderRadius: "8px"
              }}>
                <div style={{
                  width: "24px",
                  height: "24px",
                  borderRadius: "50%",
                  backgroundColor: currentStep >= 4 ? "#2563eb" : "#e5e7eb",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  flexShrink: 0,
                  marginTop: "2px"
                }}>
                  <Text as="span" variant="bodySm" tone={currentStep >= 4 ? "base" : "subdued"}>
                    4
                  </Text>
                </div>
                <BlockStack gap="100">
                  <Text variant="headingSm" as="h3">
                    Activate app
                  </Text>
                  <Text variant="bodySm" as="p" tone="subdued">
                    Make sure the app work
                  </Text>
                </BlockStack>
              </div>
            </BlockStack>
          </Card>

          {/* Right Content Area */}
          <Card>
            <BlockStack gap="400">
              {/* Success/Error Banner */}
              {facebookError && (
                <Banner tone="critical" onDismiss={() => onFacebookErrorChange("")}>
                  <p>{facebookError}</p>
                </Banner>
              )}

              {/* Step 1: Create Pixel */}
              {currentStep === 1 && (
                <>
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
                        onInputMethodChange("auto");
                        onPixelFormChange({ 
                          pixelName: "", 
                          pixelId: "", 
                          trackingPages: "all",
                          selectedCollections: [],
                          selectedProductTypes: [],
                          selectedProductTags: [],
                          selectedProducts: [],
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
                        onInputMethodChange("manual");
                        onPixelFormChange({ 
                          pixelName: "", 
                          pixelId: "", 
                          trackingPages: "all",
                          selectedCollections: [],
                          selectedProductTypes: [],
                          selectedProductTags: [],
                          selectedProducts: [],
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
                </>
              )}

              {/* Step 2: Choose Timezone */}
              {currentStep === 2 && (
                <>
                  <Text variant="headingLg" as="h2">
                    Choose GMT Timezone
                  </Text>

                  <Banner tone="success">
                    <p>✅ Pixel created successfully! Now choose your GMT timezone for tracking events.</p>
                  </Banner>

                  <div>
                    <Text as="p" variant="bodyMd" fontWeight="medium">
                      Select GMT Timezone <Text as="span" tone="critical">*</Text>
                    </Text>
                    <div style={{ marginTop: "8px", marginBottom: "4px" }}>
                      <Select
                        label=""
                        options={timezoneOptions}
                        value={selectedTimezone}
                        onChange={onSelectedTimezoneChange}
                      />
                    </div>
                    <Text as="p" variant="bodySm" tone="subdued">
                      This timezone will be used for sending tracking events to Facebook.
                    </Text>
                  </div>

                  {/* Current Selection Display */}
                  <Card>
                    <BlockStack gap="200">
                      <Text variant="headingSm" as="h3">Selected Timezone</Text>
                      <InlineStack gap="200" blockAlign="center">
                        <div style={{
                          width: "12px",
                          height: "12px",
                          borderRadius: "50%",
                          backgroundColor: "#10b981"
                        }}></div>
                        <Text as="p" variant="bodyMd" fontWeight="medium">
                          {timezoneOptions.find(tz => tz.value === selectedTimezone)?.label || selectedTimezone}
                        </Text>
                      </InlineStack>
                    </BlockStack>
                  </Card>

                  <Banner tone="info">
                    <BlockStack gap="100">
                      <Text as="p" variant="bodyMd" fontWeight="medium">Why timezone matters:</Text>
                      <Text as="p" variant="bodySm">
                        • Facebook uses timezone to properly attribute conversions
                      </Text>
                      <Text as="p" variant="bodySm">
                        • Events are timestamped based on your selected timezone
                      </Text>
                      <Text as="p" variant="bodySm">
                        • Helps with accurate reporting and audience insights
                      </Text>
                    </BlockStack>
                  </Banner>
                </>
              )}

              {/* Form Fields */}
              <BlockStack gap="400">
                {inputMethod === "auto" ? (
                  // Auto Input - Facebook Integration
                  <BlockStack gap="400">
                    <ClientOnly>
                      {!mounted || !isConnectedToFacebook ? (
                        <Card background="bg-surface-secondary">
                          <BlockStack gap="300">
                            <InlineStack gap="200" blockAlign="center">
                              <Icon source={ConnectIcon} tone="base" />
                              <Text variant="headingSm" as="h3">
                                Connect to Facebook
                              </Text>
                            </InlineStack>
                            <Text as="p" tone="subdued">
                              Connect your Facebook account to automatically fetch your available pixels.
                            </Text>
                            <InlineStack gap="200">
                              <Button 
                                variant="primary" 
                                onClick={onConnectToFacebook}
                              >
                                Connect to Facebook
                              </Button>
                              <Button 
                                variant="secondary" 
                                onClick={onShowFacebookModal}
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
                                      return !apps.some((app) => app.settings?.metaPixelId === pixel.id);
                                    })
                                    .map(pixel => ({
                                      label: `${pixel.name} (${pixel.accountName})`,
                                      value: pixel.id
                                    }))
                                ]}
                                value={selectedFacebookPixel}
                                onChange={onSelectedFacebookPixelChange}
                              />
                              
                              {/* Show message if some pixels are already added */}
                              {facebookPixels.some(pixel => apps.some((app) => app.settings?.metaPixelId === pixel.id)) && (
                                <Banner tone="info">
                                  <p>
                                    Some pixels are hidden because they're already added to your app. 
                                    Each pixel can only be added once.
                                  </p>
                                </Banner>
                              )}
                              
                              {/* Show message if all pixels are already added */}
                              {facebookPixels.every(pixel => apps.some((app) => app.settings?.metaPixelId === pixel.id)) && (
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
                      onChange={(value) => onPixelFormChange({...pixelForm, pixelName: value})}
                      placeholder="Any name will do. This is just so you can manage different pixels easily."
                      helpText="Name is required"
                      error={!pixelForm.pixelName && facebookError ? "Name is required" : undefined}
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
                          onChange={(value) => onPixelFormChange({...pixelForm, pixelId: value})}
                          placeholder="Enter your Facebook Pixel ID / Dataset ID"
                          error={
                            (!pixelForm.pixelId && facebookError) 
                              ? "Facebook Pixel ID is required" 
                              : (pixelForm.pixelId && apps.some((app) => app.settings?.metaPixelId === pixelForm.pixelId))
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
                       apps.some((app) => app.settings?.metaPixelId === pixelForm.pixelId) && (
                        <div style={{ marginTop: "8px" }}>
                          <Banner tone="critical">
                            <p>
                              This pixel ID is already added to your app as "{apps.find((app) => app.settings?.metaPixelId === pixelForm.pixelId)?.name}". 
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
                          onChange={onFacebookAccessTokenChange}
                          type="password"
                          placeholder="Enter your Facebook access token"
                          error={!facebookAccessToken && facebookError ? "Access token is required" : undefined}
                          autoComplete="off"
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
                        onClick={onValidatePixel}
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
                          onChange={() => onPixelFormChange({...pixelForm, trackingPages: "all" })}
                        />
                        <RadioButton
                          label="Selected pages"
                          checked={pixelForm.trackingPages === "selected"}
                          id="selected-pages"
                          name="tracking-pages"
                          onChange={() => onPixelFormChange({...pixelForm, trackingPages: "selected" })}
                        />
                        <RadioButton
                          label="Excluded pages"
                          checked={pixelForm.trackingPages === "excluded"}
                          id="excluded-pages"
                          name="tracking-pages"
                          onChange={() => onPixelFormChange({...pixelForm, trackingPages: "excluded" })}
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
                          </BlockStack>
                        </div>
                      )}
                    </div>
                  </div>
                )}
              </BlockStack>

              {/* Footer */}
              <div style={{ 
                display: "flex", 
                justifyContent: "space-between", 
                alignItems: "center",
                paddingTop: "24px",
                borderTop: "1px solid #e5e7eb"
              }}>
                <Text as="p" variant="bodySm" tone="subdued">
                  Step {currentStep} of 4
                </Text>
                
                {currentStep === 1 && (
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
                          apps.some((app) => app.settings?.metaPixelId === pixelForm.pixelId)
                    }
                  >
                    {inputMethod === "manual" ? "Validate & Create Pixel" : "Next"}
                  </Button>
                )}
                
                {currentStep === 2 && (
                  <InlineStack gap="200">
                    <Button 
                      onClick={() => onCurrentStepChange(1)}
                    >
                      Back
                    </Button>
                    <Button 
                      variant="primary" 
                      loading={isLoading}
                      onClick={() => onCurrentStepChange(3)}
                    >
                      Continue
                    </Button>
                  </InlineStack>
                )}
              </div>
            </BlockStack>
          </Card>
        </div>
      </div>
    </div>
  );
}
