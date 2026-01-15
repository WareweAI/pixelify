// Client-side redirect after billing approval using App Bridge
import { useEffect } from "react";
import { useNavigate } from "react-router";
import { Spinner, Box, Text } from "@shopify/polaris";

export function BillingRedirect() {
  const navigate = useNavigate();

  useEffect(() => {
    // Use App Bridge navigation to avoid iframe issues
    console.log("[BillingRedirect] Redirecting to dashboard");
    
    // Small delay to ensure App Bridge is ready
    const timer = setTimeout(() => {
      navigate("/app/dashboard", { replace: true });
    }, 100);

    return () => clearTimeout(timer);
  }, [navigate]);

  return (
    <Box padding="800">
      <div style={{ textAlign: "center" }}>
        <Spinner size="large" />
        <Box paddingBlockStart="400">
          <Text as="p" variant="bodyLg">
            Processing your subscription...
          </Text>
        </Box>
      </div>
    </Box>
  );
}
