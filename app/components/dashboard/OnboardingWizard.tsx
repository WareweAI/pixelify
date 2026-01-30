import { useState, useEffect, useCallback } from "react";
import {
  Card,
  BlockStack,
  InlineStack,
  Text,
  Button,
  Badge,
  Banner,
  Select,
  TextField,
  Icon,
  Box,
} from "@shopify/polaris";
import { CheckIcon, AlertCircleIcon } from "@shopify/polaris-icons";

interface OnboardingWizardProps {
  onComplete: (data: {
    pixelId: string;
    pixelName: string;
    accessToken: string;
    timezone: string;
  }) => void;
  onSkip: () => void;
  isLoading?: boolean;
  error?: string | null;
}

interface Step {
  number: number;
  title: string;
  description: string;
  completed: boolean;
}

export function OnboardingWizard({ onComplete, onSkip, isLoading = false, error: externalError = null }: OnboardingWizardProps) {
  const [currentStep, setCurrentStep] = useState(1);
  const [facebookConnected, setFacebookConnected] = useState(false);
  const [facebookAccessToken, setFacebookAccessToken] = useState("");
  const [facebookPixels, setFacebookPixels] = useState<Array<{ id: string; name: string; accountName: string }>>([]);
  const [selectedPixelId, setSelectedPixelId] = useState("");
  const [selectedPixelName, setSelectedPixelName] = useState("");
  const [selectedTimezone, setSelectedTimezone] = useState("GMT+0");
  const [inputMethod, setInputMethod] = useState<"auto" | "manual">("auto");
  const [manualPixelId, setManualPixelId] = useState("");
  const [manualAccessToken, setManualAccessToken] = useState("");
  const [error, setError] = useState("");
  const [isFetchingPixels, setIsFetchingPixels] = useState(false);
  const [conversionApiToken, setConversionApiToken] = useState("");
  const [isValidatingToken, setIsValidatingToken] = useState(false);
  const [tokenValidated, setTokenValidated] = useState(false);

  const steps: Step[] = [
    {
      number: 1,
      title: "Add Facebook Pixel",
      description: "Install the right pixels, and install the pixels right",
      completed: currentStep > 1,
    },
    {
      number: 2,
      title: "Conversion API",
      description: "Track all customer behavior events bypassing the browser's limitation",
      completed: currentStep > 2,
    },
    {
      number: 3,
      title: "Timezone",
      description: "Set the timezone for sending tracking events",
      completed: currentStep > 3,
    },
    {
      number: 4,
      title: "Activate app",
      description: "Make sure the app work",
      completed: currentStep > 4,
    },
  ];

  const timezoneOptions = [
    { label: "(GMT+0:00) UTC - Coordinated Universal Time", value: "GMT+0" },
    { label: "(GMT+1:00) Paris, Berlin, Rome, Madrid", value: "GMT+1" },
    { label: "(GMT+2:00) Cairo, Athens, Helsinki, Kyiv", value: "GMT+2" },
    { label: "(GMT+3:00) Moscow, Istanbul, Riyadh, Nairobi", value: "GMT+3" },
    { label: "(GMT+4:00) Dubai, Baku, Tbilisi", value: "GMT+4" },
    { label: "(GMT+5:00) Karachi, Tashkent", value: "GMT+5" },
    { label: "(GMT+5:30) Mumbai, New Delhi, Kolkata", value: "GMT+5:30" },
    { label: "(GMT+6:00) Dhaka, Almaty", value: "GMT+6" },
    { label: "(GMT+7:00) Bangkok, Jakarta, Hanoi", value: "GMT+7" },
    { label: "(GMT+8:00) Singapore, Hong Kong, Beijing", value: "GMT+8" },
    { label: "(GMT+9:00) Tokyo, Seoul", value: "GMT+9" },
    { label: "(GMT+10:00) Sydney, Melbourne, Brisbane", value: "GMT+10" },
    { label: "(GMT-5:00) Eastern Time (US & Canada)", value: "GMT-5" },
    { label: "(GMT-6:00) Central Time (US & Canada)", value: "GMT-6" },
    { label: "(GMT-7:00) Mountain Time (US & Canada)", value: "GMT-7" },
    { label: "(GMT-8:00) Pacific Time (US & Canada)", value: "GMT-8" },
  ];

  // Clear external error when user navigates between steps
  useEffect(() => {
    if (externalError) {
      console.log('[OnboardingWizard] External error detected, will clear on step change');
    }
  }, [currentStep, externalError]);

  // Load cached data on mount
  useEffect(() => {
    const cachedToken = localStorage.getItem("onboarding_facebook_token");
    const cachedPixels = localStorage.getItem("onboarding_facebook_pixels");
    const cachedStep = localStorage.getItem("onboarding_current_step");

    if (cachedToken) {
      setFacebookAccessToken(cachedToken);
      setFacebookConnected(true);
    }

    if (cachedPixels) {
      try {
        setFacebookPixels(JSON.parse(cachedPixels));
      } catch (err) {
        console.error("Error parsing cached pixels:", err);
      }
    }

    if (cachedStep) {
      setCurrentStep(parseInt(cachedStep));
    }
  }, []);

  const handleConnectFacebook = useCallback(() => {
    if (!(window as any).FB) {
      setError("Facebook SDK not loaded. Please refresh the page.");
      return;
    }

    const scope = "ads_read,business_management,ads_management,pages_show_list,pages_read_engagement,catalog_management";

    (window as any).FB.login(function (response: any) {
      if (response.status === 'connected') {
        const accessToken = response.authResponse.accessToken;
        setFacebookAccessToken(accessToken);
        setFacebookConnected(true);
        localStorage.setItem("onboarding_facebook_token", accessToken);
        
        // Fetch pixels
        fetchPixelsFromFacebook(accessToken);
      } else {
        setError('Facebook login was cancelled or failed.');
      }
    }, { scope });
  }, []);

  const fetchPixelsFromFacebook = async (token: string) => {
    setIsFetchingPixels(true);
    setError("");

    try {
      const response = await fetch('/api/dashboard', {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams({
          intent: 'fetch-facebook-pixels',
          accessToken: token,
        }),
      });

      const data = await response.json();

      if (data.success && data.facebookPixels) {
        setFacebookPixels(data.facebookPixels);
        localStorage.setItem("onboarding_facebook_pixels", JSON.stringify(data.facebookPixels));
        
        if (data.facebookPixels.length === 0) {
          setError("No available pixels found. All your pixels may already be added, or you need to create new pixels in Facebook Events Manager.");
        }
      } else {
        setError(data.error || "Failed to fetch pixels from Facebook");
      }
    } catch (err: any) {
      setError("Failed to connect to Facebook. Please try again.");
      console.error("Error fetching pixels:", err);
    } finally {
      setIsFetchingPixels(false);
    }
  };

  const handleStep1Next = () => {
    if (inputMethod === "auto") {
      if (!selectedPixelId) {
        setError("Please select a pixel");
        return;
      }
      // Pre-fill conversion API token with Facebook token from auto-connect
      if (facebookAccessToken) {
        setConversionApiToken(facebookAccessToken);
      }
    } else {
      if (!manualPixelId || !manualAccessToken) {
        setError("Please enter both Pixel ID and Access Token");
        return;
      }
      setSelectedPixelId(manualPixelId);
      setFacebookAccessToken(manualAccessToken);
      // Pre-fill conversion API token with manual token
      setConversionApiToken(manualAccessToken);
    }

    setError("");
    setCurrentStep(2);
    localStorage.setItem("onboarding_current_step", "2");
  };

  const handleBackToStep1 = () => {
    // Reset Step 2 validation state when going back
    setTokenValidated(false);
    setError("");
    setCurrentStep(1);
    localStorage.setItem("onboarding_current_step", "1");
  };

  const handleBackToStep2 = () => {
    setError("");
    setCurrentStep(2);
    localStorage.setItem("onboarding_current_step", "2");
  };

  const handleBackToStep3 = () => {
    setError("");
    setCurrentStep(3);
    localStorage.setItem("onboarding_current_step", "3");
  };

  const handleValidateToken = async () => {
    if (!conversionApiToken) {
      setError("Please enter your Meta Access Token");
      return;
    }

    setIsValidatingToken(true);
    setError("");

    try {
      const response = await fetch('/api/dashboard', {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams({
          intent: 'validate-pixel',
          pixelId: selectedPixelId,
          accessToken: conversionApiToken,
        }),
      });

      const data = await response.json();

      if (data.success) {
        setTokenValidated(true);
        setFacebookAccessToken(conversionApiToken); // Update the token to use for creation
        setError("");
      } else {
        setError(data.error || "Failed to validate token with pixel");
        setTokenValidated(false);
      }
    } catch (err: any) {
      setError("Failed to validate token. Please try again.");
      setTokenValidated(false);
      console.error("Error validating token:", err);
    } finally {
      setIsValidatingToken(false);
    }
  };

  const handleStep2Next = () => {
    if (!tokenValidated) {
      setError("Please validate your Meta Access Token first");
      return;
    }
    setError("");
    setCurrentStep(3);
    localStorage.setItem("onboarding_current_step", "3");
  };

  const handleStep3Next = () => {
    setCurrentStep(4);
    localStorage.setItem("onboarding_current_step", "4");
  };

  const handleComplete = () => {
    console.log('[OnboardingWizard] 🎯 handleComplete called');
    console.log('[OnboardingWizard] Current data:', {
      pixelId: selectedPixelId,
      pixelName: selectedPixelName,
      hasAccessToken: !!facebookAccessToken,
      timezone: selectedTimezone
    });
    
    onComplete({
      pixelId: selectedPixelId,
      pixelName: selectedPixelName || `Pixel ${selectedPixelId}`,
      accessToken: facebookAccessToken,
      timezone: selectedTimezone,
    });

    // Clear onboarding cache
    localStorage.removeItem("onboarding_facebook_token");
    localStorage.removeItem("onboarding_facebook_pixels");
    localStorage.removeItem("onboarding_current_step");
    
    console.log('[OnboardingWizard] ✅ onComplete callback executed, cache cleared');
  };

  return (
    <Card>
      <BlockStack gap="600">
        {/* Header */}
        <BlockStack gap="200">
          <Text as="h2" variant="headingLg">
            Get your Pixels ready
          </Text>
          <Text as="p" variant="bodyMd" tone="subdued">
            Install the right pixels, and install the pixels right
          </Text>
        </BlockStack>

        {/* Steps Progress */}
        <BlockStack gap="300">
          {steps.map((step) => (
            <div
              key={step.number}
              style={{
                display: "flex",
                alignItems: "flex-start",
                gap: "16px",
                opacity: currentStep === step.number ? 1 : 0.6,
              }}
            >
              <div
                style={{
                  width: "32px",
                  height: "32px",
                  borderRadius: "50%",
                  backgroundColor: step.completed ? "#008060" : currentStep === step.number ? "#2563eb" : "#e4e5e7",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  flexShrink: 0,
                }}
              >
                {step.completed ? (
                  <Icon source={CheckIcon} tone="base" />
                ) : (
                  <Text as="span" variant="bodyMd" fontWeight="bold" tone="base">
                    {step.number}
                  </Text>
                )}
              </div>
              <BlockStack gap="100">
                <Text as="p" variant="bodyMd" fontWeight="semibold">
                  {step.title}
                </Text>
                <Text as="p" variant="bodySm" tone="subdued">
                  {step.description}
                </Text>
              </BlockStack>
            </div>
          ))}
        </BlockStack>

        {/* Step Content */}
        <Card background="bg-surface-secondary">
          <BlockStack gap="400">
            {/* Step 1: Add Facebook Pixel */}
            {currentStep === 1 && (
              <BlockStack gap="400">
                <Text as="h3" variant="headingMd">
                  Step 1: Add Facebook Pixel
                </Text>

                {error && (
                  <Banner tone="critical" onDismiss={() => setError("")}>
                    {error}
                  </Banner>
                )}

                {/* Input Method Selection */}
                <InlineStack gap="200">
                  <Button
                    variant={inputMethod === "auto" ? "primary" : "secondary"}
                    onClick={() => setInputMethod("auto")}
                  >
                    Auto Input
                  </Button>
                  <Button
                    variant={inputMethod === "manual" ? "primary" : "secondary"}
                    onClick={() => setInputMethod("manual")}
                  >
                    Manual Input
                  </Button>
                </InlineStack>

                {inputMethod === "auto" ? (
                  <BlockStack gap="300">
                    {!facebookConnected ? (
                      <Button onClick={handleConnectFacebook} variant="primary">
                        Connect to Facebook
                      </Button>
                    ) : (
                      <BlockStack gap="300">
                        <Banner tone="success">
                          ✅ Connected to Facebook! Found {facebookPixels.length} available pixel(s).
                        </Banner>

                        {isFetchingPixels ? (
                          <Text as="p">Loading pixels...</Text>
                        ) : facebookPixels.length > 0 ? (
                          <Select
                            label="Select a Facebook Pixel"
                            options={[
                              { label: "Choose a pixel...", value: "" },
                              ...facebookPixels.map(pixel => ({
                                label: `${pixel.name} (${pixel.accountName})`,
                                value: pixel.id
                              }))
                            ]}
                            value={selectedPixelId}
                            onChange={(value) => {
                              setSelectedPixelId(value);
                              const pixel = facebookPixels.find(p => p.id === value);
                              if (pixel) {
                                setSelectedPixelName(pixel.name);
                              }
                            }}
                          />
                        ) : (
                          <Banner tone="info">
                            No available pixels found. Create new pixels in Facebook Events Manager or use Manual Input.
                          </Banner>
                        )}

                        <Button onClick={() => {
                          setFacebookConnected(false);
                          setFacebookPixels([]);
                          localStorage.removeItem("onboarding_facebook_token");
                          localStorage.removeItem("onboarding_facebook_pixels");
                        }}>
                          Disconnect
                        </Button>
                      </BlockStack>
                    )}
                  </BlockStack>
                ) : (
                  <BlockStack gap="300">
                    <TextField
                      label="Facebook Pixel ID"
                      value={manualPixelId}
                      onChange={setManualPixelId}
                      placeholder="Enter your Pixel ID"
                      autoComplete="off"
                    />
                    <TextField
                      label="Facebook Access Token"
                      value={manualAccessToken}
                      onChange={setManualAccessToken}
                      placeholder="Enter your Access Token"
                      autoComplete="off"
                      type="password"
                    />
                  </BlockStack>
                )}

                <InlineStack align="end" gap="200">
                  <Button onClick={onSkip}>Skip Setup</Button>
                  <Button
                    variant="primary"
                    onClick={handleStep1Next}
                    disabled={
                      inputMethod === "auto"
                        ? !selectedPixelId
                        : !manualPixelId || !manualAccessToken
                    }
                  >
                    Continue
                  </Button>
                </InlineStack>
              </BlockStack>
            )}

            {/* Step 2: Conversion API */}
            {currentStep === 2 && (
              <BlockStack gap="400">
                <Text as="h3" variant="headingMd">
                  Step 2: Conversion API Setup
                </Text>
                
                {error && (
                  <Banner tone="critical" onDismiss={() => setError("")}>
                    {error}
                  </Banner>
                )}
                
                {tokenValidated && (
                  <Banner tone="success">
                    <BlockStack gap="200">
                      <Text as="p" variant="bodyMd" fontWeight="semibold">
                        ✅ Token Validated Successfully
                      </Text>
                      <Text as="p" variant="bodySm">
                        Your Meta Access Token has been validated and linked to Pixel ID: {selectedPixelId}
                      </Text>
                    </BlockStack>
                  </Banner>
                )}
                
                <Banner tone="info">
                  <BlockStack gap="200">
                    <Text as="p" variant="bodyMd" fontWeight="semibold">
                      Server-Side Tracking with Conversion API
                    </Text>
                    <Text as="p" variant="bodySm">
                      Enter your Meta Access Token to enable server-side event tracking. This bypasses browser limitations like ad blockers and provides more accurate tracking.
                    </Text>
                  </BlockStack>
                </Banner>

                <BlockStack gap="300">
                  <TextField
                    label="Meta Access Token"
                    value={conversionApiToken}
                    onChange={setConversionApiToken}
                    placeholder="Enter your Meta Access Token"
                    autoComplete="off"
                    type="password"
                    helpText="This token will be used to send events to Facebook's Conversion API"
                    disabled={tokenValidated}
                  />
                  
                  {!tokenValidated && (
                    <Button
                      onClick={handleValidateToken}
                      loading={isValidatingToken}
                      disabled={!conversionApiToken}
                    >
                      Validate Token
                    </Button>
                  )}
                  
                  {tokenValidated && (
                    <Button
                      onClick={() => {
                        setTokenValidated(false);
                        setConversionApiToken("");
                      }}
                    >
                      Change Token
                    </Button>
                  )}
                </BlockStack>

                <InlineStack align="space-between">
                  <Button onClick={handleBackToStep1}>Back</Button>
                  <Button 
                    variant="primary" 
                    onClick={handleStep2Next}
                    disabled={!tokenValidated}
                  >
                    Continue
                  </Button>
                </InlineStack>
              </BlockStack>
            )}

            {/* Step 3: Timezone */}
            {currentStep === 3 && (
              <BlockStack gap="400">
                <Text as="h3" variant="headingMd">
                  Step 3: Set Timezone
                </Text>
                <Select
                  label="Select your timezone"
                  options={timezoneOptions}
                  value={selectedTimezone}
                  onChange={setSelectedTimezone}
                />

                <InlineStack align="space-between">
                  <Button onClick={handleBackToStep2}>Back</Button>
                  <Button variant="primary" onClick={handleStep3Next}>
                    Continue
                  </Button>
                </InlineStack>
              </BlockStack>
            )}

            {/* Step 4: Activate */}
            {currentStep === 4 && (
              <BlockStack gap="400">
                <Text as="h3" variant="headingMd">
                  Step 4: Activate App
                </Text>
                
                {externalError && (
                  <Banner tone="critical">
                    <BlockStack gap="200">
                      <Text as="p" variant="bodyMd" fontWeight="semibold">
                        Error Creating Pixel
                      </Text>
                      <Text as="p" variant="bodySm">
                        {externalError}
                      </Text>
                      <Text as="p" variant="bodySm" fontWeight="medium">
                        Please check your Pixel ID and Access Token, then try again.
                      </Text>
                    </BlockStack>
                  </Banner>
                )}
                
                {!externalError && (
                  <Banner tone="success">
                    <BlockStack gap="200">
                      <Text as="p" variant="bodyMd" fontWeight="semibold">
                        Ready to Go!
                      </Text>
                      <Text as="p" variant="bodySm">
                        Your pixel is configured and ready to start tracking events. Click "Complete Setup" to activate your pixel.
                      </Text>
                    </BlockStack>
                  </Banner>
                )}

                <Box padding="400" background="bg-surface-active" borderRadius="200">
                  <BlockStack gap="200">
                    <Text as="p" variant="bodyMd" fontWeight="semibold">
                      Configuration Summary:
                    </Text>
                    <Text as="p" variant="bodySm">
                      • Pixel ID: {selectedPixelId}
                    </Text>
                    <Text as="p" variant="bodySm">
                      • Timezone: {selectedTimezone}
                    </Text>
                    <Text as="p" variant="bodySm">
                      • Conversion API: Enabled
                    </Text>
                  </BlockStack>
                </Box>

                <InlineStack align="space-between">
                  <Button onClick={handleBackToStep3}>Back</Button>
                  <Button
                    variant="primary"
                    onClick={handleComplete}
                    loading={isLoading}
                  >
                    Complete Setup
                  </Button>
                </InlineStack>
              </BlockStack>
            )}
          </BlockStack>
        </Card>
      </BlockStack>
    </Card>
  );
}