import type { LoaderFunctionArgs } from "react-router";
import { redirect } from "react-router";

// Facebook OAuth - Redirect to Facebook login
export const loader = async ({ request }: LoaderFunctionArgs) => {
  const url = new URL(request.url);
  const returnUrl = url.searchParams.get('return') || '/app/dashboard';

  // Store return URL in session/cookie if needed
  const appId = process.env.FACEBOOK_APP_ID;
  const redirectUri = `${process.env.SHOPIFY_APP_URL || 'https://pixelify-red.vercel.app'}/auth/facebook/callback`;

  const scopes = [
    'ads_management',
    'ads_read',
    'business_management',
    'catalog_management',
    'pages_read_engagement',
    'public_profile',
  ].join(',');

  const facebookAuthUrl = `https://www.facebook.com/v18.0/dialog/oauth?client_id=${appId}&redirect_uri=${encodeURIComponent(redirectUri)}&scope=${scopes}&state=${encodeURIComponent(returnUrl)}`;

  return redirect(facebookAuthUrl);
};
