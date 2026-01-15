import type { LoaderFunctionArgs } from "react-router";
import { getShopifyInstance } from "../shopify.server";
import prisma from "../db.server";
import { FacebookTokenService } from "../services/facebook-token.server";

export const loader = async ({ request }: LoaderFunctionArgs) => {
  const shopify = getShopifyInstance();
  const { session } = await shopify.authenticate.admin(request);
  const shop = session.shop;

  const user = await prisma.user.findUnique({
    where: { storeUrl: shop },
  });

  if (!user) {
    return { error: "User not found" };
  }

  const apps = await prisma.app.findMany({
    where: { userId: user.id },
    include: { settings: true },
  });

  const appWithToken = apps.find(app => app.settings?.metaAccessToken);

  if (!appWithToken?.settings?.metaAccessToken) {
    return {
      hasToken: false,
      message: "No Facebook token found. Please add your token in Dashboard.",
    };
  }

  const token = appWithToken.settings.metaAccessToken;

  try {
    // Get detailed token info
    const tokenInfo = await FacebookTokenService.getTokenInfo(token);

    if (!tokenInfo.isValid) {
      return {
        hasToken: true,
        isValid: false,
        message: "Your Facebook token is invalid or expired. Please generate a new token.",
        needsUpdate: true,
      };
    }

    // Check if token has required scopes
    if (!tokenInfo.hasRequiredScopes) {
      return {
        hasToken: true,
        isValid: true,
        message: "Your token is missing required permissions. Please regenerate with catalog_management permission.",
        needsUpdate: true,
        missingScopes: true,
        scopes: tokenInfo.scopes,
      };
    }

    // Check expiry
    const expiryCheck = await FacebookTokenService.checkTokenExpiry(token);

    return {
      hasToken: true,
      isValid: true,
      tokenType: tokenInfo.type,
      expiresAt: tokenInfo.expiresAt?.toISOString() || null,
      needsRefresh: expiryCheck.needsRefresh,
      scopes: tokenInfo.scopes,
      message: expiryCheck.needsRefresh
        ? "Your token expires soon. Consider using a System User token that never expires."
        : tokenInfo.type === "USER"
        ? "Using User token. Consider switching to System User token for better reliability."
        : "Token is valid and ready to use!",
    };
  } catch (error) {
    console.error("Error validating token:", error);
    return {
      hasToken: true,
      isValid: false,
      message: "Failed to validate token. Please check your token and try again.",
      error: error instanceof Error ? error.message : "Unknown error",
    };
  }
};
