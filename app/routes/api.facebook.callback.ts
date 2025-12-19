import type { LoaderFunctionArgs } from "react-router";

export const loader = async ({ request }: LoaderFunctionArgs) => {
  const url = new URL(request.url);
  const code = url.searchParams.get("code");
  const error = url.searchParams.get("error");
  const errorDescription = url.searchParams.get("error_description");

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
              window.opener.postMessage({
                type: 'FACEBOOK_AUTH_ERROR',
                error: '${errorDescription || error}'
              }, window.location.origin);
              window.close();
            ` : code ? `
              // Exchange code for access token
              const response = await fetch('/api/facebook/exchange-token', {
                method: 'POST',
                headers: {
                  'Content-Type': 'application/json',
                },
                body: JSON.stringify({
                  code: '${code}',
                  redirectUri: '${url.origin}/api/facebook/callback'
                })
              });
              
              const data = await response.json();
              
              if (data.error) {
                window.opener.postMessage({
                  type: 'FACEBOOK_AUTH_ERROR',
                  error: data.error
                }, window.location.origin);
              } else {
                window.opener.postMessage({
                  type: 'FACEBOOK_AUTH_SUCCESS',
                  accessToken: data.accessToken
                }, window.location.origin);
              }
              window.close();
            ` : `
              window.opener.postMessage({
                type: 'FACEBOOK_AUTH_ERROR',
                error: 'No authorization code received'
              }, window.location.origin);
              window.close();
            `}
          } catch (error) {
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