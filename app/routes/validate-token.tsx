import { useState } from "react";
import { Page, Card, Button, BlockStack, Text, Banner, TextField } from "@shopify/polaris";

export default function ValidateToken() {
  const [token, setToken] = useState("");
  const [result, setResult] = useState<any>(null);
  const [loading, setLoading] = useState(false);

  const validateToken = async () => {
    if (!token) return;
    
    setLoading(true);
    setResult(null);
    
    try {
      // Test the token directly against Facebook's API
      const response = await fetch(`https://graph.facebook.com/v24.0/me?access_token=${token}`);
      const data = await response.json();
      
      setResult({
        status: response.status,
        ok: response.ok,
        data: data,
        timestamp: new Date().toISOString()
      });
      
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
    <Page title="Facebook Token Validator">
      <Card>
        <BlockStack gap="400">
          <Text variant="headingMd" as="h2">
            Direct Facebook Token Test
          </Text>
          
          <TextField
            label="Facebook Access Token"
            value={token}
            onChange={setToken}
            placeholder="Paste your Facebook access token here..."
            helpText="This will test your token directly against Facebook's Graph API"
          />
          
          <Button
            variant="primary"
            onClick={validateToken}
            loading={loading}
            disabled={!token}
          >
            Test Token
          </Button>
          
          {result && (
            <Card sectioned>
              <BlockStack gap="300">
                <Text variant="headingSm" as="h3">
                  Test Result
                </Text>
                
                <Banner tone={result.ok ? "success" : "critical"}>
                  <p>
                    <strong>Status:</strong> {result.status} {result.ok ? "(Success)" : "(Failed)"}
                  </p>
                </Banner>
                
                {result.data && (
                  <div>
                    <Text variant="bodyMd" fontWeight="semibold">Response:</Text>
                    <div style={{ 
                      backgroundColor: result.ok ? '#f0fdf4' : '#fef2f2', 
                      padding: '12px', 
                      borderRadius: '4px',
                      fontFamily: 'monospace',
                      fontSize: '12px',
                      whiteSpace: 'pre-wrap',
                      marginTop: '8px',
                      border: `1px solid ${result.ok ? '#bbf7d0' : '#fecaca'}`
                    }}>
                      {JSON.stringify(result.data, null, 2)}
                    </div>
                  </div>
                )}
                
                {result.error && (
                  <Banner tone="critical">
                    <p>{result.error}</p>
                  </Banner>
                )}
              </BlockStack>
            </Card>
          )}
          
          <Card sectioned>
            <BlockStack gap="200">
              <Text variant="headingSm" as="h3">
                Common 400 Error Causes:
              </Text>
              <ul style={{ marginLeft: '20px' }}>
                <li><strong>Invalid Token:</strong> Token is expired or malformed</li>
                <li><strong>Wrong App:</strong> Token was generated for a different Facebook app</li>
                <li><strong>Missing Permissions:</strong> Token doesn't have required scopes</li>
                <li><strong>App Not Active:</strong> Your Facebook app is in development mode</li>
                <li><strong>User Deauthorized:</strong> User revoked app permissions</li>
              </ul>
            </BlockStack>
          </Card>
          
          <Card sectioned>
            <BlockStack gap="200">
              <Text variant="headingSm" as="h3">
                How to get a valid token:
              </Text>
              <ol style={{ marginLeft: '20px' }}>
                <li>Go to <a href="https://developers.facebook.com/tools/explorer/" target="_blank" rel="noopener noreferrer">Facebook Graph API Explorer</a></li>
                <li>Make sure you select your app: <strong>881927951248648</strong></li>
                <li>Click "Generate Access Token"</li>
                <li>Add permissions: <code>ads_read</code>, <code>business_management</code>, <code>ads_management</code>, <code>pages_show_list</code>, <code>pages_read_engagement</code></li>
                <li>Copy the token and test it here</li>
              </ol>
            </BlockStack>
          </Card>
        </BlockStack>
      </Card>
    </Page>
  );
}