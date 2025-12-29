// Step-by-step Facebook API debugging endpoint
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

    const results = {
      token: {
        provided: true,
        length: accessToken.length,
        preview: `${accessToken.substring(0, 20)}...`,
      },
      steps: [] as any[],
      timestamp: new Date().toISOString(),
    };

    // Step 1: Test basic token validity
    console.log("[Debug] Step 1: Testing token validity");
    try {
      const userResponse = await fetch(
        `https://graph.facebook.com/v24.0/me?fields=id,name,email&access_token=${accessToken}`
      );
      
      const userData = await userResponse.json();
      
      results.steps.push({
        step: 1,
        name: "Token Validation",
        url: "https://graph.facebook.com/v24.0/me",
        status: userResponse.status,
        success: userResponse.ok && !userData.error,
        data: userData,
        error: userData.error?.message,
      });

      if (!userResponse.ok || userData.error) {
        return Response.json({ results, conclusion: "Invalid token" }, { headers: corsHeaders });
      }
    } catch (error) {
      results.steps.push({
        step: 1,
        name: "Token Validation",
        success: false,
        error: `Network error: ${error}`,
      });
      return Response.json({ results, conclusion: "Network error during token validation" }, { headers: corsHeaders });
    }

    // Step 2: Check token permissions
    console.log("[Debug] Step 2: Checking permissions");
    try {
      const permissionsResponse = await fetch(
        `https://graph.facebook.com/v24.0/me/permissions?access_token=${accessToken}`
      );
      
      const permissionsData = await permissionsResponse.json();
      
      const grantedPermissions = permissionsData.data
        ?.filter((p: any) => p.status === 'granted')
        ?.map((p: any) => p.permission) || [];
      
      results.steps.push({
        step: 2,
        name: "Permission Check",
        url: "https://graph.facebook.com/v24.0/me/permissions",
        status: permissionsResponse.status,
        success: permissionsResponse.ok,
        data: {
          all: permissionsData.data || [],
          granted: grantedPermissions,
          hasAdsRead: grantedPermissions.includes('ads_read'),
          hasBusinessManagement: grantedPermissions.includes('business_management'),
        },
        error: permissionsData.error?.message,
      });
    } catch (error) {
      results.steps.push({
        step: 2,
        name: "Permission Check",
        success: false,
        error: `Network error: ${error}`,
      });
    }

    // Step 3: Try different ad account endpoints
    console.log("[Debug] Step 3: Testing ad account endpoints");
    
    const adAccountEndpoints = [
      {
        name: "Standard Ad Accounts",
        url: `https://graph.facebook.com/v24.0/me/adaccounts?fields=id,name,account_status&access_token=${accessToken}`,
      },
      {
        name: "Ad Accounts with Business",
        url: `https://graph.facebook.com/v24.0/me/adaccounts?fields=id,name,account_status,business&access_token=${accessToken}`,
      },
      {
        name: "Owned Ad Accounts",
        url: `https://graph.facebook.com/v24.0/me/owned_ad_accounts?fields=id,name,account_status&access_token=${accessToken}`,
      },
    ];

    for (const endpoint of adAccountEndpoints) {
      try {
        console.log(`[Debug] Testing: ${endpoint.name}`);
        const response = await fetch(endpoint.url);
        const data = await response.json();
        
        results.steps.push({
          step: 3,
          name: endpoint.name,
          url: endpoint.url,
          status: response.status,
          success: response.ok && !data.error,
          data: data,
          error: data.error?.message,
          accountCount: data.data?.length || 0,
        });
      } catch (error) {
        results.steps.push({
          step: 3,
          name: endpoint.name,
          success: false,
          error: `Network error: ${error}`,
        });
      }
    }

    // Step 4: Try business manager endpoints
    console.log("[Debug] Step 4: Testing business manager");
    try {
      const businessResponse = await fetch(
        `https://graph.facebook.com/v24.0/me/businesses?fields=id,name&access_token=${accessToken}`
      );
      
      const businessData = await businessResponse.json();
      
      results.steps.push({
        step: 4,
        name: "Business Manager Access",
        url: "https://graph.facebook.com/v24.0/me/businesses",
        status: businessResponse.status,
        success: businessResponse.ok && !businessData.error,
        data: businessData,
        error: businessData.error?.message,
        businessCount: businessData.data?.length || 0,
      });
    } catch (error) {
      results.steps.push({
        step: 4,
        name: "Business Manager Access",
        success: false,
        error: `Network error: ${error}`,
      });
    }

    // Step 5: Try app-level access
    console.log("[Debug] Step 5: Testing app access");
    try {
      const appResponse = await fetch(
        `https://graph.facebook.com/v24.0/me/applications?access_token=${accessToken}`
      );
      
      const appData = await appResponse.json();
      
      results.steps.push({
        step: 5,
        name: "App Access",
        url: "https://graph.facebook.com/v24.0/me/applications",
        status: appResponse.status,
        success: appResponse.ok && !appData.error,
        data: appData,
        error: appData.error?.message,
      });
    } catch (error) {
      results.steps.push({
        step: 5,
        name: "App Access",
        success: false,
        error: `Network error: ${error}`,
      });
    }

    // Analyze results and provide conclusion
    const tokenValid = results.steps.find(s => s.step === 1)?.success;
    const hasPermissions = results.steps.find(s => s.step === 2)?.data?.hasAdsRead;
    const adAccountsFound = results.steps.filter(s => s.step === 3 && s.success && s.accountCount > 0).length > 0;
    const businessFound = results.steps.find(s => s.step === 4)?.success && results.steps.find(s => s.step === 4)?.businessCount > 0;

    let conclusion = "";
    let recommendations = [];

    if (!tokenValid) {
      conclusion = "❌ Token is invalid or expired";
      recommendations.push("Generate a new access token from Facebook Graph API Explorer");
    } else if (!hasPermissions) {
      conclusion = "❌ Token lacks required permissions";
      recommendations.push("Add 'ads_read' and 'business_management' permissions to your token");
      recommendations.push("Make sure your Facebook app is approved for these permissions");
    } else if (!adAccountsFound && !businessFound) {
      conclusion = "❌ No ad accounts or business access found";
      recommendations.push("Make sure you have access to at least one Facebook Ad Account");
      recommendations.push("Check if you're added as an admin/advertiser to any ad accounts");
      recommendations.push("Try connecting through Facebook Business Manager");
      recommendations.push("Create an ad account if you don't have one");
    } else {
      conclusion = "✅ Token and permissions look good";
      recommendations.push("You should be able to access pixels now");
    }

    return Response.json({
      results,
      conclusion,
      recommendations,
      summary: {
        tokenValid,
        hasPermissions,
        adAccountsFound,
        businessFound,
        totalSteps: results.steps.length,
        successfulSteps: results.steps.filter(s => s.success).length,
      }
    }, { headers: corsHeaders });

  } catch (error) {
    console.error("[Debug API] Unexpected error:", error);
    return Response.json({
      error: "Debug failed",
      originalError: String(error),
      timestamp: new Date().toISOString()
    }, { status: 500, headers: corsHeaders });
  }
}

export default function DebugFacebookStepByStep() {
  return null;
}
