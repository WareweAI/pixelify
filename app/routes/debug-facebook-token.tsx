import { useState, useCallback } from "react";
import { Page, Card, Button, BlockStack, Text, Banner, TextField, List } from "@shopify/polaris";

export default function DebugFacebookToken() {
  const [accessToken, setAccessToken] = useState("");
  const [debugInfo, setDebugInfo] = useState<any>(null);
  const [loading, setLoading] = useState(false);

  const handleDebugToken = useCallback(async () => {
    if (!accessToken) return;
    
    setLoading(true);
    setDebugInfo(null);
    
    try {
      // Use the step-by-step debug API
      const response = await fetch('/api/debug-facebook-step-by-step', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ accessToken }),
      });
      
      const data = await response.json();
      console.log("Debug Response:", data);
      setDebugInfo(data);
      
    } catch (err) {
      setDebugInfo({
        error: `Network error: ${err}`,
        timestamp: new Date().toISOString()
      });
    } finally {
      setLoading(false);
    }
  }, [accessToken]);

  return (
    <Page title="Debug Facebook Token & Pixel Access">
      <Card>
        <BlockStack gap="400">
          <Text variant="headingMd" as="h2">
            Facebook Token Debugger
          </Text>
          
          <TextField
            label="Facebook Access Token"
            value={accessToken}
            onChange={setAccessToken}
            type="password"
            placeholder="Paste your Facebook access token here..."
            helpText="This will test your token and show detailed debug information"
          />
          
          <Button
            variant="primary"
            onClick={handleDebugToken}
            loading={loading}
            disabled={!accessToken}
          >
            Debug Token & Fetch Pixels
          </Button>
          
          {debugInfo && (
            <Card>
              <BlockStack gap="400">
                <Text variant="headingSm" as="h3">
                  Debug Results
                </Text>
                
                {debugInfo.error && (
                  <Banner tone="critical">
                    <p><strong>Error:</strong> {debugInfo.error}</p>
                  </Banner>
                )}
                
                {debugInfo.conclusion && (
                  <Banner tone={debugInfo.conclusion.includes('✅') ? "success" : "critical"}>
                    <p><strong>Conclusion:</strong> {debugInfo.conclusion}</p>
                  </Banner>
                )}
                
                {debugInfo.recommendations && debugInfo.recommendations.length > 0 && (
                  <Card sectioned>
                    <BlockStack gap="300">
                      <Text variant="headingSm" as="h4">
                        💡 Recommendations:
                      </Text>
                      <List>
                        {debugInfo.recommendations.map((rec: string, index: number) => (
                          <List.Item key={index}>{rec}</List.Item>
                        ))}
                      </List>
                    </BlockStack>
                  </Card>
                )}
                
                {debugInfo.summary && (
                  <Card sectioned>
                    <BlockStack gap="200">
                      <Text variant="headingSm" as="h4">
                        📊 Summary:
                      </Text>
                      <List>
                        <List.Item>Token Valid: {debugInfo.summary.tokenValid ? '✅' : '❌'}</List.Item>
                        <List.Item>Has Permissions: {debugInfo.summary.hasPermissions ? '✅' : '❌'}</List.Item>
                        <List.Item>Ad Accounts Found: {debugInfo.summary.adAccountsFound ? '✅' : '❌'}</List.Item>
                        <List.Item>Business Access: {debugInfo.summary.businessFound ? '✅' : '❌'}</List.Item>
                        <List.Item>Successful Steps: {debugInfo.summary.successfulSteps}/{debugInfo.summary.totalSteps}</List.Item>
                      </List>
                    </BlockStack>
                  </Card>
                )}
                
                {debugInfo.results?.steps && (
                  <Card sectioned>
                    <BlockStack gap="300">
                      <Text variant="headingSm" as="h4">
                        🔍 Detailed Steps:
                      </Text>
                      {debugInfo.results.steps.map((step: any, index: number) => (
                        <Card key={index} sectioned>
                          <BlockStack gap="200">
                            <Text variant="bodyMd" fontWeight="semibold">
                              Step {step.step}: {step.name} {step.success ? '✅' : '❌'}
                            </Text>
                            
                            {step.url && (
                              <Text variant="bodySm" tone="subdued">
                                URL: {step.url}
                              </Text>
                            )}
                            
                            {step.status && (
                              <Text variant="bodySm" tone="subdued">
                                HTTP Status: {step.status}
                              </Text>
                            )}
                            
                            {step.error && (
                              <Banner tone="critical">
                                <p>{step.error}</p>
                              </Banner>
                            )}
                            
                            {step.data && (
                              <div>
                                <Text variant="bodySm" fontWeight="semibold">Response Data:</Text>
                                <div style={{ 
                                  backgroundColor: '#f8f9fa', 
                                  padding: '8px', 
                                  borderRadius: '4px',
                                  fontFamily: 'monospace',
                                  fontSize: '11px',
                                  maxHeight: '200px',
                                  overflow: 'auto',
                                  whiteSpace: 'pre-wrap',
                                  marginTop: '4px'
                                }}>
                                  {JSON.stringify(step.data, null, 2)}
                                </div>
                              </div>
                            )}
                            
                            {step.accountCount !== undefined && (
                              <Text variant="bodySm" tone="subdued">
                                Accounts Found: {step.accountCount}
                              </Text>
                            )}
                            
                            {step.businessCount !== undefined && (
                              <Text variant="bodySm" tone="subdued">
                                Businesses Found: {step.businessCount}
                              </Text>
                            )}
                          </BlockStack>
                        </Card>
                      ))}
                    </BlockStack>
                  </Card>
                )}
                
                <Card sectioned>
                  <BlockStack gap="200">
                    <Text variant="headingSm" as="h4">
                      📋 Raw Debug Response:
                    </Text>
                    <div style={{ 
                      backgroundColor: '#f8f9fa', 
                      padding: '12px', 
                      borderRadius: '4px',
                      fontFamily: 'monospace',
                      fontSize: '11px',
                      maxHeight: '300px',
                      overflow: 'auto',
                      whiteSpace: 'pre-wrap'
                    }}>
                      {JSON.stringify(debugInfo, null, 2)}
                    </div>
                  </BlockStack>
                </Card>
              </BlockStack>
            </Card>
          )}
          
          <Card sectioned>
            <BlockStack gap="200">
              <Text variant="headingSm" as="h3">
                How to get your access token:
              </Text>
              <List>
                <List.Item>Go to <a href="https://developers.facebook.com/tools/explorer/" target="_blank" rel="noopener noreferrer">Facebook Graph API Explorer</a></List.Item>
                <List.Item>Select your app (App ID: 881927951248648)</List.Item>
                <List.Item>Click "Generate Access Token"</List.Item>
                <List.Item>Add permissions: <code>ads_read</code>, <code>business_management</code>, <code>ads_management</code>, <code>pages_show_list</code>, <code>pages_read_engagement</code></List.Item>
                <List.Item>Copy the token and paste it above</List.Item>
              </List>
            </BlockStack>
          </Card>
        </BlockStack>
      </Card>
    </Page>
  );
}