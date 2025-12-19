import type { ActionFunctionArgs } from "react-router";

export const action = async ({ request }: ActionFunctionArgs) => {
  if (request.method !== "POST") {
    return new Response("Method not allowed", { status: 405 });
  }

  try {
    const { code, redirectUri } = await request.json();

    if (!code) {
      return Response.json({ error: "No authorization code provided" }, { status: 400 });
    }

    // Exchange code for access token
    const facebookAppId = process.env.FACEBOOK_APP_ID || "1751098928884384";
    const facebookAppSecret = process.env.FACEBOOK_APP_SECRET || "fa51a61a5dea05a4c744b53340923b08";

    const tokenResponse = await fetch(
      `https://graph.facebook.com/v18.0/oauth/access_token?client_id=${facebookAppId}&client_secret=${facebookAppSecret}&redirect_uri=${encodeURIComponent(redirectUri)}&code=${code}`
    );
    
    const tokenData = await tokenResponse.json();

    if (tokenData.error) {
      return Response.json({ error: tokenData.error.message }, { status: 400 });
    }

    return Response.json({ accessToken: tokenData.access_token });
  } catch (error) {
    console.error("Token exchange error:", error);
    return Response.json({ error: "Failed to exchange authorization code" }, { status: 500 });
  }
};

export default function ExchangeToken() {
  return null;
}