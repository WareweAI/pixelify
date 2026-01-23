import { useState, useCallback, useEffect } from "react";
import { useFetcher } from "react-router";
import {
  Modal,
  BlockStack,
  Card,
  Text,
  TextField,
  Select,
  Button,
  Banner,
  Divider,
  InlineStack,
  RadioButton,
} from "@shopify/polaris";
import { ClientOnly } from "../ClientOnly";

interface FacebookPixel {
  id: string;
  name: string;
  accountName: string;
}

interface FacebookUser {
  id: string;
  name: string;
  picture?: string | null;
}

interface PageType {
  label: string;
  value: string;
  type: string;
}

interface CreatePixelModalProps {
  open: boolean;
  onClose: () => void;
  apps: any[];
  isConnectedToFacebook: boolean;
  facebookPixels: FacebookPixel[];
  facebookUser: FacebookUser | null;
  facebookAccessToken: string;
  pageTypeOptions: PageType[];
  timezoneOptions: { label: string; value: string }[];
  onConnectFacebook: () => void;
  onDisconnectFacebook: () => void;
  onRefreshFacebookData: () => void;
  isRefreshingToken: boolean;
  fetcher: any;
}

export function CreatePixelModal({
  open,
  onClose,
  apps,
  isConnectedToFacebook,
  facebookPixels,
  facebookUser,
  facebookAccessToken,
  pageTypeOptions,
  timezoneOptions,
  onConnectFacebook,
  onDisconnectFacebook,
  onRefreshFacebookData,
  isRefreshingToken,
  fetcher,
}: CreatePixelModalProps) {
  const [enhancedCreateStep, setEnhancedCreateStep] = useState(1); // 1: Create, 2: Timezone
  const [enhancedCreateForm, setEnhancedCreateForm] = useState({
    appName: "",
    pixelId: "",
    accessToken: "",
    trackingPages: "all",
    selectedPageTypes: [] as string[],
  });
  const [selectedFacebookPixel, setSelectedFacebookPixel] = useState("");
  const [selectedTimezone, setSelectedTimezone] = useState("GMT+0");
  const [createdAppId, setCreatedAppId] = useState<string | null>(null);
  const [isValidatingPixel, setIsValidatingPixel] = useState(false);
  const [pixelValidationResult, setPixelValidationResult] = useState<{
    valid: boolean;
    pixelName?: string;
    error?: string;
  } | null>(null);

  const isLoading = fetcher.state !== "idle";

  // Validate pixel using Facebook SDK
  const validatePixelWithSDK = useCallback((pixelId: string, accessToken: string) => {
    const FB = (window as any).FB;
    
    setIsValidatingPixel(true);
    setPixelValidationResult(null);
    
    console.log(`[CreatePixelModal] Validating pixel: ${pixelId}`);
    
    if (FB) {
      // Use Facebook SDK to validate
      FB.api(`/${pixelId}`, 'GET', { fields: 'id,name,creation_time,last_fired_time' }, function(response: any) {
        setIsValidatingPixel(false);
        
        if (response.error) {
          console.log(`[CreatePixelModal] Pixel validation FAILED:`, response.error.message);
          setPixelValidationResult({
            valid: false,
            error: response.error.message
          });
        } else {
          console.log(`[CreatePixelModal] Pixel validation SUCCESS!`);
          console.log(`[CreatePixelModal] Pixel Name: ${response.name}`);
          console.log(`[CreatePixelModal] Pixel ID: ${response.id}`);
          console.log(`[CreatePixelModal] Last Fired: ${response.last_fired_time || 'Never'}`);
          
          setPixelValidationResult({
            valid: true,
            pixelName: response.name
          });
        }
      });
    } else {
      // Fallback to server-side validation
      console.log(`[CreatePixelModal] Facebook SDK not available, using server validation...`);
      
      fetch(`https://graph.facebook.com/v24.0/${pixelId}?fields=id,name&access_token=${accessToken}`)
        .then(res => res.json())
        .then(data => {
          setIsValidatingPixel(false);
          
          if (data.error) {
            console.log(`[CreatePixelModal] Pixel validation FAILED:`, data.error.message);
            setPixelValidationResult({
              valid: false,
              error: data.error.message
            });
          } else {
            console.log(`[CreatePixelModal] Pixel validation SUCCESS!`);
            console.log(`[CreatePixelModal] Pixel Name: ${data.name}`);
            
            setPixelValidationResult({
              valid: true,
              pixelName: data.name
            });
          }
        })
        .catch(err => {
          setIsValidatingPixel(false);
          console.log(`[CreatePixelModal] Pixel validation error:`, err);
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

  const handleEnhancedCreate = useCallback(() => {
    const pixelId = selectedFacebookPixel && selectedFacebookPixel !== "manual" 
      ? selectedFacebookPixel 
      : enhancedCreateForm.pixelId;
    
    const accessToken = selectedFacebookPixel && selectedFacebookPixel !== "manual"
      ? facebookAccessToken
      : enhancedCreateForm.accessToken;

    if (!enhancedCreateForm.appName || !pixelId) {
      return;
    }

    // Validate page selection if not in "all" mode
    if (enhancedCreateForm.trackingPages !== "all" && enhancedCreateForm.selectedPageTypes.length === 0) {
      return;
    }

    fetcher.submit(
      {
        intent: "create",
        name: enhancedCreateForm.appName,
        metaAppId: pixelId,
        metaAccessToken: accessToken || "",
        trackingPages: enhancedCreateForm.trackingPages,
        selectedPageTypes: JSON.stringify(enhancedCreateForm.selectedPageTypes),
      },
      { method: "POST" }
    );

    // Don't close modal - wait for step 2 (timezone selection)
    // Modal will move to step 2 when fetcher.data.step === 2
  }, [fetcher, enhancedCreateForm, selectedFacebookPixel, facebookAccessToken]);

  // Handle fetcher response
  useEffect(() => {
    // Handle step progression after pixel creation
    if (fetcher.data?.success && fetcher.data?.step === 2) {
      // Enhanced modal flow - move to timezone step within modal
      setEnhancedCreateStep(2);
      
      // Store the created app ID for timezone saving
      if (fetcher.data?.app?.id) {
        setCreatedAppId(fetcher.data.app.id);
      }
    }
    
    // Handle timezone save completion
    if (fetcher.data?.success && fetcher.data?.step === 3) {
      // Close modal and refresh
      onClose();
      setEnhancedCreateStep(1);
      setEnhancedCreateForm({ 
        appName: "", 
        pixelId: "", 
        accessToken: "",
        trackingPages: "all",
        selectedPageTypes: []
      });
      setSelectedFacebookPixel("");
      setPixelValidationResult(null);
      setCreatedAppId(null);
      setSelectedTimezone("GMT+0");
      // Reload page to show new pixel
      setTimeout(() => window.location.reload(), 500);
    }
  }, [fetcher.data, onClose]);

  const handleClose = () => {
    onClose();
    setEnhancedCreateStep(1);
    setEnhancedCreateForm({ appName: "", pixelId: "", accessToken: "", trackingPages: "all", selectedPageTypes: [] });
    setSelectedFacebookPixel("");
    setPixelValidationResult(null);
    setCreatedAppId(null);
    setSelectedTimezone("GMT+0");
  };

  const handleBack = () => {
    if (enhancedCreateStep === 2) {
      setEnhancedCreateStep(1);
    } else {
      handleClose();
    }
  };

  const handleSaveTimezone = () => {
    if (createdAppId) {
      fetcher.submit(
        {
          intent: "save-timezone",
          appId: createdAppId,
          timezone: selectedTimezone,
        },
        { method: "POST" }
      );
    }
  };

  if (!open) return null;

  return (
    <Modal
      open={open}
      onClose={handleClose}
      title={enhancedCreateStep === 1 ? "Create New Pixel" : "Choose Timezone"}
      primaryAction={{
        content: enhancedCreateStep === 1 
          ? (isValidatingPixel ? "Validating..." : "Continue")
          : (isLoading ? "Saving..." : "Save & Complete"),
        onAction: enhancedCreateStep === 1 ? handleEnhancedCreate : handleSaveTimezone,
        loading: isLoading || isValidatingPixel,
        disabled: enhancedCreateStep === 1 
          ? (!enhancedCreateForm.appName || 
             (!enhancedCreateForm.pixelId && !selectedFacebookPixel) ||
             apps.some((app: any) => app.settings?.metaPixelId === (enhancedCreateForm.pixelId || selectedFacebookPixel)) ||
             (selectedFacebookPixel && selectedFacebookPixel !== "manual" && !pixelValidationResult?.valid) ||
             (enhancedCreateForm.trackingPages !== "all" && enhancedCreateForm.selectedPageTypes.length === 0) ||
             isValidatingPixel)
          : false,
      }}
      secondaryActions={[
        {
          content: enhancedCreateStep === 2 ? "Back" : "Cancel",
          onAction: handleBack,
        },
      ]}
    >
      <Modal.Section>
        <BlockStack gap="400">
          {/* Step 1: Create Pixel */}
          {enhancedCreateStep === 1 && (
            <>
              {/* Facebook Connection Status */}
              <ClientOnly>
                {isConnectedToFacebook ? (
                  <Card background="bg-surface-success">
                    <InlineStack align="space-between" blockAlign="center">
                      <InlineStack gap="200" blockAlign="center">
                        {facebookUser?.picture ? (
                          <img 
                            src={facebookUser.picture} 
                            alt={facebookUser.name}
                            style={{
                              width: "40px",
                              height: "40px",
                              borderRadius: "50%",
                              objectFit: "cover",
                              border: "2px solid #1877f2"
                            }}
                          />
                        ) : (
                          <div style={{
                            width: "40px",
                            height: "40px",
                            borderRadius: "50%",
                            backgroundColor: "#1877f2",
                            display: "flex",
                            alignItems: "center",
                            justifyContent: "center",
                            color: "white",
                            fontWeight: "bold",
                            fontSize: "16px"
                          }}>
                            {facebookUser?.name?.charAt(0)?.toUpperCase() || "F"}
                          </div>
                        )}
                        <BlockStack gap="050">
                          <Text variant="bodyMd" fontWeight="medium" as="span">
                            Connected to Facebook
                          </Text>
                          <Text variant="bodySm" tone="subdued" as="span">
                            {facebookUser?.name || "Facebook User"} • {facebookPixels.length} pixel(s) available
                          </Text>
                        </BlockStack>
                      </InlineStack>
                      <InlineStack gap="200">
                        <Button
                          size="slim"
                          onClick={onRefreshFacebookData}
                          loading={isRefreshingToken}
                        >
                          Refresh
                        </Button>
                        <Button
                          size="slim"
                          variant="plain"
                          tone="critical"
                          onClick={onDisconnectFacebook}
                        >
                          Disconnect
                        </Button>
                      </InlineStack>
                    </InlineStack>
                  </Card>
                ) : (
                  <Card background="bg-surface-secondary">
                    <InlineStack align="space-between" blockAlign="center">
                      <BlockStack gap="100">
                        <Text variant="bodyMd" fontWeight="medium" as="span">
                          Connect Facebook Account
                        </Text>
                        <Text variant="bodySm" tone="subdued" as="span">
                          Auto-fetch your existing pixels
                        </Text>
                      </BlockStack>
                      <Button
                        onClick={onConnectFacebook}
                        variant="primary"
                        size="slim"
                      >
                        Connect to Facebook
                      </Button>
                    </InlineStack>
                  </Card>
                )}
              </ClientOnly>

              <div>
                <Text as="p" variant="bodyMd" fontWeight="medium">
                  App Name <Text as="span" tone="critical">*</Text>
                </Text>
                <div style={{ marginTop: "8px", marginBottom: "4px" }}>
                  <TextField
                    label=""
                    value={enhancedCreateForm.appName}
                    onChange={(value) => setEnhancedCreateForm(prev => ({ ...prev, appName: value }))}
                    placeholder="e.g., My Store Pixel"
                    autoComplete="off"
                  />
                </div>
                <Text as="p" variant="bodySm" tone="subdued">
                  Name for your pixel in this app
                </Text>
              </div>

              {/* Pixel Selection */}
              <ClientOnly>
                {isConnectedToFacebook && facebookPixels.length > 0 ? (
                  <div>
                    <Text as="p" variant="bodyMd" fontWeight="medium">
                      Select Facebook Pixel <Text as="span" tone="critical">*</Text>
                    </Text>
                    <div style={{ marginTop: "8px", marginBottom: "4px" }}>
                      <Select
                        label=""
                        options={[
                          { label: "Choose a pixel...", value: "" },
                          ...facebookPixels
                            .filter(pixel => !apps.some((app: any) => app.settings?.metaPixelId === pixel.id))
                            .map(pixel => ({
                              label: `${pixel.name} (${pixel.id})`,
                              value: pixel.id
                            })),
                          { label: "Enter manually", value: "manual" }
                        ]}
                        value={selectedFacebookPixel}
                        onChange={(value) => {
                          setSelectedFacebookPixel(value);
                          if (value !== "manual" && value !== "") {
                            const selectedPixel = facebookPixels.find(p => p.id === value);
                            if (selectedPixel) {
                              setEnhancedCreateForm(prev => ({
                                ...prev,
                                pixelId: selectedPixel.id,
                                appName: prev.appName || selectedPixel.name,
                                accessToken: facebookAccessToken
                              }));
                            }
                          } else if (value === "manual") {
                            setEnhancedCreateForm(prev => ({
                              ...prev,
                              pixelId: "",
                              accessToken: ""
                            }));
                          }
                        }}
                      />
                    </div>
                    <Text as="p" variant="bodySm" tone="subdued">
                      Select from your Facebook pixels or enter manually
                    </Text>
                    
                    {/* Show filtered pixels info */}
                    {facebookPixels.some(pixel => apps.some((app: any) => app.settings?.metaPixelId === pixel.id)) && (
                      <div style={{ marginTop: "8px" }}>
                        <Banner tone="info">
                          <p>
                            Some pixels are hidden because they're already added to your app.
                          </p>
                        </Banner>
                      </div>
                    )}
                  </div>
                ) : null}
              </ClientOnly>

              {/* Manual Pixel ID Input */}
              <ClientOnly>
                {!isConnectedToFacebook || selectedFacebookPixel === "manual" ? (
                  <div>
                    <Text as="p" variant="bodyMd" fontWeight="medium">
                      Pixel ID (Dataset ID) <Text as="span" tone="critical">*</Text>
                    </Text>
                    <div style={{ marginTop: "8px", marginBottom: "4px" }}>
                      <TextField
                        label=""
                        value={enhancedCreateForm.pixelId}
                        onChange={(value) => setEnhancedCreateForm(prev => ({ ...prev, pixelId: value }))}
                        placeholder="e.g., 1234567890123456"
                        autoComplete="off"
                        error={
                          enhancedCreateForm.pixelId && 
                          apps.some((app: any) => app.settings?.metaPixelId === enhancedCreateForm.pixelId)
                            ? "This pixel is already added to your app"
                            : undefined
                        }
                      />
                    </div>
                    <Text as="p" variant="bodySm" tone="subdued">
                      Find in Meta Events Manager → Data Sources → Select your dataset → Dataset ID
                    </Text>
                    
                    {/* Show warning if pixel already exists */}
                    {enhancedCreateForm.pixelId && 
                     apps.some((app: any) => app.settings?.metaPixelId === enhancedCreateForm.pixelId) && (
                      <div style={{ marginTop: "8px" }}>
                        <Banner tone="critical">
                          <p>
                            This pixel ID is already added to your app as "{apps.find((app: any) => app.settings?.metaPixelId === enhancedCreateForm.pixelId)?.name}". 
                            Each pixel can only be added once.
                          </p>
                        </Banner>
                      </div>
                    )}
                  </div>
                ) : null}
              </ClientOnly>

              {/* Access Token - Only for manual entry */}
              <ClientOnly>
                {!isConnectedToFacebook || selectedFacebookPixel === "manual" ? (
                  <div>
                    <Text as="p" variant="bodyMd" fontWeight="medium">
                      Access Token (Optional)
                    </Text>
                    <div style={{ marginTop: "8px", marginBottom: "4px" }}>
                      <TextField
                        label=""
                        value={enhancedCreateForm.accessToken}
                        onChange={(value) => setEnhancedCreateForm(prev => ({ ...prev, accessToken: value }))}
                        type="password"
                        placeholder="EAAxxxxxxxx..."
                        autoComplete="off"
                      />
                    </div>
                    <Text as="p" variant="bodySm" tone="subdued">
                      Generate in Meta Events Manager → Settings → Conversions API → Generate Access Token
                    </Text>
                    
                    {/* Validate Button for manual entry */}
                    {enhancedCreateForm.pixelId && enhancedCreateForm.accessToken && (
                      <div style={{ marginTop: "12px" }}>
                        <Button
                          onClick={() => validatePixelWithSDK(enhancedCreateForm.pixelId, enhancedCreateForm.accessToken)}
                          loading={isValidatingPixel}
                        >
                          Validate Pixel
                        </Button>
                      </div>
                    )}
                    
                    {/* Manual validation result */}
                    {pixelValidationResult && (
                      <div style={{ marginTop: "12px" }}>
                        {pixelValidationResult.valid ? (
                          <Banner tone="success">
                            <p>✅ Pixel validated! Name: <strong>{pixelValidationResult.pixelName}</strong></p>
                          </Banner>
                        ) : (
                          <Banner tone="critical">
                            <p>❌ Validation failed: {pixelValidationResult.error}</p>
                          </Banner>
                        )}
                      </div>
                    )}
                  </div>
                ) : null}
              </ClientOnly>

              {/* Pixel Validation Status - Auto validation for SDK-selected pixels */}
              <ClientOnly>
                {isConnectedToFacebook && selectedFacebookPixel && selectedFacebookPixel !== "manual" && (
                  <>
                    {isValidatingPixel ? (
                      <Banner tone="info">
                        <p>🔄 Validating pixel with Facebook...</p>
                      </Banner>
                    ) : pixelValidationResult?.valid ? (
                      <Banner tone="success">
                        <p>
                          ✅ Pixel validated successfully! Name: <strong>{pixelValidationResult.pixelName}</strong>
                        </p>
                      </Banner>
                    ) : pixelValidationResult?.error ? (
                      <Banner tone="critical">
                        <p>❌ Pixel validation failed: {pixelValidationResult.error}</p>
                      </Banner>
                    ) : null}
                  </>
                )}
              </ClientOnly>

              {/* Page Tracking Configuration */}
              <Divider />
              
              <div>
                <Text as="p" variant="headingMd" fontWeight="semibold">
                  📄 Page Tracking Configuration
                </Text>
                <Text as="p" variant="bodySm" tone="subdued">
                  Choose which pages this pixel should track events on
                </Text>
              </div>

              {/* Tracking Pages Radio Group */}
              <Card>
                <BlockStack gap="300">
                  <div>
                    <Text as="p" variant="bodyMd" fontWeight="medium">
                      Tracking Mode <Text as="span" tone="critical">*</Text>
                    </Text>
                  </div>

                  <div style={{ paddingLeft: "16px" }}>
                    <BlockStack gap="200">
                      <label style={{ display: "flex", gap: "12px", alignItems: "center", cursor: "pointer" }}>
                        <RadioButton
                          label=""
                          checked={enhancedCreateForm.trackingPages === "all"}
                          onChange={() => setEnhancedCreateForm(prev => ({
                            ...prev,
                            trackingPages: "all",
                            selectedPageTypes: []
                          }))}
                        />
                        <BlockStack gap="100">
                          <Text variant="bodyMd" as="span">All Pages</Text>
                          <Text variant="bodySm" tone="subdued" as="span">
                            Track events on every page of your store
                          </Text>
                        </BlockStack>
                      </label>

                      <label style={{ display: "flex", gap: "12px", alignItems: "center", cursor: "pointer" }}>
                        <RadioButton
                          label=""
                          checked={enhancedCreateForm.trackingPages === "selected"}
                          onChange={() => setEnhancedCreateForm(prev => ({
                            ...prev,
                            trackingPages: "selected"
                          }))}
                        />
                        <BlockStack gap="100">
                          <Text variant="bodyMd" as="span">Selected Pages</Text>
                          <Text variant="bodySm" tone="subdued" as="span">
                            Track events only on specific page types
                          </Text>
                        </BlockStack>
                      </label>

                      <label style={{ display: "flex", gap: "12px", alignItems: "center", cursor: "pointer" }}>
                        <RadioButton
                          label=""
                          checked={enhancedCreateForm.trackingPages === "excluded"}
                          onChange={() => setEnhancedCreateForm(prev => ({
                            ...prev,
                            trackingPages: "excluded"
                          }))}
                        />
                        <BlockStack gap="100">
                          <Text variant="bodyMd" as="span">Excluded Pages</Text>
                          <Text variant="bodySm" tone="subdued" as="span">
                            Track events everywhere except selected pages
                          </Text>
                        </BlockStack>
                      </label>
                    </BlockStack>
                  </div>
                </BlockStack>
              </Card>

              {/* Page Type Selection - Show when selected or excluded mode */}
              {enhancedCreateForm.trackingPages !== "all" && (
                <Card>
                  <BlockStack gap="300">
                    <div>
                      <Text as="p" variant="bodyMd" fontWeight="medium">
                        {enhancedCreateForm.trackingPages === "selected" ? "Select Pages to Track" : "Select Pages to Exclude"} <Text as="span" tone="critical">*</Text>
                      </Text>
                      <Text as="p" variant="bodySm" tone="subdued">
                        {enhancedCreateForm.trackingPages === "selected" 
                          ? "Check the page types where you want to track pixel events"
                          : "Check the page types you want to exclude from tracking"}
                      </Text>
                    </div>

                    <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(250px, 1fr))", gap: "12px" }}>
                      {pageTypeOptions
                        .filter((page: PageType) => page.value !== "all") // Don't show "All Pages" option in checkbox list
                        .map((pageType: PageType) => (
                          <label
                            key={pageType.value}
                            style={{
                              display: "flex",
                              gap: "12px",
                              alignItems: "center",
                              padding: "12px",
                              border: "1px solid #d9d9db",
                              borderRadius: "6px",
                              cursor: "pointer",
                              backgroundColor: enhancedCreateForm.selectedPageTypes.includes(pageType.value)
                                ? "#f0f5ff"
                                : "transparent",
                              transition: "all 0.2s"
                            }}
                          >
                            <input
                              type="checkbox"
                              checked={enhancedCreateForm.selectedPageTypes.includes(pageType.value)}
                              onChange={(e) => {
                                setEnhancedCreateForm(prev => ({
                                  ...prev,
                                  selectedPageTypes: e.target.checked
                                    ? [...prev.selectedPageTypes, pageType.value]
                                    : prev.selectedPageTypes.filter(p => p !== pageType.value)
                                }));
                              }}
                              style={{ cursor: "pointer", width: "18px", height: "18px" }}
                            />
                            <BlockStack gap="050">
                              <Text variant="bodyMd" as="span">{pageType.label}</Text>
                              {pageType.type && (
                                <Text variant="bodySm" tone="subdued" as="span">
                                  {pageType.type}
                                </Text>
                              )}
                            </BlockStack>
                          </label>
                        ))}
                    </div>

                    {enhancedCreateForm.selectedPageTypes.length === 0 && enhancedCreateForm.trackingPages !== "all" && (
                      <Banner tone="warning">
                        <p>Please select at least one page type</p>
                      </Banner>
                    )}
                  </BlockStack>
                </Card>
              )}
            </>
          )}

          {/* Step 2: Choose Timezone */}
          {enhancedCreateStep === 2 && (
            <>
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
                    onChange={setSelectedTimezone}
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
        </BlockStack>
      </Modal.Section>
    </Modal>
  );
}
