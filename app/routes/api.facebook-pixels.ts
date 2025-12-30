// API endpoint to fetch Facebook pixels using access token
import type { LoaderFunctionArgs, ActionFunctionArgs } from "react-router";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type",
  "X-Content-Type-Options": "nosniff",
};

// Handle OPTIONS preflight requests for CORS
export async function action({ request }: ActionFunctionArgs) {
  if (request.method === "OPTIONS") {
    return new Response(null, { status: 204, headers: corsHeaders });
  }
  return new Response("Method not allowed", { status: 405, headers: corsHeaders });
}

export async function loader({ request }: LoaderFunctionArgs) {

  const url = new URL(request.url);
  const accessToken = url.searchParams.get("accessToken");

  console.log("[Facebook Pixels API] Request received with token:", accessToken ? `${accessToken.substring(0, 20)}...` : "none");

  if (!accessToken) {
    return Response.json(
      { error: "Missing access token" },
      { status: 400, headers: corsHeaders }
    );
  }

  const debugInfo = {
    tokenLength: accessToken.length,
    timestamp: new Date().toISOString(),
    steps: [] as string[],
    errors: [] as string[],
    adAccounts: [] as any[],
    pixelAttempts: [] as any[],
  };

  try {
    // Step 1: Validate token by getting user info
    debugInfo.steps.push("1. Validating access token");
    const userResponse = await fetch(
      `https://graph.facebook.com/v24.0/me?fields=id,name&access_token=${accessToken}`
    );
    
    if (!userResponse.ok) {
      const userError = await userResponse.json();
      debugInfo.errors.push(`Token validation failed: ${userError.error?.message || 'Unknown error'}`);
      return Response.json({
        error: "Invalid access token",
        debug: debugInfo
      }, { status: 401, headers: corsHeaders });
    }

    const userData = await userResponse.json();
    if (userData.error) {
      debugInfo.errors.push(`User data error: ${userData.error.message}`);
      return Response.json({
        error: userData.error.message,
        debug: debugInfo
      }, { status: 400, headers: corsHeaders });
    }

    debugInfo.steps.push(`1. ✅ Token valid for user: ${userData.name} (${userData.id})`);

    // Step 2: Fetch businesses first
    debugInfo.steps.push("2. Fetching businesses");
    let businessesData;
    try {
      const businessesResponse = await fetch(
        `https://graph.facebook.com/v24.0/${userData.id}/businesses?access_token=${accessToken}`
      );
      businessesData = await businessesResponse.json();
      if (businessesResponse.ok && !businessesData.error) {
        debugInfo.steps.push(`2. ✅ Found ${businessesData.data?.length || 0} business(es)`);
      } else {
        debugInfo.steps.push(`2. ⚠️ Failed to fetch businesses: ${businessesData.error?.message || 'Unknown error'}`);
      }
    } catch (error) {
      debugInfo.steps.push(`2. ⚠️ Business fetch error: ${error}`);
    }

    const pixels = [];

    // Step 3: Fetch pixels from businesses
    if (businessesData?.data && businessesData.data.length > 0) {
      debugInfo.steps.push("3. Fetching pixels from businesses");
      for (const business of businessesData.data) {
        try {
          const pixelsResponse = await fetch(
            `https://graph.facebook.com/v24.0/${business.id}/adspixels?fields=id,name,creation_time,last_fired_time&access_token=${accessToken}`
          );
          const pixelsData = await pixelsResponse.json();
          if (pixelsResponse.ok && pixelsData.data) {
            pixels.push(...pixelsData.data.map((pixel: any) => ({
              id: pixel.id,
              name: pixel.name,
              adAccountId: business.id,
              adAccountName: business.name,
              creationTime: pixel.creation_time,
              lastFiredTime: pixel.last_fired_time,
              source: 'business',
            })));
            debugInfo.steps.push(`3. ✅ Found ${pixelsData.data.length} pixel(s) in business "${business.name}"`);
          } else {
            debugInfo.steps.push(`3. ⚠️ No pixels in business "${business.name}": ${pixelsData.error?.message || 'Unknown error'}`);
          }
        } catch (error) {
          debugInfo.steps.push(`3. ❌ Error fetching pixels from business "${business.name}": ${error}`);
        }
      }
    }

    // Step 4: If no pixels from businesses, try ad accounts
    if (pixels.length === 0) {
      debugInfo.steps.push("4. No pixels from businesses, trying ad accounts");

      let adAccountsData;
      let adAccountsSuccess = false;

      // Try with user ID first (more reliable)
      try {
        const adAccountsResponse = await fetch(
          `https://graph.facebook.com/v24.0/${userData.id}/adaccounts?fields=id,name,account_status,business&access_token=${accessToken}`
        );

        adAccountsData = await adAccountsResponse.json();

        if (adAccountsResponse.ok && !adAccountsData.error) {
          adAccountsSuccess = true;
          debugInfo.steps.push(`4a. ✅ Fetched ad accounts using user ID: ${userData.id}`);
        } else {
          debugInfo.steps.push(`4a. ⚠️ User ID method failed: ${adAccountsData.error?.message || 'Unknown error'}`);
        }
      } catch (error) {
        debugInfo.steps.push(`4a. ⚠️ User ID method error: ${error}`);
      }

      // Fallback to 'me' endpoint if user ID failed
      if (!adAccountsSuccess) {
        debugInfo.steps.push("4b. Trying alternative endpoint: me/adaccounts");
        const adAccountsResponse = await fetch(
          `https://graph.facebook.com/v24.0/me/adaccounts?fields=id,name,account_status,business&access_token=${accessToken}`
        );

        if (!adAccountsResponse.ok) {
          const adAccountError = await adAccountsResponse.json();
          debugInfo.errors.push(`Ad accounts fetch failed: ${adAccountError.error?.message || 'Unknown error'}`);
          return Response.json({
            error: "Failed to fetch ad accounts",
            debug: debugInfo,
            suggestion: "You may not have access to any ad accounts. Create one in Facebook Ads Manager or get added to an existing account."
          }, { status: 400, headers: corsHeaders });
        }

        adAccountsData = await adAccountsResponse.json();

        if (adAccountsData.error) {
          debugInfo.errors.push(`Ad accounts error: ${adAccountsData.error.message}`);
          return Response.json({
            error: adAccountsData.error.message,
            debug: debugInfo
          }, { status: 400, headers: corsHeaders });
        }

        debugInfo.steps.push("4b. ✅ Fetched ad accounts using 'me' endpoint");
      }

      debugInfo.adAccounts = adAccountsData.data || [];
      debugInfo.steps.push(`4. ✅ Found ${debugInfo.adAccounts.length} ad account(s)`);

      if (debugInfo.adAccounts.length === 0) {
        debugInfo.errors.push("No ad accounts found. You may need business manager access or ad account permissions.");
        return Response.json({
          error: "No ad accounts found",
          debug: debugInfo,
          suggestion: "Make sure your Facebook app has business_management permission and you have access to ad accounts"
        }, { headers: corsHeaders });
      }

      // Step 5: For each ad account, fetch pixels
      debugInfo.steps.push("5. Fetching pixels from each ad account");

      for (const account of debugInfo.adAccounts) {
        const accountInfo = {
          id: account.id,
          name: account.name,
          status: account.account_status,
          business: account.business,
          pixelCount: 0,
          error: null as string | null,
        };

        try {
          debugInfo.steps.push(`5.${account.id}: Checking account "${account.name}" (status: ${account.account_status})`);

          // Try multiple endpoints to find pixels
          const endpoints = [
            // Primary endpoint - adspixels
            {
              url: `https://graph.facebook.com/v24.0/${account.id}/adspixels?fields=id,name,creation_time,last_fired_time&access_token=${accessToken}`,
              type: 'adspixels'
            },
            // Alternative endpoint - pixels (older API)
            {
              url: `https://graph.facebook.com/v24.0/${account.id}/pixels?fields=id,name&access_token=${accessToken}`,
              type: 'pixels'
            }
          ];

          let pixelsFound = false;

          for (const endpoint of endpoints) {
            try {
              const pixelsResponse = await fetch(endpoint.url);
              const pixelsData = await pixelsResponse.json();

              if (pixelsResponse.ok && pixelsData.data) {
                accountInfo.pixelCount = pixelsData.data.length;
                debugInfo.steps.push(`5.${account.id}: ✅ Found ${pixelsData.data.length} pixel(s) via ${endpoint.type}`);

                pixels.push(...pixelsData.data.map((pixel: any) => ({
                  id: pixel.id,
                  name: pixel.name,
                  adAccountId: account.id,
                  adAccountName: account.name,
                  creationTime: pixel.creation_time,
                  lastFiredTime: pixel.last_fired_time,
                  source: endpoint.type,
                })));

                pixelsFound = true;
                break; // Found pixels, no need to try other endpoints
              } else if (pixelsData.error) {
                debugInfo.steps.push(`5.${account.id}: ❌ ${endpoint.type} error: ${pixelsData.error.message}`);
                accountInfo.error = pixelsData.error.message;
              } else {
                debugInfo.steps.push(`5.${account.id}: ⚠️ ${endpoint.type} returned no data`);
              }
            } catch (endpointError) {
              debugInfo.steps.push(`5.${account.id}: ❌ ${endpoint.type} network error: ${endpointError}`);
            }
          }

          if (!pixelsFound) {
            debugInfo.steps.push(`5.${account.id}: ⚠️ No pixels found in this account`);
          }

        } catch (accountError) {
          accountInfo.error = String(accountError);
          debugInfo.errors.push(`Account ${account.name}: ${accountError}`);
          debugInfo.steps.push(`5.${account.id}: ❌ Account error: ${accountError}`);
        }

        debugInfo.pixelAttempts.push(accountInfo);
      }
    }

    debugInfo.steps.push(`6. ✅ Total pixels found: ${pixels.length}`);

    // Return comprehensive response
    return Response.json({
      pixels,
      debug: debugInfo,
      summary: {
        totalAdAccounts: debugInfo.adAccounts?.length || 0,
        totalPixels: pixels.length,
        user: userData.name,
        timestamp: debugInfo.timestamp,
      },
      suggestions: pixels.length === 0 ? [
        "Make sure you have pixels created in your Facebook Ads Manager",
        "Verify your access token has 'ads_read' and 'business_management' permissions",
        "Check if your ad accounts are active and you have proper access",
        "Try creating a test pixel in Facebook Events Manager first"
      ] : undefined
    }, { headers: corsHeaders });

  } catch (error) {
    debugInfo.errors.push(`Unexpected error: ${error}`);
    console.error("[API Facebook Pixels] Unexpected error:", error);
    
    return Response.json({
      error: "Failed to fetch pixels",
      debug: debugInfo,
      originalError: String(error)
    }, { status: 500, headers: corsHeaders });
  }
}

export default function FacebookPixelsRoute() {
  return null;
}
