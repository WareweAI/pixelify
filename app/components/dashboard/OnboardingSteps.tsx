import { Card, BlockStack, Text, Icon } from "@shopify/polaris";
import { CheckIcon } from "@shopify/polaris-icons";

interface OnboardingStepsProps {
  currentStep: number;
}

export function OnboardingSteps({ currentStep }: OnboardingStepsProps) {
  const steps = [
    {
      number: 1,
      title: "Add Facebook Pixel",
      description: "Install the right pixels, and install the pixels right",
    },
    {
      number: 2,
      title: "Conversion API",
      description: "Track all customer behavior events bypassing the browser's limitation",
    },
    {
      number: 3,
      title: "Timezone",
      description: "Set the timezone for sending tracking events",
    },
    {
      number: 4,
      title: "Activate app",
      description: "Make sure the app work",
    },
  ];

  return (
    <Card>
      <BlockStack gap="400">
        {steps.map((step) => (
          <div 
            key={step.number}
            style={{ 
              display: "flex", 
              alignItems: "flex-start", 
              gap: "12px",
              padding: "16px",
              backgroundColor: currentStep === step.number ? "#f0f8ff" : "transparent",
              borderRadius: "8px"
            }}
          >
            <div style={{
              width: "24px",
              height: "24px",
              borderRadius: "50%",
              backgroundColor: currentStep >= step.number ? "#2563eb" : "#e5e7eb",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              flexShrink: 0,
              marginTop: "2px"
            }}>
              {currentStep > step.number ? (
                <Icon source={CheckIcon} tone="base" />
              ) : (
                <Text as="span" variant="bodySm" tone={currentStep === step.number ? "base" : "subdued"}>
                  {step.number}
                </Text>
              )}
            </div>
            <BlockStack gap="100">
              <Text variant="headingSm" as="h3">
                {step.title}
              </Text>
              <Text variant="bodySm" as="p" tone="subdued">
                {step.description}
              </Text>
            </BlockStack>
          </div>
        ))}
      </BlockStack>
    </Card>
  );
}
