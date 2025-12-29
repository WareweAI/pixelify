// Quick Facebook API test endpoint
import type { LoaderFunctionArgs } from "react-router";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type",
  "X-Content-Type-Options": "nosniff",
};

export async function loader({ request }: LoaderFunctionArgs) {
  if (request.method === "OPTIONS") {
    return new Response(null, { status: 204, headers: corsHeaders });
  }

  const url = new URL(request.url);
  const accessToken = url.searchParams.get("token");

  if (!accessToken) {
    return Response.json(
      { 
        error: "Missing token parameter",
        usage: "Add ?token=YOUR_ACCESS_TOKEN to the URL"
      },
      { status: 400, headers: corsHeaders }
    );
  }

  console.log(`[Quick Test] Testing token: ${accessToken.substring(0, 20)}...`);

  const results = [];

  // Test 1: Basic user info
  try {
    console.log("[Quick Test] Step 1: Testing user info");
    const userResponse = await fetch(
      `https://graph.facebook.com/v24.0/me?fields=id,name&access_token=${accessToken}`
    );
    const userData = await userResponse.json();
    
    results.push({
      test: "User Info",
      status: userResponse.status,
      success: userResponse.ok && !userData.error,
      data: userData,
      url: "https://graph.facebook.com/v24.0/me"
    });
    
    console.log("[Quick Test] User result:", { success: userResponse.ok, data: userData });
  } catch (error) {
    results.push({
      test: "User Info",
      success: false,
      error: String(error)
    });
  }

  // Test 2: Permissions
  try {
    console.log("[Quick Test] Step 2: Testing permissions");
    const permResponse = await fetch(
      `https://graph.facebook.com/v24.0/me/permissions?access_token=${accessToken}`
    );
    const permData = await permResponse.json();
    
    results.push({
      test: "Permissions",
      status: permResponse.status,
      success: permResponse.ok && !permData.error,
      data: permData,
      url: "https://graph.facebook.com/v24.0/me/permissions"
    });
    
    console.log("[Quick Test] Permissions result:", { success: permResponse.ok, data: permData });
  } catch (error) {
    results.push({
      test: "Permissions",
      success: false,
      error: String(error)
    });
  }

  // Test 3: Ad Accounts
  try {
    console.log("[Quick Test] Step 3: Testing ad accounts");
    const adResponse = await fetch(
      `https://graph.facebook.com/v24.0/me/adaccounts?fields=id,name&access_token=${accessToken}`
    );
    const adData = await adResponse.json();
    
    results.push({
      test: "Ad Accounts",
      status: adResponse.status,
      success: adResponse.ok && !adData.error,
      data: adData,
      url: "https://graph.facebook.com/v24.0/me/adaccounts"
    });
    
    console.log("[Quick Test] Ad accounts result:", { 
      success: adResponse.ok, 
      status: adResponse.status,
      hasError: !!adData.error,
      error: adData.error,
      accountCount: adData.data?.length || 0
    });
  } catch (error) {
    results.push({
      test: "Ad Accounts",
      success: false,
      error: String(error)
    });
  }

  const summary = {
    totalTests: results.length,
    successfulTests: results.filter(r => r.success).length,
    timestamp: new Date().toISOString(),
    tokenPreview: `${accessToken.substring(0, 20)}...`
  };

  console.log("[Quick Test] Summary:", summary);

  return Response.json({
    summary,
    results,
    instructions: {
      usage: "Call this endpoint with ?token=YOUR_ACCESS_TOKEN",
      nextSteps: [
        "Check which tests are failing",
        "Look at the error messages in the data field",
        "Verify your token has the right permissions"
      ]
    }
  }, { headers: corsHeaders });
}

export default function QuickFacebookTest() {
  return null;
}
