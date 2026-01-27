import { AppProvider } from "@shopify/shopify-app-react-router/react";
import { useEffect, useState } from "react";
import type { ActionFunctionArgs, LoaderFunctionArgs } from "react-router";
import { Form, useActionData, useLoaderData, useRouteError, isRouteErrorResponse, redirect } from "react-router";

import { getShopifyInstance } from "../../shopify.server";
import { loginErrorMessage } from "./error.server";
import prisma from "../../db.server";
import { generateRandomPassword } from "../../lib/crypto.server";

export const loader = async ({ request }: LoaderFunctionArgs) => {
  const shopify = getShopifyInstance();
  const errors = loginErrorMessage(await shopify.login(request));
  return { errors };
};

export const action = async ({ request }: ActionFunctionArgs) => {
  const shopify = getShopifyInstance();
  const errors = loginErrorMessage(await shopify.login(request));
  if (errors.shop) {
    return { errors };
  }
  
  // Extract return URL from query params
  const url = new URL(request.url);
  const returnUrl = url.searchParams.get('return') || '/app/dashboard';
  
  // If login is successful, authenticate and redirect to dashboard
  try {
    const authResult = await shopify.authenticate.admin(request);
    
    // Check if authentication returned a redirect (indicates an issue)
    if (authResult instanceof Response) {
      console.warn("Authentication returned redirect after login - may indicate session issue");
      return {
        errors: { shop: "Authentication failed. Please try again or contact support." },
      };
    }
    
    const { session } = authResult;
    
    // Validate session
    if (!session || !session.shop) {
      console.warn("Authentication succeeded but session is invalid");
      return {
        errors: { shop: "Session validation failed. Please try logging in again." },
      };
    }
    
    // Create or update user in database
    try {
      let user = await prisma.user.findUnique({
        where: { storeUrl: session.shop },
      });

      if (!user) {
        user = await prisma.user.create({
          data: {
            storeUrl: session.shop,
            password: generateRandomPassword(),
          },
        });
      }
    } catch (dbError) {
      console.error("Database error during login:", dbError);
      // Don't fail login for database issues - user can still access
    }

    // Redirect to original return URL or dashboard
    throw redirect(returnUrl);
  } catch (error) {
    if (error instanceof Response) {
      throw error;
    }
    
    console.error("Authentication error:", {
      message: error instanceof Error ? error.message : 'Unknown error',
      timestamp: new Date().toISOString(),
    });
    return {
      errors: { shop: "Authentication failed. Please try again with your shop domain." },
    };
  }
};

