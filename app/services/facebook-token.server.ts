// Facebook Token Management Service
import prisma from "../db.server";

interface TokenValidationResponse {
  data: {
    app_id: string;
    type: string;
    application: string;
    data_access_expires_at: number;
    expires_at: number;
    is_valid: boolean;
    scopes: string[];
    user_id?: string;
  };
}

export class FacebookTokenService {
  /**
   * Validate if a token is still valid
   */
  static async validateToken(accessToken: string): Promise<boolean> {
    try {
      const response = await fetch(
        `https://graph.facebook.com/v18.0/debug_token?input_token=${accessToken}&access_token=${accessToken}`
      );
      
      const data: TokenValidationResponse = await response.json();
      
      if (data.data && data.data.is_valid) {
        // Check if token is expired
        const expiresAt = data.data.expires_at;
        if (expiresAt === 0) {
          // Token never expires (System User token)
          return true;
        }
        
        // Check if token expires in less than 7 days
        const now = Math.floor(Date.now() / 1000);
        const sevenDaysFromNow = now + (7 * 24 * 60 * 60);
        
        if (expiresAt > sevenDaysFromNow) {
          return true;
        }
        
        console.warn(`Token expires soon: ${new Date(expiresAt * 1000).toISOString()}`);
        return false;
      }
      
      return false;
    } catch (error) {
      console.error("Error validating token:", error);
      return false;
    }
  }

  /**
   * Get valid token for an app, with automatic validation
   */
  static async getValidToken(appId: string): Promise<string | null> {
    try {
      const app = await prisma.app.findUnique({
        where: { appId },
        include: { settings: true },
      });

      if (!app?.settings?.metaAccessToken) {
        return null;
      }

      const token = app.settings.metaAccessToken;

      // Validate token
      const isValid = await this.validateToken(token);

      if (!isValid) {
        console.error(`Token for app ${appId} is invalid or expired`);
        
        // Mark token as expired in database
        await prisma.appSettings.update({
          where: { id: app.settings.id },
          data: {
            metaTokenExpiresAt: new Date(), // Mark as expired
          },
        });

        return null;
      }

      return token;
    } catch (error) {
      console.error("Error getting valid token:", error);
      return null;
    }
  }

  /**
   * Check if token needs refresh (expires in less than 7 days)
   */
  static async checkTokenExpiry(accessToken: string): Promise<{
    isValid: boolean;
    expiresAt: Date | null;
    needsRefresh: boolean;
  }> {
    try {
      const response = await fetch(
        `https://graph.facebook.com/v18.0/debug_token?input_token=${accessToken}&access_token=${accessToken}`
      );
      
      const data: TokenValidationResponse = await response.json();
      
      if (!data.data || !data.data.is_valid) {
        return {
          isValid: false,
          expiresAt: null,
          needsRefresh: true,
        };
      }

      const expiresAt = data.data.expires_at;
      
      // System User tokens never expire
      if (expiresAt === 0) {
        return {
          isValid: true,
          expiresAt: null,
          needsRefresh: false,
        };
      }

      const expiryDate = new Date(expiresAt * 1000);
      const now = new Date();
      const sevenDaysFromNow = new Date(now.getTime() + (7 * 24 * 60 * 60 * 1000));

      return {
        isValid: true,
        expiresAt: expiryDate,
        needsRefresh: expiryDate < sevenDaysFromNow,
      };
    } catch (error) {
      console.error("Error checking token expiry:", error);
      return {
        isValid: false,
        expiresAt: null,
        needsRefresh: true,
      };
    }
  }

  /**
   * Exchange short-lived token for long-lived token (60 days)
   */
  static async exchangeForLongLivedToken(
    shortLivedToken: string,
    appId: string,
    appSecret: string
  ): Promise<string | null> {
    try {
      const response = await fetch(
        `https://graph.facebook.com/v18.0/oauth/access_token?grant_type=fb_exchange_token&client_id=${appId}&client_secret=${appSecret}&fb_exchange_token=${shortLivedToken}`
      );

      const data = await response.json();

      if (data.access_token) {
        return data.access_token;
      }

      console.error("Failed to exchange token:", data);
      return null;
    } catch (error) {
      console.error("Error exchanging token:", error);
      return null;
    }
  }

  /**
   * Get token info including scopes and expiry
   */
  static async getTokenInfo(accessToken: string): Promise<{
    isValid: boolean;
    type: string;
    scopes: string[];
    expiresAt: Date | null;
    hasRequiredScopes: boolean;
  }> {
    try {
      const response = await fetch(
        `https://graph.facebook.com/v18.0/debug_token?input_token=${accessToken}&access_token=${accessToken}`
      );
      
      const data: TokenValidationResponse = await response.json();
      
      if (!data.data || !data.data.is_valid) {
        return {
          isValid: false,
          type: "unknown",
          scopes: [],
          expiresAt: null,
          hasRequiredScopes: false,
        };
      }

      const requiredScopes = [
        "ads_management",
        "ads_read",
        "business_management",
        "catalog_management",
      ];

      const hasRequiredScopes = requiredScopes.every(scope =>
        data.data.scopes.includes(scope)
      );

      const expiresAt = data.data.expires_at === 0 
        ? null 
        : new Date(data.data.expires_at * 1000);

      return {
        isValid: true,
        type: data.data.type,
        scopes: data.data.scopes,
        expiresAt,
        hasRequiredScopes,
      };
    } catch (error) {
      console.error("Error getting token info:", error);
      return {
        isValid: false,
        type: "unknown",
        scopes: [],
        expiresAt: null,
        hasRequiredScopes: false,
      };
    }
  }
}
