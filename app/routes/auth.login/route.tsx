import { AppProvider } from "@shopify/shopify-app-react-router/react";
import { useEffect, useState } from "react";
import type { ActionFunctionArgs, LoaderFunctionArgs } from "react-router";
import { Form, useActionData, useLoaderData, useRouteError, isRouteErrorResponse, redirect } from "react-router";

import { login, reinitializeShopify, authenticate } from "../../shopify.server";
import { loginErrorMessage } from "./error.server";
import { loadEnv } from "../../lib/env-loader.server";
import prisma from "../../db.server";
import { generateRandomPassword } from "../../lib/crypto.server";

export const loader = async ({ request }: LoaderFunctionArgs) => {
  // Load environment variables (server-only)
  loadEnv();
  if (!login) {
    return { errors: { shop: "Shopify configuration not found. Please set SHOPIFY_API_KEY and SHOPIFY_API_SECRET environment variables." } };
  }

  try {
    const loginResult = await login(request);
    
    // If login returns a Response (redirect), throw it
    if (loginResult instanceof Response) {
      throw loginResult;
    }
    
    // Otherwise, it's an error object, convert it to error messages
    const errors = loginErrorMessage(loginResult);
    return { errors };
  } catch (error) {
    // Re-throw redirect responses (they should propagate)
    if (error instanceof Response && error.status >= 300 && error.status < 400) {
      throw error;
    }
    
    console.error("Login loader error:", error);
    throw new Response("Failed to process login request. Please try again.", {
      status: 500,
    });
  }
};

export const action = async ({ request }: ActionFunctionArgs) => {
  // Load environment variables (server-only) - ensure fresh load
  loadEnv();
  
  // Reinitialize Shopify to get fresh instance after env vars are loaded
  const freshInstance = reinitializeShopify(); // Clear cache and reinitialize with fresh env vars
  
  const activeLogin = freshInstance?.login || null;

  if (!activeLogin) {
    console.error('❌ Shopify login not available after env load');
    console.error('SHOPIFY_API_KEY:', process.env.SHOPIFY_API_KEY ? 'Present' : 'Missing');
    console.error('SHOPIFY_API_SECRET:', process.env.SHOPIFY_API_SECRET ? 'Present' : 'Missing');
    throw new Response("Shopify configuration not found. Please set SHOPIFY_API_KEY and SHOPIFY_API_SECRET environment variables.", {
      status: 500,
    });
  }

  try {
    const loginResult = await activeLogin(request);
    
    // If login returns a Response (redirect), throw it
    if (loginResult instanceof Response) {
      throw loginResult;
    }
    
    // Otherwise, it's an error object, convert it to error messages
    const errors = loginErrorMessage(loginResult);
    
    // If there are errors, return them to show in the form
    if (errors && Object.keys(errors).length > 0) {
      return { errors };
    }

    // If login is successful (no errors), authenticate and redirect to app
    if (!authenticate) {
      return {
        errors: { shop: "Authentication not available. Please configure Shopify." },
      };
    }

    try {
      const { session } = await authenticate.admin(request);
      
      // Create or update user in database (only if database is available)
      try {
        // Check if prisma is actually initialized (not empty object)
        if (prisma && typeof prisma.user !== "undefined") {
          let user = await prisma.user.findUnique({
            where: { email: session.shop },
          });

          if (!user) {
            user = await prisma.user.create({
              data: {
                email: session.shop,
                password: generateRandomPassword(),
              },
            });
          }
        }
      } catch (dbError) {
        // Log but don't fail the authentication if database fails
        console.error("Database error during login (non-critical):", dbError);
      }

      // Redirect to app dashboard
      throw redirect("/app/dashboard");
    } catch (authError) {
      // Re-throw redirect responses (they should propagate)
      if (authError instanceof Response) {
        throw authError;
      }
      
      console.error("Authentication error:", authError);
      return {
        errors: { shop: "Failed to authenticate. Please try again." },
      };
    }
  } catch (error) {
    // Handle redirect responses (302) as success, not errors
    if (error instanceof Response && error.status >= 300 && error.status < 400) {
      console.log("OAuth redirect (expected):", error.status, error.headers.get("Location"));
      throw error; // Re-throw redirect responses
    }

    console.error("Login action error:", error);

    // Re-throw other responses
    if (error instanceof Response) {
      throw error;
    }

    return { errors: { shop: "Failed to process login request. Please try again." } };
  }
};

export default function Auth() {
  const loaderData = useLoaderData<typeof loader>();
  const actionData = useActionData<typeof action>();
  const [shop, setShop] = useState("");
  const [isInIframe, setIsInIframe] = useState(false);
  const { errors } = actionData || loaderData;

  // Check if we're in an iframe and redirect to top level if needed
  useEffect(() => {
    if (typeof window !== "undefined") {
      try {
        const inIframe = window.top !== window.self;
        setIsInIframe(inIframe);
        
        // If in iframe, try to redirect the top window to this URL
        // Only works if same-origin, will fail silently if cross-origin
        if (inIframe && window.top) {
          try {
            const topLocation = window.top.location;
            // If we get here, we're same-origin, so redirect is safe
            topLocation.href = window.location.href;
          } catch (e) {
            setIsInIframe(false);
          }
        }
      } catch (e) {
        // Silently handle any errors
        setIsInIframe(false);
      }
    }
  }, []);

  // Don't render anything if we're redirecting from an iframe
  if (isInIframe) {
    return (
      <AppProvider embedded={false}>
        <div style={{ padding: "40px", textAlign: "center" }}>
          <p>Redirecting to login...</p>
        </div>
      </AppProvider>
    );
  }

  return (
    <AppProvider embedded={false}>
      <s-page>
        <Form method="post" target="_top">
          <s-section heading="Log in">
            <s-text-field
              id="shop"
              name="shop"
              label="Shop domain"
              details="example.myshopify.com"
              value={shop}
              onChange={(e) => setShop(e.currentTarget.value)}
              autocomplete="on"
              error={errors.shop}
            ></s-text-field>
            <s-button type="submit">Log in</s-button>
          </s-section>
        </Form>
      </s-page>
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
