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
  
  // If login is successful, authenticate and redirect to app
  try {
    const { session } = await shopify.authenticate.admin(request);
    
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
    }

    throw redirect("/app/dashboard");
  } catch (error) {
    if (error instanceof Response) {
      throw error;
    }
    
    console.error("Authentication error:", error);
    return {
      errors: { shop: "Failed to authenticate. Please try again." },
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

  if (isInIframe) {
    return (
      <AppProvider embedded={false}>
        <div style={{ padding: "40px", textAlign: "center" }}>
          <p>Redirecting to login...</p>
          <script
            dangerouslySetInnerHTML={{
              __html: `
                if (window.top !== window.self) {
                  window.top.location.href = '/auth';
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
