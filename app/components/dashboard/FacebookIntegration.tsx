import { useState, useCallback, useEffect } from "react";
import { useFetcher } from "react-router";
import { Button, Card, InlineStack, BlockStack, Text, Banner, Icon } from "@shopify/polaris";
import { ConnectIcon } from "@shopify/polaris-icons";
import { ClientOnly } from "../ClientOnly";

interface FacebookUser {
  id: string;
  name: string;
  picture?: string | null;
}

interface FacebookPixel {
  id: string;
  name: string;
  accountName: string;
}

interface FacebookIntegrationProps {
  onConnectionChange: (isConnected: boolean, user: FacebookUser | null, pixels: FacebookPixel[], accessToken: string) => void;
  onError: (error: string) => void;
}

export function FacebookIntegration({ onConnectionChange, onError }: FacebookIntegrationProps) {
  const fetcher = useFetcher();
  const [mounted, setMounted] = useState(false);
  const [isConnectedToFacebook, setIsConnectedToFacebook] = useState(false);
  const [facebookAccessToken, setFacebookAccessToken] = useState("");
  const [facebookPixels, setFacebookPixels] = useState<FacebookPixel[]>([]);
  const [facebookUser, setFacebookUser] = useState<FacebookUser | null>(null);
  const [facebookError, setFacebookError] = useState("");
  const [isRefreshingToken, setIsRefreshingToken] = useState(false);

  // Function to fetch pixels using Facebook SDK (3-step approach)
  const fetchPixelsWithSDK = useCallback((accessToken: string) => {
    const FB = (window as any).FB;
    if (!FB) {
      console.log('[Facebook SDK] SDK not available for pixel fetch');
      return;
    }

    console.log('[Facebook SDK] Step 1: Fetching user info (/me)...');
    
    // Step 1: Get user ID
    FB.api('/me', 'GET', { fields: 'id,name,picture.type(small)' }, function(userResponse: any) {
      if (userResponse.error) {
        console.error('[Facebook SDK] Error fetching user:', userResponse.error);
        return;
      }
      
      console.log('[Facebook SDK] User ID:', userResponse.id);
      console.log('[Facebook SDK] User Name:', userResponse.name);
      
      // Save user data
      const userData = {
        id: userResponse.id,
        name: userResponse.name,
        picture: userResponse.picture?.data?.url || null
      };
      setFacebookUser(userData);
      localStorage.setItem("facebook_user", JSON.stringify(userData));
      
      // Step 2: Get businesses
      console.log('[Facebook SDK] Step 2: Fetching businesses (/me/businesses)...');
      
      FB.api('/me/businesses', 'GET', {}, function(businessResponse: any) {
        if (businessResponse.error) {
          console.error('[Facebook SDK] Error fetching businesses:', businessResponse.error);
          fetchPixelsFromAdAccounts(FB, accessToken);
          return;
        }
        
        console.log('[Facebook SDK] Businesses found:', businessResponse.data?.length || 0);
        
        if (!businessResponse.data || businessResponse.data.length === 0) {
          console.log('[Facebook SDK] No businesses found, trying ad accounts fallback...');
          fetchPixelsFromAdAccounts(FB, accessToken);
          return;
        }
        
        const allPixels: FacebookPixel[] = [];
        let businessesProcessed = 0;
        
        // Step 3: For each business, get owned_pixels
        businessResponse.data.forEach((business: any) => {
          console.log(`[Facebook SDK] Step 3: Fetching pixels for business: ${business.name} (${business.id})`);
          
          FB.api(`/${business.id}/owned_pixels`, 'GET', { fields: 'id,name' }, function(pixelResponse: any) {
            businessesProcessed++;
            
            if (pixelResponse.error) {
              console.error(`[Facebook SDK] Error fetching pixels for business ${business.id}:`, pixelResponse.error);
            } else if (pixelResponse.data) {
              console.log(`[Facebook SDK] Found ${pixelResponse.data.length} pixels in ${business.name}`);
              
              pixelResponse.data.forEach((pixel: any) => {
                allPixels.push({
                  id: pixel.id,
                  name: pixel.name,
                  accountName: business.name
                });
              });
            }
            
            // When all businesses are processed, update state
            if (businessesProcessed === businessResponse.data.length) {
              console.log(`[Facebook SDK] Total pixels found: ${allPixels.length}`);
              console.log('[Facebook SDK] Pixels:', allPixels);
              
              if (allPixels.length > 0) {
                setFacebookPixels(allPixels);
                localStorage.setItem("facebook_pixels", JSON.stringify(allPixels));
                onConnectionChange(true, userData, allPixels, accessToken);
              } else {
                // Fallback to ad accounts if no pixels found via businesses
                fetchPixelsFromAdAccounts(FB, accessToken);
              }
            }
          });
        });
      });
    });
  }, [onConnectionChange]);

  // Fallback: Fetch pixels from ad accounts
  const fetchPixelsFromAdAccounts = useCallback((FB: any, accessToken: string) => {
    console.log('[Facebook SDK] Fallback: Fetching from ad accounts (/me/adaccounts)...');
    
    FB.api('/me/adaccounts', 'GET', { fields: 'id,name' }, function(adAccountsResponse: any) {
      if (adAccountsResponse.error) {
        console.error('[Facebook SDK] Error fetching ad accounts:', adAccountsResponse.error);
        return;
      }
      
      console.log('[Facebook SDK] Ad accounts found:', adAccountsResponse.data?.length || 0);
      
      if (!adAccountsResponse.data || adAccountsResponse.data.length === 0) {
        console.log('[Facebook SDK] No ad accounts found');
        return;
      }
      
      const allPixels: FacebookPixel[] = [];
      let accountsProcessed = 0;
      
      adAccountsResponse.data.forEach((account: any) => {
        console.log(`[Facebook SDK] Fetching pixels for ad account: ${account.name} (${account.id})`);
        
        FB.api(`/${account.id}/adspixels`, 'GET', { fields: 'id,name' }, function(pixelResponse: any) {
          accountsProcessed++;
          
          if (pixelResponse.error) {
            console.error(`[Facebook SDK] Error fetching pixels for account ${account.id}:`, pixelResponse.error);
          } else if (pixelResponse.data) {
            console.log(`[Facebook SDK] Found ${pixelResponse.data.length} pixels in ${account.name}`);
            
            pixelResponse.data.forEach((pixel: any) => {
              allPixels.push({
                id: pixel.id,
                name: pixel.name,
                accountName: account.name
              });
            });
          }
          
          // When all accounts are processed, update state
          if (accountsProcessed === adAccountsResponse.data.length) {
            console.log(`[Facebook SDK] Total pixels found (via ad accounts): ${allPixels.length}`);
            console.log('[Facebook SDK] Pixels:', allPixels);
            
            if (allPixels.length > 0) {
              setFacebookPixels(allPixels);
              localStorage.setItem("facebook_pixels", JSON.stringify(allPixels));
              onConnectionChange(true, facebookUser, allPixels, accessToken);
            }
          }
        });
      });
    });
  }, [onConnectionChange, facebookUser]);

  // Initialize Facebook SDK and check login status
  useEffect(() => {
    if (!mounted) return;

    // Load Facebook SDK
    const loadFacebookSDK = () => {
      // Define fbAsyncInit before loading SDK
      (window as any).fbAsyncInit = function() {
        (window as any).FB.init({
          appId: '881927951248648',
          cookie: true,
          xfbml: true,
          version: 'v24.0'
        });

        // Check login status after SDK is initialized
        (window as any).FB.getLoginStatus(function(response: any) {
          console.log('[Facebook SDK] Login status:', response.status);
          if (response.status === 'connected') {
            console.log('[Facebook SDK] User is CONNECTED');
            console.log('[Facebook SDK] User ID:', response.authResponse.userID);
            console.log('[Facebook SDK] Access Token:', response.authResponse.accessToken ? 'Present' : 'Missing');
            
            // User is logged in and has authorized the app
            const accessToken = response.authResponse.accessToken;
            setFacebookAccessToken(accessToken);
            setIsConnectedToFacebook(true);
            localStorage.setItem("facebook_access_token", accessToken);
            
            // Save token to database so other pages (Catalog) can use it
            fetcher.submit(
              { intent: "save-facebook-token", accessToken },
              { method: "POST" }
            );
            
            // Fetch pixels using 3-step approach
            fetchPixelsWithSDK(accessToken);
            
          } else if (response.status === 'not_authorized') {
            console.log('[Facebook SDK] User is NOT AUTHORIZED - logged into Facebook but not the app');
          } else {
            console.log('[Facebook SDK] User is NOT CONNECTED to Facebook');
          }
        });
      };

      // Load the SDK asynchronously
      if (!document.getElementById('facebook-jssdk')) {
        const js = document.createElement('script');
        js.id = 'facebook-jssdk';
        js.src = 'https://connect.facebook.net/en_US/sdk.js';
        js.async = true;
        js.defer = true;
        const fjs = document.getElementsByTagName('script')[0];
        fjs.parentNode?.insertBefore(js, fjs);
      } else if ((window as any).FB) {
        // SDK already loaded, just check status
        (window as any).FB.getLoginStatus(function(response: any) {
          console.log('[Facebook SDK] Login status (cached):', response.status);
        });
      }
    };

    loadFacebookSDK();
  }, [mounted, fetchPixelsWithSDK, fetcher]);

  // Load Facebook connection state from localStorage (only after mount)
  useEffect(() => {
    if (!mounted) return;
    
    console.log('[FacebookIntegration] Checking localStorage for saved Facebook connection...');
    const savedToken = localStorage.getItem("facebook_access_token");
    const savedUser = localStorage.getItem("facebook_user");
    const savedPixels = localStorage.getItem("facebook_pixels");
    
    console.log('[FacebookIntegration] Saved token exists:', !!savedToken);
    console.log('[FacebookIntegration] Saved user exists:', !!savedUser);
    
    if (savedToken) {
      console.log('[FacebookIntegration] ✅ Found saved Facebook token, restoring connection...');
      setFacebookAccessToken(savedToken);
      setIsConnectedToFacebook(true);
      
      if (savedUser) {
        try {
          const user = JSON.parse(savedUser);
          setFacebookUser(user);
        } catch (err) {
          console.error('[FacebookIntegration] Error parsing saved user:', err);
        }
      }
      
      if (savedPixels) {
        try {
          const pixels = JSON.parse(savedPixels);
          setFacebookPixels(pixels);
          onConnectionChange(true, facebookUser, pixels, savedToken);
        } catch (err) {
          console.error('[FacebookIntegration] Error parsing saved pixels:', err);
        }
      } else {
        // Auto-fetch pixels if we have token but no cached pixels
        console.log('[FacebookIntegration] No saved pixels, fetching from API...');
        fetcher.submit(
          {
            intent: "fetch-facebook-pixels",
            accessToken: savedToken,
          },
          { method: "POST" }
        );
      }
    } else {
      console.log('[FacebookIntegration] No saved Facebook token found');
      onConnectionChange(false, null, [], "");
    }
  }, [mounted, fetcher, onConnectionChange, facebookUser]);

  // Handle fetcher response
  useEffect(() => {
    if (fetcher.data?.facebookPixels) {
      setFacebookPixels(fetcher.data.facebookPixels);
      setIsConnectedToFacebook(true);
      
      // Save pixels to localStorage
      if (typeof window !== "undefined") {
        localStorage.setItem("facebook_pixels", JSON.stringify(fetcher.data.facebookPixels));
      }
      
      onConnectionChange(true, facebookUser, fetcher.data.facebookPixels, facebookAccessToken);
    }
    
    if (fetcher.data?.facebookUser) {
      setFacebookUser(fetcher.data.facebookUser);
      
      // Save user to localStorage
      if (typeof window !== "undefined") {
        localStorage.setItem("facebook_user", JSON.stringify(fetcher.data.facebookUser));
      }
    }
  }, [fetcher.data, onConnectionChange, facebookUser, facebookAccessToken]);

  const handleConnectToFacebook = useCallback(() => {
    const scope = "ads_read,business_management,ads_management,pages_show_list,pages_read_engagement,catalog_management";
    
    // Check if Facebook SDK is loaded
    if ((window as any).FB) {
      console.log('[FacebookIntegration] Using Facebook SDK for login...');
      
      (window as any).FB.login(function(response: any) {
        console.log('[FacebookIntegration] FB.login response:', response.status);
        
        if (response.status === 'connected') {
          console.log('[FacebookIntegration] Facebook user CONNECTED via SDK!');
          const accessToken = response.authResponse.accessToken;
          
          setFacebookAccessToken(accessToken);
          setIsConnectedToFacebook(true);
          localStorage.setItem("facebook_access_token", accessToken);
          
          // Save token to database so other pages (Catalog) can use it
          fetcher.submit(
            { intent: "save-facebook-token", accessToken },
            { method: "POST" }
          );
          
          // Fetch pixels using 3-step approach (user -> businesses -> owned_pixels)
          fetchPixelsWithSDK(accessToken);
          
        } else if (response.status === 'not_authorized') {
          console.log('[FacebookIntegration] Facebook user NOT AUTHORIZED');
          setFacebookError('You need to authorize the app to access your Facebook data.');
          onError('You need to authorize the app to access your Facebook data.');
        } else {
          console.log('[FacebookIntegration] Facebook user NOT CONNECTED');
          setFacebookError('Facebook login was cancelled or failed.');
          onError('Facebook login was cancelled or failed.');
        }
      }, { scope: scope });
      
    } else {
      // Fallback to OAuth popup if SDK not loaded
      console.log('[FacebookIntegration] Facebook SDK not loaded, using OAuth popup...');
      
      const facebookAppId = "881927951248648";
      const redirectUri = encodeURIComponent(`${window.location.origin}/auth/facebook/callback`);
      
      const oauthUrl = `https://www.facebook.com/v24.0/dialog/oauth?client_id=${facebookAppId}&redirect_uri=${redirectUri}&scope=${scope}&response_type=code&state=${Date.now()}`;
      
      const popup = window.open(
        oauthUrl,
        'facebook-oauth',
        'width=600,height=600,scrollbars=yes,resizable=yes'
      );

      // Listen for messages from the popup
      const handleMessage = (event: MessageEvent) => {
        if (event.origin !== window.location.origin) return;

        if (event.data.type === 'FACEBOOK_AUTH_SUCCESS') {
          console.log('[FacebookIntegration] Facebook user CONNECTED!');
          console.log('[FacebookIntegration] User:', event.data.user?.name || 'Unknown');
          console.log('[FacebookIntegration] Access Token:', event.data.accessToken ? 'Received' : 'Missing');
          console.log('[FacebookIntegration] Pixels:', event.data.pixels?.length || 0);
          
          setFacebookAccessToken(event.data.accessToken);
          
          // Set user profile if available
          if (event.data.user) {
            setFacebookUser(event.data.user);
            localStorage.setItem("facebook_user", JSON.stringify(event.data.user));
          }
          
          // Set pixels if they were fetched
          if (event.data.pixels && event.data.pixels.length > 0) {
            setFacebookPixels(event.data.pixels);
            localStorage.setItem("facebook_pixels", JSON.stringify(event.data.pixels));
            onConnectionChange(true, event.data.user, event.data.pixels, event.data.accessToken);
          }
          
          setIsConnectedToFacebook(true);
          localStorage.setItem("facebook_access_token", event.data.accessToken);
          
          // Show warning if any
          if (event.data.warning) {
            setFacebookError(event.data.warning);
            onError(event.data.warning);
          }
          
          window.removeEventListener('message', handleMessage);
          
          // If no pixels were fetched automatically, try to fetch them
          if (!event.data.pixels || event.data.pixels.length === 0) {
            fetcher.submit(
              {
                intent: "fetch-facebook-pixels",
                accessToken: event.data.accessToken,
              },
              { method: "POST" }
            );
          }
        } else if (event.data.type === 'FACEBOOK_AUTH_ERROR') {
          console.log('[FacebookIntegration] Facebook user NOT connected - error:', event.data.error);
          setFacebookError(event.data.error);
          onError(event.data.error);
          window.removeEventListener('message', handleMessage);
        }
      };

      window.addEventListener('message', handleMessage);

      // Clean up if popup is closed manually
      const checkClosed = setInterval(() => {
        if (popup?.closed) {
          window.removeEventListener('message', handleMessage);
          clearInterval(checkClosed);
        }
      }, 1000);
    }
  }, [fetcher, fetchPixelsWithSDK, onError, onConnectionChange]);

  // Refresh Facebook token and pixels
  const handleRefreshFacebookData = useCallback(async () => {
    if (!facebookAccessToken) return;
    
    setIsRefreshingToken(true);
    try {
      // Validate current token and refresh pixels
      fetcher.submit(
        {
          intent: "fetch-facebook-pixels",
          accessToken: facebookAccessToken,
        },
        { method: "POST" }
      );
    } catch (error) {
      console.error("Failed to refresh Facebook data:", error);
      setFacebookError("Failed to refresh Facebook data. Please reconnect.");
      onError("Failed to refresh Facebook data. Please reconnect.");
    } finally {
      setIsRefreshingToken(false);
    }
  }, [facebookAccessToken, fetcher, onError]);

  // Disconnect from Facebook
  const handleDisconnectFacebook = useCallback(() => {
    setFacebookAccessToken("");
    setFacebookUser(null);
    setFacebookPixels([]);
    setIsConnectedToFacebook(false);
    setFacebookError("");
    
    // Clear localStorage
    if (typeof window !== "undefined") {
      localStorage.removeItem("facebook_access_token");
      localStorage.removeItem("facebook_user");
      localStorage.removeItem("facebook_pixels");
    }
    
    onConnectionChange(false, null, [], "");
  }, [onConnectionChange]);

  // Mark component as mounted to prevent hydration mismatch
  useEffect(() => {
    setMounted(true);
  }, []);

  return (
    <ClientOnly>
      {mounted && isConnectedToFacebook ? (
        <Card background="bg-surface-success">
          <InlineStack align="space-between" blockAlign="center">
            <InlineStack gap="300" blockAlign="center">
              {facebookUser?.picture ? (
                <img 
                  src={facebookUser.picture} 
                  alt={facebookUser.name}
                  style={{
                    width: "48px",
                    height: "48px",
                    borderRadius: "50%",
                    objectFit: "cover",
                    border: "3px solid #1877f2"
                  }}
                />
              ) : (
                <div style={{
                  width: "48px",
                  height: "48px",
                  borderRadius: "50%",
                  backgroundColor: "#1877f2",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  color: "white",
                  fontWeight: "bold",
                  fontSize: "20px"
                }}>
                  {facebookUser?.name?.charAt(0)?.toUpperCase() || "F"}
                </div>
              )}
              <BlockStack gap="100">
                <InlineStack gap="200" blockAlign="center">
                  <Text variant="headingMd" as="h3">Facebook Connected</Text>
                  <Text as="p" variant="bodySm" tone="success">Active</Text>
                </InlineStack>
                <Text variant="bodySm" tone="subdued" as="p">
                  Logged in as {facebookUser?.name || "Facebook User"} • {facebookPixels.length} pixel(s) available
                </Text>
              </BlockStack>
            </InlineStack>
            <InlineStack gap="200">
              <Button onClick={handleRefreshFacebookData} loading={isRefreshingToken}>
                Refresh
              </Button>
              <Button variant="plain" tone="critical" onClick={handleDisconnectFacebook}>
                Disconnect
              </Button>
            </InlineStack>
          </InlineStack>
        </Card>
      ) : (
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
            <Button 
              variant="primary" 
              onClick={handleConnectToFacebook}
            >
              Connect to Facebook
            </Button>
            {facebookError && (
              <Banner tone="critical" onDismiss={() => setFacebookError("")}>
                <p>{facebookError}</p>
              </Banner>
            )}
          </BlockStack>
        </Card>
      )}
    </ClientOnly>
  );
}
