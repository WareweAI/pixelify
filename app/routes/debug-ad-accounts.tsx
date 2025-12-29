import { useState } from "react";
import { Page, Card, Button, BlockStack, Text, Banner, TextField, List } from "@shopify/polaris";

export default function DebugAdAccounts() {
  const [token, setToken] = useState("");
  const [result, setResult] = useState<any>(null);
  const [loading, setLoading] = useState(false);

  const debugAdAccounts = async () => {
    if (!token) return;
    
    setLoading(true);
    setResult(null);
    
    try {
      const response = await fetch(`/api/debug-ad-accounts?token=${encodeURIComponent(token)}`);
      const data = await response.json();
      setResult(data);
    } catch (error) {
      setResult({
        error: `Network error: ${error}`,
        timestamp: new Date().toISOString()
      });
    } finally {
      setLoading(false);
    }
  };

  return (
    <Page title="Debug Facebook Ad Accounts">
      <Card>
        <BlockStack gap="400">
          <Text variant="headingMd" as="h2">
            Ad Accounts Debug Tool
          </Text>
          
          <Banner tone="info">
            <p>This tool will test your Facebook token specifically for ad accounts access - the exact issue you're experiencing.</p>
          </Banner>
          
          <TextField
            label="Facebook Access Token"
            value={token}
            onChange={setToken}
            placeholder="Paste your Facebook access token here..."
            helpText="This will test multiple ad account endpoints to find the exact issue"
          />
          
          <Button
            variant="primary"
            onClick={debugAdAccounts}
            loading={loading}
            disabled={!token}
          >
            Debug Ad Accounts Access
          </Button>
          
          {result && (
            <Card>
              <BlockStack gap="400">
                <Text variant="headingSm" as="h3">
                  Debug Results
                </Text>
                
                {result.error && (
                  <Banner tone="critical">
                    <p><strong>Error:</strong> {result.error}</p>
                  </Banner>
                )}
                
                {result.diagnosis && (
                  <Banner tone={result.diagnosis.includes('✅') ? "success" : result.diagnosis.includes('⚠️') ? "warning" : "critical"}>
                    <p><strong>Diagnosis:</strong> {result.diagnosis}</p>
                  </Banner>
                )}
                
                {result.recommendations && result.recommendations.length > 0 && (
                  <Card sectioned>
                    <BlockStack gap="300">
                      <Text variant="headingSm" as="h4">
                        💡 Recommendations:
                      </Text>
                      <List>
                        {result.recommendations.map((rec: string, index: number) => (
                          <List.Item key={index}>{rec}</List.Item>
                        ))}
                      </List>
                    </BlockStack>
                  </Card>
                )}
                
                {result.analysis && (
                  <Card sectioned>
                    <BlockStack gap="200">
                      <Text variant="headingSm" as="h4">
                        📊 Analysis:
                      </Text>
                      <List>
                        <List.Item>Token Valid: {result.analysis.userValid ? '✅' : '❌'}</List.Item>
                        <List.Item>Has ads_read Permission: {result.analysis.hasAdsRead ? '✅' : '❌'}</List.Item>
                        <List.Item>Has business_management Permission: {result.analysis.hasBusinessManagement ? '✅' : '❌'}</List.Item>
                        <List.Item>Ad Account Endpoints Working: {result.analysis.adAccountsWorking ? '✅' : '❌'}</List.Item>
                        <List.Item>Ad Accounts Found: {result.analysis.adAccountsFound ? '✅' : '❌'}</List.Item>
                        <List.Item>Working Endpoints: {result.analysis.workingEndpoints}/{result.analysis.totalEndpointsTested}</List.Item>
                      </List>
                    </BlockStack>
                  </Card>
                )}
                
                {result.results && (
                  <Card sectioned>
                    <BlockStack gap="300">
                      <Text variant="headingSm" as="h4">
                        🔍 Detailed Test Results:
                      </Text>
                      {result.results.map((test: any, index: number) => (
                        <Card key={index} sectioned>
                          <BlockStack gap="200">
                            <Text variant="bodyMd" fontWeight="semibold">
                              {test.test} {test.ok ? '✅' : '❌'}
                            </Text>
                            
                            {test.status && (
                              <Text variant="bodySm" tone="subdued">
                                HTTP Status: {test.status}
                              </Text>
                            )}
                            
                            {test.accountCount !== undefined && (
                              <Text variant="bodySm" tone="subdued">
                                Accounts Found: {test.accountCount}
                              </Text>
                            )}
                            
                            {test.grantedPermissions && (
                              <div>
                                <Text variant="bodySm" fontWeight="semibold">Granted Permissions:</Text>
                                <Text variant="bodySm" tone="subdued">
                                  {test.grantedPermissions.join(', ') || 'None'}
                                </Text>
                              </div>
                            )}
                            
                            {test.data?.error && (
                              <Banner tone="critical">
                                <p><strong>Facebook Error:</strong> {test.data.error.message} (Code: {test.data.error.code})</p>
                              </Banner>
                            )}
                            
                            {test.error && (
                              <Banner tone="critical">
                                <p><strong>Network Error:</strong> {test.error}</p>
                              </Banner>
                            )}
                            
                            {test.data && !test.data.error && (
                              <div>
                                <Text variant="bodySm" fontWeight="semibold">Response Data:</Text>
                                <div style={{ 
                                  backgroundColor: '#f8f9fa', 
                                  padding: '8px', 
                                  borderRadius: '4px',
                                  fontFamily: 'monospace',
                                  fontSize: '11px',
                                  maxHeight: '150px',
                                  overflow: 'auto',
                                  whiteSpace: 'pre-wrap',
                                  marginTop: '4px'
                                }}>
                                  {JSON.stringify(test.data, null, 2)}
                                </div>
                              </div>
                            )}
                          </BlockStack>
                        </Card>
                      ))}
                    </BlockStack>
                  </Card>
                )}
              </BlockStack>
            </Card>
          )}
          
          <Card sectioned>
            <BlockStack gap="200">
              <Text variant="headingSm" as="h3">
                What this tool tests:
              </Text>
              <List>
                <List.Item>✅ Token validity (can access user info)</List.Item>
                <List.Item>✅ Token permissions (ads_read, business_management, ads_management, pages_show_list, pages_read_engagement)</List.Item>
                <List.Item>✅ Multiple ad account endpoints</List.Item>
                <List.Item>✅ Exact error messages from Facebook</List.Item>
                <List.Item>✅ Number of ad accounts found</List.Item>
              </List>
            </BlockStack>
          </Card>
        </BlockStack>
      </Card>
    </Page>
  );
}