// Debug ad accounts specifically
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
  const token = url.searchParams.get("token");

  if (!token) {
    return Response.json(
      { 
        error: "Missing token parameter",
        usage: "Add ?token=YOUR_ACCESS_TOKEN to the URL"
      },
      { status: 400, headers: corsHeaders }
    );
  }

  console.log(`[Ad Accounts Debug] Testing token: ${token.substring(0, 30)}...`);

  const results = [];

  // Test 1: Basic user info first
  try {
    console.log("[Ad Accounts Debug] Step 1: Testing user info");
    const userResponse = await fetch(
      `https://graph.facebook.com/v24.0/me?fields=id,name,email&access_token=${token}`
    );
    
    const userData = await userResponse.json();
    
    results.push({
      step: 1,
      test: "User Info",
      url: `https://graph.facebook.com/v24.0/me?fields=id,name,email&access_token=${token.substring(0, 20)}...`,
      status: userResponse.status,
      ok: userResponse.ok,
      data: userData,
      headers: Object.fromEntries(userResponse.headers.entries())
    });
    
    console.log("[Ad Accounts Debug] User result:", { 
      status: userResponse.status, 
      ok: userResponse.ok, 
      hasError: !!userData.error,
      errorCode: userData.error?.code,
      errorMessage: userData.error?.message
    });

    if (!userResponse.ok || userData.error) {
      return Response.json({
        error: "Token validation failed - cannot proceed to ad accounts",
        results,
        recommendation: "Fix token issue first"
      }, { headers: corsHeaders });
    }
  } catch (error) {
    results.push({
      step: 1,
      test: "User Info",
      error: String(error)
    });
    return Response.json({
      error: "Network error during user validation",
      results
    }, { headers: corsHeaders });
  }

  // Test 2: Check permissions
  try {
    console.log("[Ad Accounts Debug] Step 2: Checking permissions");
    const permResponse = await fetch(
      `https://graph.facebook.com/v24.0/me/permissions?access_token=${token}`
    );
    
    const permData = await permResponse.json();
    const grantedPermissions = permData.data
      ?.filter((p: any) => p.status === 'granted')
      ?.map((p: any) => p.permission) || [];
    
    results.push({
      step: 2,
      test: "Permissions",
      url: `https://graph.facebook.com/v24.0/me/permissions?access_token=${token.substring(0, 20)}...`,
      status: permResponse.status,
      ok: permResponse.ok,
      data: permData,
      grantedPermissions,
      hasAdsRead: grantedPermissions.includes('ads_read'),
      hasBusinessManagement: grantedPermissions.includes('business_management')
    });
    
    console.log("[Ad Accounts Debug] Permissions:", grantedPermissions);
  } catch (error) {
    results.push({
      step: 2,
      test: "Permissions",
      error: String(error)
    });
  }

  // Test 3: Try different ad account endpoints
  const adAccountEndpoints = [
    {
      name: "Basic Ad Accounts",
      url: `https://graph.facebook.com/v24.0/me/adaccounts?access_token=${token}`,
    },
    {
      name: "Ad Accounts with Fields",
      url: `https://graph.facebook.com/v24.0/me/adaccounts?fields=id,name&access_token=${token}`,
    },
    {
      name: "Ad Accounts Full Fields",
      url: `https://graph.facebook.com/v24.0/me/adaccounts?fields=id,name,account_status,business&access_token=${token}`,
    },
    {
      name: "Owned Ad Accounts",
      url: `https://graph.facebook.com/v24.0/me/owned_ad_accounts?fields=id,name&access_token=${token}`,
    }
  ];

  for (const endpoint of adAccountEndpoints) {
    try {
      console.log(`[Ad Accounts Debug] Testing: ${endpoint.name}`);
      const response = await fetch(endpoint.url);
      const responseText = await response.text();
      
      let data;
      try {
        data = JSON.parse(responseText);
      } catch (parseError) {
        data = { rawResponse: responseText, parseError: String(parseError) };
      }
      
      results.push({
        step: 3,
        test: endpoint.name,
        url: endpoint.url.replace(token, `${token.substring(0, 20)}...`),
        status: response.status,
        ok: response.ok,
        data: data,
        headers: Object.fromEntries(response.headers.entries()),
        accountCount: data.data?.length || 0,
        rawResponse: responseText.length > 1000 ? `${responseText.substring(0, 1000)}...` : responseText
      });
      
      console.log(`[Ad Accounts Debug] ${endpoint.name} result:`, { 
        status: response.status, 
        ok: response.ok, 
        hasError: !!data.error,
        errorCode: data.error?.code,
        errorMessage: data.error?.message,
        accountCount: data.data?.length || 0
      });
      
    } catch (error) {
      results.push({
        step: 3,
        test: endpoint.name,
        error: String(error)
      });
      console.error(`[Ad Accounts Debug] ${endpoint.name} error:`, error);
    }
  }

  // Analyze results
  const userValid = results.find(r => r.step === 1)?.ok;
  const hasAdsRead = results.find(r => r.step === 2)?.hasAdsRead;
  const hasBusinessManagement = results.find(r => r.step === 2)?.hasBusinessManagement;
  const adAccountsWorking = results.filter(r => r.step === 3 && r.ok).length > 0;
  const adAccountsFound = results.filter(r => r.step === 3 && r.ok && r.accountCount > 0).length > 0;

  const analysis = {
    userValid,
    hasAdsRead,
    hasBusinessManagement,
    adAccountsWorking,
    adAccountsFound,
    totalEndpointsTested: adAccountEndpoints.length,
    workingEndpoints: results.filter(r => r.step === 3 && r.ok).length
  };

  let diagnosis = "";
  let recommendations = [];

  if (!userValid) {
    diagnosis = "❌ Token is invalid";
    recommendations.push("Generate a new access token");
  } else if (!hasAdsRead) {
    diagnosis = "❌ Missing ads_read permission";
    recommendations.push("Add ads_read permission to your token");
  } else if (!adAccountsWorking) {
    diagnosis = "❌ All ad account endpoints are failing";
    recommendations.push("Check if your Facebook app has the right permissions");
    recommendations.push("Verify you have access to at least one ad account");
  } else if (!adAccountsFound) {
    diagnosis = "⚠️ Ad account endpoints work but no accounts found";
    recommendations.push("Make sure you're added as admin/advertiser to ad accounts");
    recommendations.push("Create an ad account if you don't have one");
  } else {
    diagnosis = "✅ Everything looks good";
    recommendations.push("You should be able to fetch pixels now");
  }

  return Response.json({
    analysis,
    diagnosis,
    recommendations,
    results,
    timestamp: new Date().toISOString(),
    tokenInfo: {
      length: token.length,
      preview: `${token.substring(0, 30)}...`
    }
  }, { headers: corsHeaders });
}

export default function DebugAdAccounts() {
  return null;
}
