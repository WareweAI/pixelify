// Facebook Token Refresh Service
import prisma from "~/db.server";
import { refreshMetaAccessToken } from "./meta-capi.server";

/**
 * Check if a Facebook access token is expired and refresh it if needed
 * @param appId - The app ID to check and refresh token for
 * @returns Updated access token or null if refresh failed
 */
export async function checkAndRefreshToken(appId: string): Promise<string | null> {
  try {
    const app = await prisma.app.findUnique({
      where: { id: appId },
      include: { settings: true },
    });

    if (!app?.settings?.metaAccessToken) {
      console.log(`[Token Refresh] No token found for app ${appId}`);
      return null;
    }

    const currentToken = app.settings.metaAccessToken;
    const expiresAt = app.settings.metaTokenExpiresAt;

    // Check if token is expired or will expire soon (within 7 days)
    const now = new Date();
    const sevenDaysFromNow = new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000);
    
    const needsRefresh = !expiresAt || expiresAt < sevenDaysFromNow;

    if (!needsRefresh) {
      console.log(`[Token Refresh] Token for app ${appId} is still valid`);
      return currentToken;
    }

    console.log(`[Token Refresh] Token for app ${appId} expired or expiring soon, refreshing...`);

    // Attempt to refresh the token
    const refreshResult = await refreshMetaAccessToken(currentToken);

    if (refreshResult.success && refreshResult.newToken) {
      // Update the token in database
      await prisma.appSettings.update({
        where: { id: app.settings.id },
        data: {
          metaAccessToken: refreshResult.newToken,
          metaTokenExpiresAt: refreshResult.expiresAt,
        },
      });

      console.log(`[Token Refresh] ✅ Token refreshed successfully for app ${appId}`);
      return refreshResult.newToken;
    } else {
      console.error(`[Token Refresh] ❌ Failed to refresh token for app ${appId}:`, refreshResult.error);
      return null;
    }
  } catch (error) {
    console.error(`[Token Refresh] Error checking/refreshing token:`, error);
    return null;
  }
}

/**
 * Refresh tokens for all apps belonging to a user
 * @param userId - The user ID
 * @returns Number of tokens successfully refreshed
 */
export async function refreshAllUserTokens(userId: string): Promise<number> {
  try {
    const apps = await prisma.app.findMany({
      where: { userId },
      include: { settings: true },
    });

    let refreshedCount = 0;

    for (const app of apps) {
      if (app.settings?.metaAccessToken) {
        const newToken = await checkAndRefreshToken(app.id);
        if (newToken) {
          refreshedCount++;
        }
      }
    }

    console.log(`[Token Refresh] Refreshed ${refreshedCount}/${apps.length} tokens for user ${userId}`);
    return refreshedCount;
  } catch (error) {
    console.error(`[Token Refresh] Error refreshing user tokens:`, error);
    return 0;
  }
}

/**
 * Refresh all expiring tokens across all users
 * Should be called periodically (e.g., daily via cron job)
 * @returns Number of tokens successfully refreshed
 */
export async function refreshAllExpiringTokens(): Promise<{ refreshed: number; failed: number; total: number }> {
  try {
    console.log('[Token Refresh] Starting batch token refresh for all users...');
    
    // Find all apps with tokens that will expire within 7 days
    const sevenDaysFromNow = new Date();
    sevenDaysFromNow.setDate(sevenDaysFromNow.getDate() + 7);

    const appsWithExpiringTokens = await prisma.appSettings.findMany({
      where: {
        metaAccessToken: { not: null },
        OR: [
          { metaTokenExpiresAt: null }, // Tokens without expiry date (old tokens)
          { metaTokenExpiresAt: { lt: sevenDaysFromNow } }, // Tokens expiring within 7 days
        ],
      },
      include: {
        app: true,
      },
    });

    console.log(`[Token Refresh] Found ${appsWithExpiringTokens.length} apps with expiring tokens`);

    let refreshedCount = 0;
    let failedCount = 0;

    for (const settings of appsWithExpiringTokens) {
      try {
        const newToken = await checkAndRefreshToken(settings.appId);
        if (newToken) {
          refreshedCount++;
        } else {
          failedCount++;
        }
      } catch (error) {
        console.error(`[Token Refresh] Error refreshing token for app ${settings.appId}:`, error);
        failedCount++;
      }
    }

    console.log(`[Token Refresh] Batch refresh complete: ${refreshedCount} refreshed, ${failedCount} failed, ${appsWithExpiringTokens.length} total`);
    
    return {
      refreshed: refreshedCount,
      failed: failedCount,
      total: appsWithExpiringTokens.length,
    };
  } catch (error) {
    console.error('[Token Refresh] Error in batch token refresh:', error);
    return { refreshed: 0, failed: 0, total: 0 };
  }
}

/**
 * Handle Facebook API error and attempt token refresh if it's an auth error
 * @param error - The Facebook API error
 * @param appId - The app ID
 * @returns New token if refresh was successful, null otherwise
 */
export async function handleFacebookApiError(error: any, appId: string): Promise<string | null> {
  // Check if it's an OAuth/token error
  const isTokenError = 
    error?.code === 190 || // Invalid OAuth access token
    error?.error_subcode === 463 || // Token expired
    error?.type === 'OAuthException';

  if (!isTokenError) {
    console.log(`[Token Refresh] Error is not token-related, skipping refresh`);
    return null;
  }

  console.log(`[Token Refresh] Detected token error (code: ${error?.code}, subcode: ${error?.error_subcode}), attempting refresh...`);
  
  return await checkAndRefreshToken(appId);
}