export default function Auth() {
  const loaderData = useLoaderData<typeof loader>();
  const actionData = useActionData<typeof action>();
  const [shop, setShop] = useState("");
  const [isInIframe, setIsInIframe] = useState(false);
  const { errors } = actionData || loaderData;

  useEffect(() => {
    if (typeof window !== "undefined") {
      try {
        const inIframe = window.top !== window.self;
        setIsInIframe(inIframe);
      } catch (e) {
        setIsInIframe(false);
      }
    }
  }, []);

  // If in iframe, redirect to top
  if (isInIframe) {
    return (
      <AppProvider embedded={false}>
        <div style={{ padding: "40px", textAlign: "center" }}>
          <p>Redirecting...</p>
          <script
            dangerouslySetInnerHTML={{
              __html: `
                if (window.top !== window.self) {
                  window.top.location.href = '/auth/login';
                }
              `,
            }}
          />
        </div>
      </AppProvider>
    );
  }

  return (
    <AppProvider embedded={false}>
      <div style={{
        display: "flex",
        justifyContent: "center",
        alignItems: "center",
        minHeight: "100vh",
        backgroundColor: "#f6f6f7",
        padding: "20px"
      }}>
        <div style={{
          backgroundColor: "white",
          padding: "40px",
          borderRadius: "8px",
          boxShadow: "0 2px 8px rgba(0,0,0,0.1)",
          maxWidth: "400px",
          width: "100%"
        }}>
          <h1 style={{
            fontSize: "24px",
            fontWeight: "600",
            marginBottom: "8px",
            color: "#202223"
          }}>
            Log in to Pixelify
          </h1>
          <p style={{
            color: "#6d7175",
            marginBottom: "24px",
            fontSize: "14px"
          }}>
            Enter your shop domain to continue
          </p>
          
          <Form method="post">
            <div style={{ marginBottom: "16px" }}>
              <label 
                htmlFor="shop" 
                style={{
                  display: "block",
                  marginBottom: "8px",
                  fontSize: "14px",
                  fontWeight: "500",
                  color: "#202223"
                }}
              >
                Shop domain
              </label>
              <input
                type="text"
                id="shop"
                name="shop"
                value={shop}
                onChange={(e) => setShop(e.target.value)}
                placeholder="example.myshopify.com"
                autoComplete="on"
                required
                style={{
                  width: "100%",
                  padding: "10px 12px",
                  fontSize: "14px",
                  border: errors?.shop ? "2px solid #d72c0d" : "1px solid #c9cccf",
                  borderRadius: "6px",
                  outline: "none",
                  boxSizing: "border-box"
                }}
                onFocus={(e) => {
                  if (!errors?.shop) {
                    e.target.style.border = "2px solid #005bd3";
                  }
                }}
                onBlur={(e) => {
                  if (!errors?.shop) {
                    e.target.style.border = "1px solid #c9cccf";
                  }
                }}
              />
              {errors?.shop && (
                <p style={{
                  color: "#d72c0d",
                  fontSize: "13px",
                  marginTop: "6px"
                }}>
                  {errors.shop}
                </p>
              )}
              <p style={{
                color: "#6d7175",
                fontSize: "13px",
                marginTop: "6px"
              }}>
                Enter your Shopify store domain (e.g., mystore.myshopify.com)
              </p>
            </div>
            
            <button
              type="submit"
              style={{
                width: "100%",
                padding: "12px",
                backgroundColor: "#008060",
                color: "white",
                border: "none",
                borderRadius: "6px",
                fontSize: "14px",
                fontWeight: "600",
                cursor: "pointer",
                transition: "background-color 0.2s"
              }}
              onMouseOver={(e) => {
                e.currentTarget.style.backgroundColor = "#006e52";
              }}
              onMouseOut={(e) => {
                e.currentTarget.style.backgroundColor = "#008060";
              }}
            >
              Log in
            </button>
          </Form>
          
          <div style={{
            marginTop: "24px",
            paddingTop: "24px",
            borderTop: "1px solid #e1e3e5",
            textAlign: "center"
          }}>
            <p style={{
              fontSize: "13px",
              color: "#6d7175"
            }}>
              Need help? <a 
                href="/docs" 
                style={{
                  color: "#005bd3",
                  textDecoration: "none"
                }}
              >
                View documentation
              </a>
            </p>
          </div>
        </div>
      </div>
    </AppProvider>
  );
}

export function ErrorBoundary() {
  const error = useRouteError();

  let title = "Something went wrong";
  let message = "An unexpected error occurred. Please try again.";

  if (isRouteErrorResponse(error)) {
    title = error.status === 500 ? "Server Error" : `Error ${error.status}`;
    message = typeof error.data === "string" ? error.data : error.statusText || message;
  } else if (error instanceof Error) {
    message = error.message;
  }

  return (
    <AppProvider embedded={false}>
      <s-page>
        <div style={{ padding: "40px", textAlign: "center" }}>
          <h1 style={{ fontSize: "24px", fontWeight: "bold", marginBottom: "16px" }}>
            {title}
          </h1>
          <p style={{ color: "#666", marginBottom: "24px" }}>
            {message}
          </p>
          <a
            href="/"
            style={{
              display: "inline-block",
              padding: "12px 24px",
              backgroundColor: "#008060",
              color: "white",
              textDecoration: "none",
              borderRadius: "6px",
            }}
          >
            Go to Home
          </a>
        </div>
      </s-page>
    </AppProvider>
  );
}
