/**
 * Client-side Facebook disconnect utility
 * Handles complete cleanup of Facebook connection data
 * Requirements: 3.1, 3.2, 3.5, 8.1, 8.2, 8.3, 8.4
 */

import { localStorageService } from '~/services/localStorage.service';
import { facebookConnection } from '~/services/facebookConnection.service';

export interface DisconnectOptions {
  onSuccess?: () => void;
  onError?: (error: string) => void;
  onComplete?: () => void;
}

/**
 * Perform complete Facebook disconnect with proper cleanup
 */
export async function disconnectFacebook(
  fetcher: any,
  options: DisconnectOptions = {}
): Promise<boolean> {
  const { onSuccess, onError, onComplete } = options;

  try {
    console.log('[FacebookDisconnect] Starting disconnect process...');

    // Step 1: Call server API to disconnect
    const response = await fetch('/api/dashboard', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: new URLSearchParams({
        intent: 'disconnect-facebook',
      }),
    });

    const data = await response.json();

    if (!data.success) {
      throw new Error(data.error || 'Disconnect failed');
    }

    console.log('[FacebookDisconnect] Server disconnect successful');

    // Step 2: Use facebookConnection service for atomic cleanup
    await facebookConnection.disconnect();
    console.log('[FacebookDisconnect] Connection service cleanup complete');

    // Step 3: Additional localStorage cleanup (belt and suspenders)
    localStorageService.cleanupFacebookData();
    console.log('[FacebookDisconnect] localStorage cleanup complete');

    // Step 4: Clear any Facebook SDK state
    if (typeof window !== 'undefined' && (window as any).FB) {
      try {
        (window as any).FB.getLoginStatus((response: any) => {
          if (response.status === 'connected') {
            (window as any).FB.logout();
            console.log('[FacebookDisconnect] Facebook SDK logout complete');
          }
        });
      } catch (err) {
        console.warn('[FacebookDisconnect] Facebook SDK logout failed:', err);
      }
    }

    console.log('[FacebookDisconnect] ✅ Disconnect complete');

    if (onSuccess) {
      onSuccess();
    }

    return true;
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Disconnect failed';
    console.error('[FacebookDisconnect] ❌ Error:', errorMessage);

    // Even on error, try to clean up client-side data
    try {
      localStorageService.cleanupFacebookData();
      await facebookConnection.disconnect();
    } catch (cleanupError) {
      console.error('[FacebookDisconnect] Cleanup error:', cleanupError);
    }

    if (onError) {
      onError(errorMessage);
    }

    return false;
  } finally {
    if (onComplete) {
      onComplete();
    }
  }
}

/**
 * Check if Facebook is currently connected
 */
export function isConnectedToFacebook(): boolean {
  // Check connection service first (server-first approach)
  const serviceConnected = facebookConnection.isConnected();
  
  if (serviceConnected) {
    return true;
  }

  // Fallback to localStorage check
  const localData = localStorageService.getFacebookData();
  return !!localData?.accessToken;
}

/**
 * Get Facebook connection data
 */
export function getFacebookConnectionData() {
  // Try connection service first
  const serviceData = facebookConnection.getData();
  
  if (serviceData) {
    return serviceData;
  }

  // Fallback to localStorage
  return localStorageService.getFacebookData();
}
