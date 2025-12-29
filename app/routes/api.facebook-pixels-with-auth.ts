// Enhanced API endpoint to fetch Facebook pixels with OAuth integration
import type { ActionFunctionArgs } from "react-router";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type",
  "X-Content-Type-Options": "nosniff",
};

export async function action({ request }: ActionFunctionArgs) {
  // Handle OPTIONS preflight
  if (request.method === "OPTIONS") {
    return new Response(null, { status: 204, headers: corsHeaders });
  }

  if (request.method !== "POST") {
    return Response.json(
      { error: "Method not allowed" },
      { status: 405, headers: corsHeaders }
    );
  }

  try {
    const { accessToken } = await request.json();

    console.log("[Facebook Pixels Enhanced API] Request received with token:", accessToken ? `${accessToken.substring(0, 20)}...` : "none");

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

    // Step 1: Validate the token by getting user info
    debugInfo.steps.push("1. Validating access token");
    const userResponse = await fetch(
      `https://graph.facebook.com/v24.0/me?fields=id,name,email&access_token=${accessToken}`
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

    // Step 2: Check token permissions
    debugInfo.steps.push("2. Checking token permissions");
    const permissionsResponse = await fetch(
      `https://graph.facebook.com/v24.0/me/permissions?access_token=${accessToken}`
    );

    if (permissionsResponse.ok) {
      const permissionsData = await permissionsResponse.json();
      const grantedPermissions = permissionsData.data
        ?.filter((p: any) => p.status === 'granted')
        ?.map((p: any) => p.permission) || [];
      
      debugInfo.steps.push(`2. ✅ Granted permissions: ${grantedPermissions.join(', ')}`);
      
      const requiredPermissions = ['ads_read', 'business_management'];
      const missingPermissions = requiredPermissions.filter(p => !grantedPermissions.includes(p));
      
      if (missingPermissions.length > 0) {
        debugInfo.errors.push(`Missing required permissions: ${missingPermissions.join(', ')}`);
        return Response.json({
          error: `Missing required permissions: ${missingPermissions.join(', ')}`,
          debug: debugInfo,
          suggestion: "Please re-authenticate with ads_read and business_management permissions"
        }, { status: 403, headers: corsHeaders });
      }
    } else {
      debugInfo.steps.push("2. ⚠️ Could not check permissions");
    }

    // Step 3: Fetch ad accounts with detailed info
    debugInfo.steps.push("3. Fetching ad accounts");
    const adAccountsResponse = await fetch(
      `https://graph.facebook.com/v24.0/me/adaccounts?fields=id,name,account_status,business,currency,timezone_name&access_token=${accessToken}`
    );

    if (!adAccountsResponse.ok) {
      const adAccountError = await adAccountsResponse.json();
      debugInfo.errors.push(`Ad accounts fetch failed: ${adAccountError.error?.message || 'Unknown error'}`);
      return Response.json({
        error: "Failed to fetch ad accounts",
        debug: debugInfo
      }, { status: 400, headers: corsHeaders });
    }

    const adAccountsData = await adAccountsResponse.json();

    if (adAccountsData.error) {
      debugInfo.errors.push(`Ad accounts error: ${adAccountsData.error.message}`);
      return Response.json({
        error: adAccountsData.error.message,
        debug: debugInfo
      }, { status: 400, headers: corsHeaders });
    }

    debugInfo.adAccounts = adAccountsData.data || [];
    debugInfo.steps.push(`3. ✅ Found ${debugInfo.adAccounts.length} ad account(s)`);

    // Log each ad account details
    debugInfo.adAccounts.forEach(account => {
      debugInfo.steps.push(`   - ${account.name} (${account.id}) - Status: ${account.account_status}, Currency: ${account.currency}`);
    });

    if (debugInfo.adAccounts.length === 0) {
      debugInfo.errors.push("No ad accounts found. You may need business manager access or ad account permissions.");
      return Response.json({
        error: "No ad accounts found",
        debug: debugInfo,
        suggestions: [
          "Make sure you have access to at least one Facebook Ad Account",
          "Check if you're added as an admin/advertiser to any ad accounts",
          "Verify your Facebook app has business_management permission",
          "Try connecting through Facebook Business Manager"
        ]
      }, { headers: corsHeaders });
    }

    const pixels = [];

    // Step 4: For each ad account, try multiple methods to fetch pixels
    debugInfo.steps.push("4. Fetching pixels from each ad account");
    
    for (const account of debugInfo.adAccounts) {
      const accountInfo = {
        id: account.id,
        name: account.name,
        status: account.account_status,
        business: account.business,
        pixelCount: 0,
        errors: [] as string[],
        attempts: [] as string[],
      };

      debugInfo.steps.push(`4.${account.id}: Processing account "${account.name}" (Status: ${account.account_status})`);
      
      // Skip inactive accounts
      if (account.account_status !== 1) {
        accountInfo.errors.push(`Account is not active (status: ${account.account_status})`);
        debugInfo.steps.push(`4.${account.id}: ⚠️ Skipping inactive account`);
        debugInfo.pixelAttempts.push(accountInfo);
        continue;
      }

      // Try multiple endpoints and methods
      const pixelEndpoints = [
        {
          url: `https://graph.facebook.com/v24.0/${account.id}/adspixels?fields=id,name,creation_time,last_fired_time,code&access_token=${accessToken}`,
          name: 'adspixels (primary)',
          type: 'adspixels'
        },
        {
          url: `https://graph.facebook.com/v24.0/${account.id}/pixels?fields=id,name&access_token=${accessToken}`,
          name: 'pixels (legacy)',
          type: 'pixels'
        },
        // Try business-level pixels if account has business
        ...(account.business ? [{
          url: `https://graph.facebook.com/v24.0/${account.business.id}/adspixels?fields=id,name,creation_time,last_fired_time&access_token=${accessToken}`,
          name: 'business adspixels',
          type: 'business_adspixels'
        }] : [])
      ];

      let accountPixelsFound = false;

      for (const endpoint of pixelEndpoints) {
        try {
          accountInfo.attempts.push(`Trying ${endpoint.name}`);
          debugInfo.steps.push(`4.${account.id}: Trying ${endpoint.name}`);
          
          const pixelsResponse = await fetch(endpoint.url);
          const pixelsData = await pixelsResponse.json();

          if (pixelsResponse.ok) {
            if (pixelsData.data && pixelsData.data.length > 0) {
              accountInfo.pixelCount += pixelsData.data.length;
              debugInfo.steps.push(`4.${account.id}: ✅ Found ${pixelsData.data.length} pixel(s) via ${endpoint.name}`);
              
              pixels.push(...pixelsData.data.map((pixel: any) => ({
                id: pixel.id,
                name: pixel.name,
                adAccountId: account.id,
                adAccountName: account.name,
                creationTime: pixel.creation_time,
                lastFiredTime: pixel.last_fired_time,
                code: pixel.code,
                source: endpoint.type,
                business: account.business,
              })));
              
              accountPixelsFound = true;
            } else {
              debugInfo.steps.push(`4.${account.id}: ⚠️ ${endpoint.name} returned empty data`);
              accountInfo.attempts.push(`${endpoint.name}: No data`);
            }
          } else {
            const errorMsg = pixelsData.error?.message || 'Unknown error';
            debugInfo.steps.push(`4.${account.id}: ❌ ${endpoint.name} error: ${errorMsg}`);
            accountInfo.errors.push(`${endpoint.name}: ${errorMsg}`);
          }
        } catch (endpointError) {
          const errorMsg = String(endpointError);
          debugInfo.steps.push(`4.${account.id}: ❌ ${endpoint.name} network error: ${errorMsg}`);
          accountInfo.errors.push(`${endpoint.name}: ${errorMsg}`);
        }
      }

      if (!accountPixelsFound) {
        debugInfo.steps.push(`4.${account.id}: ⚠️ No pixels found in this account`);
      }

      debugInfo.pixelAttempts.push(accountInfo);
    }

    debugInfo.steps.push(`5. ✅ Total pixels found: ${pixels.length}`);

    // Prepare comprehensive response
    const response = {
      pixels,
      adAccounts: debugInfo.adAccounts,
      user: userData,
      debug: debugInfo,
      summary: {
        totalAdAccounts: debugInfo.adAccounts.length,
        activeAdAccounts: debugInfo.adAccounts.filter(a => a.account_status === 1).length,
        totalPixels: pixels.length,
        user: userData.name,
        timestamp: debugInfo.timestamp,
      },
      suggestions: pixels.length === 0 ? [
        "Create a pixel in Facebook Events Manager (https://business.facebook.com/events_manager)",
        "Make sure your ad accounts are active and you have proper access",
        "Verify your access token has 'ads_read' and 'business_management' permissions",
        "Check if pixels are associated with your ad accounts",
        "Try using Facebook Business Manager to manage pixel access"
      ] : undefined,
      troubleshooting: {
        commonIssues: [
          "No pixels created yet - Create one in Facebook Events Manager",
          "Insufficient permissions - Need ads_read and business_management",
          "No ad account access - Must be admin/advertiser on ad accounts",
          "Inactive ad accounts - Only active accounts (status=1) are checked"
        ],
        nextSteps: pixels.length === 0 ? [
          "1. Go to https://business.facebook.com/events_manager",
          "2. Click 'Create' and select 'Facebook Pixel'",
          "3. Name your pixel and add your website URL",
          "4. Come back and try fetching pixels again"
        ] : [
          "Pixels found successfully! You can now use them for tracking."
        ]
      }
    };

    return Response.json(response, { headers: corsHeaders });

  } catch (error) {
    console.error("[API Facebook Pixels Enhanced] Unexpected error:", error);
    
    return Response.json({
      error: "Failed to fetch pixels",
      originalError: String(error),
      timestamp: new Date().toISOString()
    }, { status: 500, headers: corsHeaders });
  }
}

export default function FacebookPixelsWithAuthRoute() {
  return null;
}
