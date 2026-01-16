import { useRouteError, isRouteErrorResponse, useLocation } from "react-router";
import { Page, Layout, Card, BlockStack, Text, Button, Banner, InlineStack } from "@shopify/polaris";
import { AlertCircleIcon } from "@shopify/polaris-icons";

export function SessionErrorBoundary() {
  const error = useRouteError();
  const location = useLocation();

  let title = "Session Error";
  let description = "Your session has expired or is invalid.";
  let statusCode = 500;
  let suggestion = "Please reload the app to re-authenticate.";
  let showReloadButton = true;

  if (isRouteErrorResponse(error)) {
    statusCode = error.status;
    
    if (error.status === 401 || error.status === 403) {
      title = "Session Expired";
      description = "Your session has expired. Please re-authenticate to continue.";
      suggestion = "Click the button below to re-authenticate with your Shopify store.";
    } else if (error.status === 404) {
      title = "Page Not Found";
      description = "The page you're looking for doesn't exist.";
      suggestion = "You'll be redirected to the dashboard.";
      showReloadButton = false;
    } else if (error.status === 500) {
      title = "Server Error";
      description = "Something went wrong on the server.";
      suggestion = "Please try reloading the page or contact support.";
    }

    if (typeof error.data === "string" && error.data.length > 0) {
      description = error.data;
    } else if (error.statusText) {
      description = error.statusText;
    }
  } else if (error instanceof Error) {
    title = "Error";
    description = error.message || "An unexpected error occurred.";
  }

  return (
    <Page title={title}>
      <Layout>
        <Layout.Section>
          <Card>
            <BlockStack gap="400">
              <InlineStack gap="300" blockAlign="start">
                <div style={{ marginTop: "4px" }}>
                  <AlertCircleIcon width={32} height={32} />
                </div>
                <BlockStack gap="200">
                  <Text as="h2" variant="headingMd" fontWeight="semibold">
                    {title}
                  </Text>
                  <Text as="p" variant="bodyMd" tone="subdued">
                    {description}
                  </Text>
                </BlockStack>
              </InlineStack>

              <Banner tone="warning">
                <Text as="p" variant="bodySm">
                  {suggestion}
                </Text>
              </Banner>

              <InlineStack gap="200">
                {showReloadButton && (
                  <Button
                    variant="primary"
                    onClick={() => {
                      // Force reload from the session-token route to re-authenticate
                      window.location.href = `/auth/session-token?shopify-reload=${encodeURIComponent(location.pathname)}`;
                    }}
                  >
                    Re-authenticate
                  </Button>
                )}
                <Button
                  onClick={() => {
                    window.location.href = "/app/dashboard";
                  }}
                >
                  Go to Dashboard
                </Button>
              </InlineStack>

              {process.env.NODE_ENV === "development" && (
                <details style={{ marginTop: "16px", padding: "12px", backgroundColor: "#f6f6f7", borderRadius: "6px" }}>
                  <summary style={{ cursor: "pointer", fontWeight: "500" }}>
                    Debug Information (Development Only)
                  </summary>
                  <pre
                    style={{
                      marginTop: "12px",
                      padding: "12px",
                      backgroundColor: "#fff",
                      borderRadius: "4px",
                      fontSize: "12px",
                      overflow: "auto",
                      maxHeight: "200px",
                    }}
                  >
                    {JSON.stringify(
                      {
                        statusCode,
                        errorType: error instanceof Error ? "Error" : "RouteError",
                        message: error instanceof Error ? error.message : (isRouteErrorResponse(error) ? error.statusText : "Unknown"),
                        timestamp: new Date().toISOString(),
                      },
                      null,
                      2
                    )}
                  </pre>
                </details>
              )}
            </BlockStack>
          </Card>
        </Layout.Section>
      </Layout>
    </Page>
  );
}
