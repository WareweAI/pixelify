import type { LoaderFunctionArgs } from "react-router";
import { redirect } from "react-router";
import { getShopifyInstance } from "../shopify.server";
import prisma from "../db.server";
import { cache } from "~/lib/cache.server";

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
      `https://graph.facebook.com/v18.0/oauth/access_token?client_id=${appId}&client_secret=${appSecret}&code=${code}&redirect_uri=${encodeURIComponent(redirectUri)}`,
      {
        method: 'GET',
        headers: {
          'Accept': 'application/json'
        }
      }
    );

    const tokenData = await tokenResponse.json();

    if (tokenData.error) {
      console.error('Error exchanging code for token:', tokenData.error);
      return redirect(`${state}?error=token_exchange_failed`);
    }

    const accessToken = tokenData.access_token;

    // Get long-lived token (60 days)
    const longLivedResponse = await fetch(
      `https://graph.facebook.com/v18.0/oauth/access_token?grant_type=fb_exchange_token&client_id=${appId}&client_secret=${appSecret}&fb_exchange_token=${accessToken}`,
      {
        method: 'GET',
        headers: {
          'Accept': 'application/json'
        }
      }
    );

    const longLivedData = await longLivedResponse.json();
    const longLivedToken = longLivedData.access_token || accessToken;

    // Get token expiry info
    const debugResponse = await fetch(
      `https://graph.facebook.com/v18.0/debug_token?input_token=${longLivedToken}&access_token=${longLivedToken}`,
      {
        method: 'GET',
        headers: {
          'Accept': 'application/json'
        }
      }
    );

    const debugData = await debugResponse.json();
    const expiresAt = debugData.data?.expires_at 
      ? new Date(debugData.data.expires_at * 1000)
      : null;

    console.log(`[Facebook OAuth] New token obtained, expires: ${expiresAt?.toISOString() || 'never'}`);
    console.log(`[Facebook OAuth] Token length: ${longLivedToken.length} characters`);
    console.log(`[Facebook OAuth] Token starts with: ${longLivedToken.substring(0, 20)}...`);

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
        console.log(`[Facebook OAuth] ✅ Updated token for app: ${app.name} (${app.appId})`);
        console.log(`[Facebook OAuth] - Previous token removed, new token assigned`);
      } else {
        await prisma.appSettings.create({
          data: {
            appId: app.id,
            metaAccessToken: longLivedToken,
            metaTokenExpiresAt: expiresAt,
          },
        });
        console.log(`[Facebook OAuth] ✅ Created settings with token for app: ${app.name} (${app.appId})`);
        console.log(`[Facebook OAuth] - New token created and assigned`);
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

    // Invalidate all caches to ensure fresh data with new token
    const cachePatterns = [
      `dashboard:${shop}:`,
      `app-settings:${shop}:`,
      `catalog-data:${shop}:`,
      `settings-data:${shop}:`,
      `analytics:${shop}:`,
      `analytics-data:${shop}:`,
      `events-data:${shop}:`,
      `custom-events:${shop}:`,
      `pixels:${shop}:`,
      `visitors:${shop}:`,
      `pricing-data:${shop}:`,
    ];

    let totalCleared = 0;
    for (const pattern of cachePatterns) {
      const cleared = cache.invalidatePattern(pattern);
      totalCleared += cleared;
    }
    
    // Also clear any Facebook-specific cache
    const facebookPatterns = [
      `facebook:${shop}:`,
      `facebook-pixels:${shop}:`,
      `facebook-user:${shop}:`,
      `facebook-catalog:${shop}:`,
    ];

    for (const pattern of facebookPatterns) {
      const cleared = cache.invalidatePattern(pattern);
      totalCleared += cleared;
    }
    
    // Clear all remaining cache entries for this shop
    const shopPattern = `.*${shop}.*`;
    const remainingCleared = cache.invalidatePattern(shopPattern);
    totalCleared += remainingCleared;
    
    console.log(`[Facebook OAuth] Cleared ${totalCleared} cache entries for fresh token data`);

    // Redirect with cache-busting query parameter to prevent browser caching
    const redirectUrl = `${state}${state.includes('?') ? '&' : '?'}success=facebook_connected&t=${Date.now()}`;
    return redirect(redirectUrl);
  } catch (error) {
    console.error('Error in Facebook OAuth callback:', error);
    return redirect(`/app/dashboard?error=oauth_failed`);
  }
};
