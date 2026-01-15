 // Get user ID, then ad accounts, then pixels - the correct flow
import type { ActionFunctionArgs } from "react-router";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type",
  "X-Content-Type-Options": "nosniff",
};

export async function action({ request }: ActionFunctionArgs) {
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

    if (!accessToken) {
      return Response.json(
        { error: "Missing access token" },
        { status: 400, headers: corsHeaders }
      );
    }

    console.log(`[User to Pixels] Starting flow with token: ${accessToken.substring(0, 20)}...`);

    const flow = {
      steps: [] as any[],
      user: null as any,
      adAccounts: [] as any[],
      pixels: [] as any[],
      errors: [] as string[],
    };

    // Step 1: Get user info
    try {
      console.log("[User to Pixels] Step 1: Getting user info");
      const userResponse = await fetch(
        `https://graph.facebook.com/v24.0/me?fields=id,name,email&access_token=${accessToken}`
      );
      
      const userData = await userResponse.json();
      
      flow.steps.push({
        step: 1,
        name: "Get User Info",
        status: userResponse.status,
        success: userResponse.ok && !userData.error,
        data: userData
      });

      if (!userResponse.ok || userData.error) {
        flow.errors.push(`User info failed: ${userData.error?.message || 'Unknown error'}`);
        return Response.json({ flow, error: "Failed to get user info" }, { headers: corsHeaders });
      }

      flow.user = userData;
      console.log(`[User to Pixels] User: ${userData.name} (${userData.id})`);

    } catch (error) {
      flow.errors.push(`User info network error: ${error}`);
      return Response.json({ flow, error: "Network error getting user info" }, { headers: corsHeaders });
    }

    // Step 2: Get ad accounts for this user
    try {
      console.log("[User to Pixels] Step 2: Getting ad accounts");
      const adAccountsResponse = await fetch(
        `https://graph.facebook.com/v24.0/${flow.user.id}/adaccounts?fields=id,name,account_status&access_token=${accessToken}`
      );
      
      const adAccountsData = await adAccountsResponse.json();
      
      flow.steps.push({
        step: 2,
        name: "Get Ad Accounts",
        url: `https://graph.facebook.com/v24.0/${flow.user.id}/adaccounts`,
        status: adAccountsResponse.status,
        success: adAccountsResponse.ok && !adAccountsData.error,
        data: adAccountsData,
        accountCount: adAccountsData.data?.length || 0
      });

      if (!adAccountsResponse.ok || adAccountsData.error) {
        flow.errors.push(`Ad accounts failed: ${adAccountsData.error?.message || 'Unknown error'}`);
        
        // Try alternative endpoint
        console.log("[User to Pixels] Trying alternative: me/adaccounts");
        const altResponse = await fetch(
          `https://graph.facebook.com/v24.0/me/adaccounts?fields=id,name,account_status&access_token=${accessToken}`
        );
        const altData = await altResponse.json();
        
        flow.steps.push({
          step: "2b",
          name: "Get Ad Accounts (Alternative)",
          url: "https://graph.facebook.com/v24.0/me/adaccounts",
          status: altResponse.status,
          success: altResponse.ok && !altData.error,
          data: altData,
          accountCount: altData.data?.length || 0
        });

        if (altResponse.ok && !altData.error) {
          flow.adAccounts = altData.data || [];
        } else {
          return Response.json({ 
            flow, 
            error: "Failed to get ad accounts from both endpoints",
            suggestion: "You may not have access to any ad accounts, or need different permissions"
          }, { headers: corsHeaders });
        }
      } else {
        flow.adAccounts = adAccountsData.data || [];
      }

      console.log(`[User to Pixels] Found ${flow.adAccounts.length} ad accounts`);

    } catch (error) {
      flow.errors.push(`Ad accounts network error: ${error}`);
      return Response.json({ flow, error: "Network error getting ad accounts" }, { headers: corsHeaders });
    }

    // Step 3: Get pixels from each ad account
    if (flow.adAccounts.length === 0) {
      flow.errors.push("No ad accounts found - cannot fetch pixels");
      return Response.json({ 
        flow, 
        error: "No ad accounts found",
        suggestion: "Create an ad account in Facebook Ads Manager or get added to an existing one"
      }, { headers: corsHeaders });
    }

    console.log("[User to Pixels] Step 3: Getting pixels from ad accounts");
    
    for (const account of flow.adAccounts) {
      try {
        console.log(`[User to Pixels] Fetching pixels for account: ${account.name} (${account.id})`);
        
        // Use the correct format: account.id already includes 'act_' prefix
        const pixelsResponse = await fetch(
          `https://graph.facebook.com/v24.0/${account.id}/adspixels?fields=id,name,creation_time,last_fired_time&access_token=${accessToken}`
        );
        
        const pixelsData = await pixelsResponse.json();
        
        flow.steps.push({
          step: 3,
          name: `Get Pixels from ${account.name}`,
          url: `https://graph.facebook.com/v24.0/${account.id}/adspixels`,
          status: pixelsResponse.status,
          success: pixelsResponse.ok && !pixelsData.error,
          data: pixelsData,
          pixelCount: pixelsData.data?.length || 0,
          accountId: account.id,
          accountName: account.name
        });

        if (pixelsResponse.ok && !pixelsData.error && pixelsData.data) {
          const accountPixels = pixelsData.data.map((pixel: any) => ({
            id: pixel.id,
            name: pixel.name,
            adAccountId: account.id,
            adAccountName: account.name,
            creationTime: pixel.creation_time,
            lastFiredTime: pixel.last_fired_time,
          }));
          
          flow.pixels.push(...accountPixels);
          console.log(`[User to Pixels] Found ${accountPixels.length} pixels in ${account.name}`);
        } else {
          flow.errors.push(`Pixels from ${account.name}: ${pixelsData.error?.message || 'No pixels found'}`);
          console.log(`[User to Pixels] No pixels in ${account.name}: ${pixelsData.error?.message || 'No data'}`);
        }

      } catch (error) {
        flow.errors.push(`Pixels from ${account.name}: Network error - ${error}`);
        console.error(`[User to Pixels] Error fetching pixels from ${account.name}:`, error);
      }
    }

    console.log(`[User to Pixels] Total pixels found: ${flow.pixels.length}`);

    // Final result
    const result = {
      success: flow.pixels.length > 0,
      flow,
      summary: {
        userId: flow.user?.id,
        userName: flow.user?.name,
        adAccountsFound: flow.adAccounts.length,
        pixelsFound: flow.pixels.length,
        errorsCount: flow.errors.length,
      },
      pixels: flow.pixels,
      message: flow.pixels.length > 0 
        ? `Successfully found ${flow.pixels.length} pixel(s) from ${flow.adAccounts.length} ad account(s)`
        : "No pixels found - you may need to create pixels in Facebook Events Manager"
    };

    return Response.json(result, { headers: corsHeaders });

  } catch (error) {
    console.error("[User to Pixels] Unexpected error:", error);
    return Response.json({
      error: "Unexpected error during pixel fetch",
      details: String(error),
      timestamp: new Date().toISOString()
    }, { status: 500, headers: corsHeaders });
  }
}

export default function FacebookUserToPixels() {
  return null;
}
