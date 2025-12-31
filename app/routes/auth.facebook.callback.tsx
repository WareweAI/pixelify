import type { LoaderFunctionArgs } from "react-router";

export const loader = async ({ request }: LoaderFunctionArgs) => {
  const url = new URL(request.url);
  const code = url.searchParams.get("code");
  const error = url.searchParams.get("error");
  const errorDescription = url.searchParams.get("error_description");

  console.log("[Facebook Callback] Received request:", {
    hasCode: !!code,
    hasError: !!error,
    errorDescription,
    origin: url.origin
  });

  // Return HTML that will communicate with the parent window
  const html = `
    <!DOCTYPE html>
    <html>
    <head>
      <title>Facebook Authentication</title>
    </head>
    <body>
      <script>
        (async function() {
          try {
            ${error ? `
              console.log('[Facebook Callback] Auth error:', '${errorDescription || error}');
              window.opener.postMessage({
                type: 'FACEBOOK_AUTH_ERROR',
                error: '${errorDescription || error}'
              }, window.location.origin);
              window.close();
            ` : code ? `
              console.log('[Facebook Callback] Exchanging code for token...');
              
              // Exchange code for access token
              const response = await fetch('/api/facebook/exchange-token', {
                method: 'POST',
                headers: {
                  'Content-Type': 'application/json',
                },
                body: JSON.stringify({
                  code: '${code}',
                  redirectUri: '${url.origin}/auth/facebook/callback'
                })
              });

              const data = await response.json();
              console.log('[Facebook Callback] Exchange response:', {
                hasAccessToken: !!data.accessToken,
                hasUser: !!data.user,
                userName: data.user?.name,
                pixelCount: data.pixels?.length || 0,
                error: data.error
              });

              if (data.error) {
                console.log('[Facebook Callback] User NOT connected - error:', data.error);
                window.opener.postMessage({
                  type: 'FACEBOOK_AUTH_ERROR',
                  error: data.error
                }, window.location.origin);
              } else {
                console.log('[Facebook Callback] User CONNECTED successfully!');
                console.log('[Facebook Callback] User:', data.user?.name || 'Unknown');
                console.log('[Facebook Callback] Pixels found:', data.pixels?.length || 0);
                
                window.opener.postMessage({
                  type: 'FACEBOOK_AUTH_SUCCESS',
                  accessToken: data.accessToken,
                  expiresAt: data.expiresAt,
                  pixels: data.pixels,
                  adAccounts: data.adAccounts,
                  user: data.user,
                  warning: data.warning
                }, window.location.origin);
              }
              window.close();
            ` : `
              console.log('[Facebook Callback] User NOT connected - no authorization code');
              window.opener.postMessage({
                type: 'FACEBOOK_AUTH_ERROR',
                error: 'No authorization code received'
              }, window.location.origin);
              window.close();
            `}
          } catch (error) {
            console.log('[Facebook Callback] User NOT connected - exception:', error.message);
            window.opener.postMessage({
              type: 'FACEBOOK_AUTH_ERROR',
              error: 'Authentication failed: ' + error.message
            }, window.location.origin);
            window.close();
          }
        })();
      </script>
    </body>
    </html>
  `;

  return new Response(html, {
    headers: {
      'Content-Type': 'text/html',
    },
  });
};

export default function FacebookCallback() {
  return null;
}