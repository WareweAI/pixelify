/**
 * Custom hook for Facebook connection management
 * Integrates facebookConnection and localStorage services
 * Requirements: 2.2, 3.1, 3.2, 3.5, 4.4
 */

import { useState, useEffect, useCallback } from 'react';
import { facebookConnection, type ConnectionState } from '~/services/facebookConnection.service';
import { localStorageService, type FacebookData } from '~/services/localStorage.service';

export interface UseFacebookConnectionReturn {
  isConnected: boolean;
  isLoading: boolean;
  error: string | null;
  data: FacebookData | null;
  connect: (authData: FacebookData) => Promise<boolean>;
  disconnect: () => Promise<boolean>;
  refresh: () => Promise<void>;
  clearError: () => void;
}

export function useFacebookConnection(): UseFacebookConnectionReturn {
  const [state, setState] = useState<ConnectionState>({
    isConnected: false,
    data: null,
    isLoading: false,
    error: null,
    lastSync: null,
  });

  // Subscribe to connection state changes
  useEffect(() => {
    const unsubscribe = facebookConnection.subscribe((newState) => {
      setState(newState);
    });

    // Initialize connection state from server
    facebookConnection.initialize().catch((err) => {
      console.error('[useFacebookConnection] Failed to initialize:', err);
    });

    return unsubscribe;
  }, []);

  const connect = useCallback(async (authData: FacebookData): Promise<boolean> => {
    try {
      const success = await facebookConnection.connect(authData);
      
      if (success) {
        console.log('[useFacebookConnection] Connected successfully');
      } else {
        console.error('[useFacebookConnection] Connection failed');
      }
      
      return success;
    } catch (err) {
      console.error('[useFacebookConnection] Error during connect:', err);
      return false;
    }
  }, []);

  const disconnect = useCallback(async (): Promise<boolean> => {
    try {
      const success = await facebookConnection.disconnect();
      
      if (success) {
        console.log('[useFacebookConnection] Disconnected successfully');
        
        // Ensure complete cleanup of localStorage
        localStorageService.cleanupFacebookData();
      } else {
        console.error('[useFacebookConnection] Disconnect failed');
      }
      
      return success;
    } catch (err) {
      console.error('[useFacebookConnection] Error during disconnect:', err);
      
      // Even on error, try to clean up localStorage
      localStorageService.cleanupFacebookData();
      
      return false;
    }
  }, []);

  const refresh = useCallback(async (): Promise<void> => {
    try {
      await facebookConnection.refresh();
    } catch (err) {
      console.error('[useFacebookConnection] Error during refresh:', err);
    }
  }, []);

  const clearError = useCallback(() => {
    facebookConnection.clearError();
  }, []);

  return {
    isConnected: state.isConnected,
    isLoading: state.isLoading,
    error: state.error,
    data: state.data,
    connect,
    disconnect,
    refresh,
    clearError,
  };
}
