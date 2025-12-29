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
    const facebookAppId = process.env.FACEBOOK_APP_ID || "881927951248648";
    const facebookAppSecret = process.env.FACEBOOK_APP_SECRET || "fa51a61a5dea05a4c744b53340923b08";

    const tokenResponse = await fetch(
      `https://graph.facebook.com/v24.0/oauth/access_token?client_id=${facebookAppId}&client_secret=${facebookAppSecret}&redirect_uri=${encodeURIComponent(redirectUri)}&code=${code}`
    );
    
    const tokenData = await tokenResponse.json();

    if (tokenData.error) {
      return Response.json({ error: tokenData.error.message }, { status: 400 });
    }

    const shortLivedToken = tokenData.access_token;
    let accessToken: string;
    let expiresIn: number;

    // Exchange for long-lived token (60 days)
    const longLivedResponse = await fetch(
      `https://graph.facebook.com/v24.0/oauth/access_token?grant_type=fb_exchange_token&client_id=${facebookAppId}&client_secret=${facebookAppSecret}&fb_exchange_token=${shortLivedToken}`
    );

    const longLivedData = await longLivedResponse.json();

    if (longLivedData.error) {
      console.warn("Could not exchange for long-lived token:", longLivedData.error);
      // Fall back to short-lived token
      accessToken = shortLivedToken;
      expiresIn = 3600; // 1 hour
    } else {
      accessToken = longLivedData.access_token;
      expiresIn = longLivedData.expires_in || 5184000; // 60 days default
    }

    // Fetch pixels after successful token exchange
    try {
      // Fetch ad accounts first
      const adAccountsResponse = await fetch(
        `https://graph.facebook.com/v24.0/me/adaccounts?fields=id,name&access_token=${accessToken}`
      );

      if (!adAccountsResponse.ok) {
        console.error("Failed to fetch ad accounts");
        return Response.json({
          accessToken,
          expiresIn,
          expiresAt: new Date(Date.now() + expiresIn * 1000).toISOString(),
          pixels: [],
          warning: "Could not fetch pixels - ad accounts access failed"
        });
      }

      const adAccountsData = await adAccountsResponse.json();

      if (adAccountsData.error) {
        console.error("Ad accounts error:", adAccountsData.error);
        return Response.json({
          accessToken,
          expiresIn,
          expiresAt: new Date(Date.now() + expiresIn * 1000).toISOString(),
          pixels: [],
          warning: `Could not fetch pixels: ${adAccountsData.error.message}`
        });
      }

      const pixels = [];

      // For each ad account, fetch pixels (datasets)
      for (const account of adAccountsData.data || []) {
        try {
          const pixelsResponse = await fetch(
            `https://graph.facebook.com/v24.0/${account.id}/adspixels?fields=id,name&access_token=${accessToken}`
          );

          if (pixelsResponse.ok) {
            const pixelsData = await pixelsResponse.json();
            if (pixelsData.data) {
              pixels.push(...pixelsData.data.map((pixel: any) => ({
                id: pixel.id,
                name: pixel.name,
                adAccountId: account.id,
                adAccountName: account.name,
              })));
            }
          }
        } catch (pixelError) {
          console.error(`Error fetching pixels for account ${account.id}:`, pixelError);
        }
      }

      return Response.json({
        accessToken,
        expiresIn,
        expiresAt: new Date(Date.now() + expiresIn * 1000).toISOString(),
        pixels,
        adAccounts: adAccountsData.data || []
      });

    } catch (pixelFetchError) {
      console.error("Error fetching pixels:", pixelFetchError);
      return Response.json({
        accessToken,
        expiresIn,
        expiresAt: new Date(Date.now() + expiresIn * 1000).toISOString(),
        pixels: [],
        warning: "Could not fetch pixels - please try again"
      });
    }

  } catch (error) {
    console.error("Token exchange error:", error);
    return Response.json({ error: "Failed to exchange authorization code" }, { status: 500 });
  }
};

export default function ExchangeToken() {
  return null;
}
