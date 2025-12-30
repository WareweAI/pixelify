// Extract user ID from token and fetch pixels directly
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

  if (!accessToken) {
    return Response.json(
      { error: "Missing access token" },
      { status: 400, headers: corsHeaders }
    );
  }

  console.log(`[Pixels by Token] Processing token: ${accessToken.substring(0, 20)}...`);

  const flow = {
    steps: [] as any[],
    userId: null as string | null,
    userName: null as string | null,
    adAccounts: [] as any[],
    pixels: [] as any[],
    errors: [] as string[],
  };

  try {
    // Step 1: Extract user ID from token
    flow.steps.push("1. Extracting user ID from token");
    
    const userResponse = await fetch(
      `https://graph.facebook.com/v24.0/me?fields=id,name&access_token=${accessToken}`
    );
    
    const userData = await userResponse.json();
    
    if (!userResponse.ok || userData.error) {
      flow.errors.push(`Failed to extract user ID: ${userData.error?.message || 'Invalid token'}`);
      return Response.json({
        error: "Invalid access token",
        flow,
        suggestion: "Generate a new access token with proper permissions"
      }, { status: 401, headers: corsHeaders });
    }

    flow.userId = userData.id;
    flow.userName = userData.name;
    flow.steps.push(`1. ✅ Extracted user ID: ${userData.id} (${userData.name})`);
    console.log(`[Pixels by Token] User: ${userData.name} (${userData.id})`);

    // Step 2: Get ad accounts using the extracted user ID
    flow.steps.push(`2. Fetching ad accounts for user ${userData.id}`);
    
    const adAccountsResponse = await fetch(
      `https://graph.facebook.com/v24.0/${userData.id}/adaccounts?fields=id,name,account_status&access_token=${accessToken}`
    );
    
    const adAccountsData = await adAccountsResponse.json();
    
    if (!adAccountsResponse.ok || adAccountsData.error) {
      flow.errors.push(`Failed to fetch ad accounts: ${adAccountsData.error?.message || 'Unknown error'}`);
      
      // Try fallback method
      flow.steps.push("2b. Trying fallback method: me/adaccounts");
      const fallbackResponse = await fetch(
        `https://graph.facebook.com/v24.0/me/adaccounts?fields=id,name,account_status&access_token=${accessToken}`
      );
      const fallbackData = await fallbackResponse.json();
      
      if (fallbackResponse.ok && !fallbackData.error) {
        flow.adAccounts = fallbackData.data || [];
        flow.steps.push(`2b. ✅ Found ${flow.adAccounts.length} ad accounts via fallback`);
      } else {
        return Response.json({
          error: "Failed to fetch ad accounts",
          flow,
          suggestion: "You may not have access to any ad accounts. Create one in Facebook Ads Manager."
        }, { status: 400, headers: corsHeaders });
      }
    } else {
      flow.adAccounts = adAccountsData.data || [];
      flow.steps.push(`2. ✅ Found ${flow.adAccounts.length} ad accounts`);
    }

    console.log(`[Pixels by Token] Found ${flow.adAccounts.length} ad accounts`);

    if (flow.adAccounts.length === 0) {
      return Response.json({
        error: "No ad accounts found",
        flow,
        suggestion: "Create an ad account in Facebook Ads Manager or get added to an existing one"
      }, { headers: corsHeaders });
    }

    // Step 3: Fetch pixels from each ad account
    flow.steps.push("3. Fetching pixels from ad accounts");
    
    for (const account of flow.adAccounts) {
      try {
        console.log(`[Pixels by Token] Fetching pixels for: ${account.name} (${account.id})`);
        flow.steps.push(`3.${account.id}: Fetching pixels from ${account.name}`);
        
        const pixelsResponse = await fetch(
          `https://graph.facebook.com/v24.0/${account.id}/adspixels`
        );
        
        const pixelsData = await pixelsResponse.json();
        
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
          flow.steps.push(`3.${account.id}: ✅ Found ${accountPixels.length} pixels`);
          console.log(`[Pixels by Token] Found ${accountPixels.length} pixels in ${account.name}`);
        } else {
          flow.steps.push(`3.${account.id}: ⚠️ No pixels found - ${pixelsData.error?.message || 'No data'}`);
          flow.errors.push(`${account.name}: ${pixelsData.error?.message || 'No pixels found'}`);
        }
      } catch (error) {
        flow.steps.push(`3.${account.id}: ❌ Error - ${error}`);
        flow.errors.push(`${account.name}: Network error`);
        console.error(`[Pixels by Token] Error fetching pixels from ${account.name}:`, error);
      }
    }

    flow.steps.push(`4. ✅ Total pixels found: ${flow.pixels.length}`);
    console.log(`[Pixels by Token] Total pixels found: ${flow.pixels.length}`);

    // Return result
    return Response.json({
      success: flow.pixels.length > 0,
      pixels: flow.pixels,
      flow,
      summary: {
        userId: flow.userId,
        userName: flow.userName,
        adAccountsFound: flow.adAccounts.length,
        pixelsFound: flow.pixels.length,
        method: "token_extraction"
      },
      message: flow.pixels.length > 0 
        ? `Found ${flow.pixels.length} pixel(s) from ${flow.adAccounts.length} ad account(s)`
        : "No pixels found - create pixels in Facebook Events Manager"
    }, { headers: corsHeaders });

  } catch (error) {
    console.error("[Pixels by Token] Unexpected error:", error);
    flow.errors.push(`Unexpected error: ${error}`);
    
    return Response.json({
      error: "Failed to process token",
      flow,
      details: String(error)
    }, { status: 500, headers: corsHeaders });
  }
}

export default function FacebookPixelsByToken() {
  return null;
}
