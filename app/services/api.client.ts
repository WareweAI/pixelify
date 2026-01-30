/**
 * Enhanced API Client
 * 
 * Provides centralized API communication with request management,
 * error handling, and proper loading state coordination.
 * 
 * Requirements: 1.1, 1.2, 1.5, 4.1, 4.3, 4.5, 5.1
 */

import { dataFetcher } from './dataFetcher.service';

export interface RequestOptions {
  skipCache?: boolean;
  timeout?: number;
  retryCount?: number;
}

export interface DashboardResponse {
  apps: any[];
  stats: {
    totalPixels: number;
    totalEvents: number;
    totalSessions: number;
    todayEvents: number;
  };
  hasValidFacebookToken: boolean;
  themeExtensionEnabled: boolean;
  recentPurchaseEvents: any[];
  totalPurchaseEvents: number;
  purchaseOffset: number;
  purchaseLimit: number;
  connectionError: boolean;
  dataSource?: 'server' | 'localStorage' | 'fallback';
  lastUpdated?: Date;
}

export interface PixelsResponse {
  pixels: any[];
  dataSource?: 'server' | 'localStorage';
}

export interface DisconnectResponse {
  success: boolean;
  message: string;
  clearClientStorage?: boolean;
  serverCleared?: boolean;
  localStorageCleared?: boolean;
  errors?: string[];
}

export interface SaveTokenResponse {
  success: boolean;
  message?: string;
  error?: string;
}

class APIClient {
  /**
   * Get dashboard data from server
   * Property 1: Server Data Precedence
   * Property 8: Correct API Endpoint Usage
   */
  async getDashboardData(options: RequestOptions = {}): Promise<DashboardResponse> {
    try {
      const data = await dataFetcher.fetchFromServer<DashboardResponse>(
        '/api/dashboard',
        options
      );
      
      return {
        ...data,
        dataSource: 'server',
        lastUpdated: new Date(),
      };
    } catch (error) {
      console.error('[APIClient] Failed to fetch dashboard data:', error);
      throw error;
    }
  }

  /**
   * Get pixels data from server
   * Property 1: Server Data Precedence
   * Property 8: Correct API Endpoint Usage
   */
  async getPixels(options: RequestOptions = {}): Promise<PixelsResponse> {
    try {
      const data = await dataFetcher.fetchFromServer<PixelsResponse>(
        '/api/pixels',
        options
      );
      
      return {
        ...data,
        dataSource: 'server',
      };
    } catch (error) {
      console.error('[APIClient] Failed to fetch pixels:', error);
      throw error;
    }
  }

  /**
   * Save Facebook token to server
   * Property 7: Atomic State Updates
   */
  async saveFacebookToken(token: string): Promise<SaveTokenResponse> {
    try {
      const response = await fetch('/api/dashboard', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded',
        },
        body: new URLSearchParams({
          intent: 'save-facebook-token',
          accessToken: token,
        }),
      });

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${response.statusText}`);
      }

      const data = await response.json();
      return data;
    } catch (error) {
      console.error('[APIClient] Failed to save Facebook token:', error);
      throw error;
    }
  }

  /**
   * Disconnect from Facebook with complete cleanup
   * Property 2: Complete Disconnect Cleanup
   * Property 11: Cache Coordination
   */
  async disconnectFacebook(): Promise<DisconnectResponse> {
    try {
      const response = await fetch('/api/dashboard', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded',
        },
        body: new URLSearchParams({
          intent: 'disconnect-facebook',
        }),
      });

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${response.statusText}`);
      }

      const data = await response.json();
      
      if (!data.success) {
        throw new Error(data.error || 'Disconnect failed');
      }

      return {
        success: true,
        message: data.message || 'Disconnected successfully',
        clearClientStorage: data.clearClientStorage || true,
        serverCleared: true,
        localStorageCleared: false, // Will be set by client-side cleanup
      };
    } catch (error) {
      console.error('[APIClient] Failed to disconnect Facebook:', error);
      throw error;
    }
  }

  /**
   * Refresh Facebook token
   * Property 5: Graceful Error Handling and Recovery
   */
  async refreshFacebookToken(): Promise<SaveTokenResponse> {
    try {
      const response = await fetch('/api/facebook/refresh-token', {
        method: 'POST',
      });

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${response.statusText}`);
      }

      const data = await response.json();
      return data;
    } catch (error) {
      console.error('[APIClient] Failed to refresh Facebook token:', error);
      throw error;
    }
  }

  /**
   * Create a new pixel
   */
  async createPixel(pixelData: any): Promise<any> {
    try {
      const response = await fetch('/api/dashboard', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded',
        },
        body: new URLSearchParams({
          intent: 'create-pixel',
          ...pixelData,
        }),
      });

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${response.statusText}`);
      }

      return await response.json();
    } catch (error) {
      console.error('[APIClient] Failed to create pixel:', error);
      throw error;
    }
  }

  /**
   * Update pixel status
   */
  async updatePixelStatus(pixelId: string, enabled: boolean): Promise<any> {
    try {
      const response = await fetch('/api/dashboard', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded',
        },
        body: new URLSearchParams({
          intent: 'update-pixel-status',
          pixelId,
          enabled: enabled.toString(),
        }),
      });

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${response.statusText}`);
      }

      return await response.json();
    } catch (error) {
      console.error('[APIClient] Failed to update pixel status:', error);
      throw error;
    }
  }

  /**
   * Check if a request is currently pending
   * Property 4: Request Management and Deduplication
   */
  isRequestPending(endpoint: string): boolean {
    return dataFetcher.isRequestPending(endpoint);
  }

  /**
   * Cancel a specific request
   * Property 4: Request Management and Deduplication
   */
  cancelRequest(endpoint: string): void {
    dataFetcher.cancelRequest(endpoint);
  }

  /**
   * Cancel all pending requests
   */
  cancelAllRequests(): void {
    dataFetcher.cancelAllRequests();
  }

  /**
   * Get number of pending requests
   */
  getPendingRequestCount(): number {
    return dataFetcher.getPendingRequestCount();
  }
}

// Singleton instance
export const apiClient = new APIClient();
