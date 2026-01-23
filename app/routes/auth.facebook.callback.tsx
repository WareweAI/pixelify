import type { LoaderFunctionArgs } from "react-router";
import { redirect } from "react-router";
import { getShopifyInstance } from "../shopify.server";
import prisma from "../db.server";

export const loader = async ({ request }: LoaderFunctionArgs) => {
  const url = new URL(request.url);
  const code = url.searchParams.get('code');
  const state = url.searchParams.get('state') || '/app/dashboard';
  const error = url.searchParams.get('error');

  if (error) {
    console.error('Facebook OAuth error:', error);
    return redirect(`${state}?error=facebook_auth_failed`);
  }

  if (!code) {
    return redirect(`${state}?error=no_code`);
  }

  try {
    const shopify = getShopifyInstance();
    const { session } = await shopify.authenticate.admin(request);
    const shop = session.shop;

    // Exchange code for access token
    const appId = process.env.FACEBOOK_APP_ID;
    const appSecret = process.env.FACEBOOK_APP_SECRET;
    const redirectUri = `${process.env.SHOPIFY_APP_URL || 'https://pixelify-red.vercel.app'}/auth/facebook/callback`;

    const tokenResponse = await fetch(
      `https://graph.facebook.com/v18.0/oauth/access_token?client_id=${appId}&client_secret=${appSecret}&code=${code}&redirect_uri=${encodeURIComponent(redirectUri)}`
    );

    const tokenData = await tokenResponse.json();

    if (tokenData.error) {
      console.error('Error exchanging code for token:', tokenData.error);
      return redirect(`${state}?error=token_exchange_failed`);
    }

    const accessToken = tokenData.access_token;

    // Get long-lived token (60 days)
    const longLivedResponse = await fetch(
      `https://graph.facebook.com/v18.0/oauth/access_token?grant_type=fb_exchange_token&client_id=${appId}&client_secret=${appSecret}&fb_exchange_token=${accessToken}`
    );

    const longLivedData = await longLivedResponse.json();
    const longLivedToken = longLivedData.access_token || accessToken;

    // Get token expiry info
    const debugResponse = await fetch(
      `https://graph.facebook.com/v18.0/debug_token?input_token=${longLivedToken}&access_token=${longLivedToken}`
    );

    const debugData = await debugResponse.json();
    const expiresAt = debugData.data?.expires_at 
      ? new Date(debugData.data.expires_at * 1000)
      : null;

    console.log(`[Facebook OAuth] New token obtained, expires: ${expiresAt?.toISOString() || 'never'}`);

    // Save token to database - UPDATE ALL APPS for this user
    const user = await prisma.user.findUnique({
      where: { storeUrl: shop },
    });

    if (!user) {
      return redirect(`${state}?error=user_not_found`);
    }

    const apps = await prisma.app.findMany({
      where: { userId: user.id },
      include: { settings: true },
    });

    // Update ALL apps with the new token (so all pixels use the latest token)
    for (const app of apps) {
      if (app.settings) {
        await prisma.appSettings.update({
          where: { id: app.settings.id },
          data: {
            metaAccessToken: longLivedToken,
            metaTokenExpiresAt: expiresAt,
          },
        });
        console.log(`[Facebook OAuth] Updated token for app: ${app.name} (${app.appId})`);
      } else {
        await prisma.appSettings.create({
          data: {
            appId: app.id,
            metaAccessToken: longLivedToken,
            metaTokenExpiresAt: expiresAt,
          },
        });
        console.log(`[Facebook OAuth] Created settings with token for app: ${app.name} (${app.appId})`);
      }
    }

    // If no apps exist, create a default one
    if (apps.length === 0) {
      const newApp = await prisma.app.create({
        data: {
          userId: user.id,
          name: "Default Pixel",
          appId: `pixel_${Date.now()}`,
          appToken: `token_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`,
        },
      });
      
      await prisma.appSettings.create({
        data: {
          appId: newApp.id,
          metaAccessToken: longLivedToken,
          metaTokenExpiresAt: expiresAt,
        },
      });
      console.log(`[Facebook OAuth] Created new app with token: ${newApp.name}`);
    }

    return redirect(`${state}?success=facebook_connected`);
  } catch (error) {
    console.error('Error in Facebook OAuth callback:', error);
    return redirect(`/app/dashboard?error=oauth_failed`);
  }
};
