// Extract user ID from Facebook access token
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

    console.log(`[Extract User ID] Processing token: ${accessToken.substring(0, 20)}...`);

    // Method 1: Extract from token structure (Facebook tokens contain user ID)
    let extractedUserId = null;
    
    // Facebook access tokens have format: EAA{app_id}|{user_id}|{other_data}
    // But this is not reliable, so we'll use the API method
    
    // Method 2: Use Facebook API to get user ID (most reliable)
    try {
      const userResponse = await fetch(
        `https://graph.facebook.com/v24.0/me?fields=id,name&access_token=${accessToken}`
      );
      
      const userData = await userResponse.json();
      
      if (userResponse.ok && !userData.error) {
        extractedUserId = userData.id;
        console.log(`[Extract User ID] Found user: ${userData.name} (${userData.id})`);
        
        return Response.json({
          success: true,
          userId: userData.id,
          userName: userData.name,
          method: "api_call",
          timestamp: new Date().toISOString()
        }, { headers: corsHeaders });
      } else {
        console.error(`[Extract User ID] API error:`, userData.error);
        return Response.json({
          error: `Failed to get user ID: ${userData.error?.message || 'Unknown error'}`,
          details: userData.error
        }, { status: 400, headers: corsHeaders });
      }
    } catch (error) {
      console.error(`[Extract User ID] Network error:`, error);
      return Response.json({
        error: "Network error while extracting user ID",
        details: String(error)
      }, { status: 500, headers: corsHeaders });
    }

  } catch (error) {
    console.error("[Extract User ID] Unexpected error:", error);
    return Response.json({
      error: "Failed to extract user ID",
      details: String(error)
    }, { status: 500, headers: corsHeaders });
  }
}

export default function ExtractUserId() {
  return null;
}
