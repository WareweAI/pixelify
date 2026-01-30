// Direct Facebook API test - bypasses our app logic
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

  console.log(`[Direct Test] Testing token: ${token.substring(0, 30)}...`);

  try {
    // Test 1: Basic user info
    console.log("[Direct Test] Calling Facebook API...");
    const response = await fetch(
      `https://graph.facebook.com/v24.0/me?access_token=${token}`,
      {
        method: 'GET',
        headers: {
          'Accept': 'application/json'
        }
      }
    );
    
    console.log(`[Direct Test] Facebook responded with status: ${response.status}`);
    
    const responseText = await response.text();
    console.log(`[Direct Test] Facebook response body: ${responseText}`);
    
    let data;
    try {
      data = JSON.parse(responseText);
    } catch (parseError) {
      data = { rawResponse: responseText, parseError: String(parseError) };
    }

    const result = {
      test: "Direct Facebook API Call",
      url: `https://graph.facebook.com/v24.0/me?access_token=${token.substring(0, 20)}...`,
      status: response.status,
      statusText: response.statusText,
      ok: response.ok,
      headers: Object.fromEntries(response.headers.entries()),
      data: data,
      timestamp: new Date().toISOString(),
      tokenInfo: {
        length: token.length,
        preview: `${token.substring(0, 30)}...`,
        startsWithEAA: token.startsWith('EAA'),
      }
    };

    console.log("[Direct Test] Final result:", {
      status: result.status,
      ok: result.ok,
      hasError: !!data.error,
      errorCode: data.error?.code,
      errorMessage: data.error?.message
    });

    return Response.json(result, { 
      status: 200, // Always return 200 so we can see the Facebook response
      headers: corsHeaders 
    });

  } catch (error) {
    console.error("[Direct Test] Network error:", error);
    return Response.json({
      error: "Network error",
      details: String(error),
      timestamp: new Date().toISOString()
    }, { status: 500, headers: corsHeaders });
  }
}

export default function TestFacebookDirect() {
  return null;
}
