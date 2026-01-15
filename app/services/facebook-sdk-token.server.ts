// Facebook SDK Token Management
// Handles token refresh from Facebook SDK when server token expires
import prisma from "~/db.server";

/**
 * Get the most recent valid token for a user
 * Checks all apps and returns the first valid token found
 */
export async function getValidTokenForUser(userId: string): Promise<string | null> {
  try {
    const apps = await prisma.app.findMany({
      where: { userId },
      include: { settings: true },
      orderBy: { createdAt: 'desc' },
    });

    // Find first app with a token
    for (const app of apps) {
      if (app.settings?.metaAccessToken) {
        console.log(`[Token Manager] Found token for app ${app.name}`);
        return app.settings.metaAccessToken;
      }
    }

    console.log(`[Token Manager] No token found for user ${userId}`);
    return null;
  } catch (error) {
    console.error('[Token Manager] Error getting token:', error);
    return null;
  }
}

/**
 * Update token for all user's apps
 * Used when a new token is obtained from Facebook SDK
 */
export async function updateTokenForAllApps(userId: string, newToken: string): Promise<number> {
  try {
    const apps = await prisma.app.findMany({
      where: { userId },
      include: { settings: true },
    });

    let updatedCount = 0;

    for (const app of apps) {
      if (app.settings) {
        await prisma.appSettings.update({
          where: { id: app.settings.id },
          data: {
            metaAccessToken: newToken,
            metaTokenExpiresAt: null, // SDK tokens don't provide expiry
          },
        });
        updatedCount++;
      } else {
        // Create settings if they don't exist
        await prisma.appSettings.create({
          data: {
            appId: app.id,
            metaAccessToken: newToken,
          },
        });
        updatedCount++;
      }
    }

    console.log(`[Token Manager] Updated token for ${updatedCount} apps`);
    return updatedCount;
  } catch (error) {
    console.error('[Token Manager] Error updating tokens:', error);
    return 0;
  }
}

/**
 * Check if a token error indicates expiration
 */
export function isTokenExpiredError(error: any): boolean {
  return (
    error?.code === 190 || // Invalid OAuth access token
    error?.error_subcode === 463 || // Token expired
    error?.type === 'OAuthException' ||
    error?.message?.includes('Session has expired') ||
    error?.message?.includes('Error validating access token')
  );
}

/**
 * Get error message for user when token is expired
 */
export function getTokenExpiredMessage(): string {
  return 'Your Facebook access token has expired. Please reconnect Facebook in the Dashboard to continue using catalog features.';
}
