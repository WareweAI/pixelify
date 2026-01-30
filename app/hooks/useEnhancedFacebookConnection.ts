/**
 * Enhanced Facebook Connection Hook
 * 
 * Comprehensive hook that integrates all services for complete
 * Facebook connection management with proper state synchronization.
 * 
 * Properties: 1, 2, 3, 5, 6, 7, 9, 10, 11, 12
 * Requirements: All requirements 1-8
 */

import { useState, useEffect, useCallback, useRef } from 'react';
import { facebookConnection } from '~/services/facebookConnection.service';
import { localStorageService } from '~/services/localStorage.service';
import { apiClient } from '~/services/api.client';
import { stateSynchronization } from '~/services/stateSynchronization.service';
import { disconnectFacebook } from '~/utils/facebookDisconnect.client';

export interface EnhancedConnectionState {
  // Connection status
  isConnected: boolean;
  isLoading: boolean;
  error: string | null;
  
  // Facebook data
  accessToken: string | null;
  user: any | null;
  pixels: any[] | null;
  
  // Sync status
  lastSync: Date | null;
  dataSource: 'server' | 'localStorage' | 'unknown';
  
  // Server validation
  hasValidServerToken: boolean;
  serverValidated: boolean;
}

export interface UseEnhancedFacebookConnectionReturn {
  state: EnhancedConnectionState;
  connect: (authData: any) => Promise<boolean>;
  disconnect: () => Promise<boolean>;
  refresh: () => Promise<void>;
  validateWithServer: () => Promise<boolean>;
  clearError: () => void;
}

export function useEnhancedFacebookConnection(): UseEnhancedFacebookConnectionReturn {
  const [state, setState] = useState<EnhancedConnectionState>({
    isConnected: false,
    isLoading: true,
    error: null,
    accessToken: null,
    user: null,
    pixels: null,
    lastSync: null,
    dataSource: 'unknown',
    hasValidServerToken: false,
    serverValidated: false,
  });

  const isMounted = useRef(true);
  const initializationAttempted = useRef(false);

  // Property 9: Server Validation on Startup
  const validateWithServer = useCallback(async (): Promise<boolean> => {
    try {
      console.log('[useEnhancedFacebookConnection] Validating with server...');
      
      const dashboardData = await apiClient.getDashboardData({ skipCache: true });
      
      const hasValidToken = dashboardData.hasValidFacebookToken || false;
      
      if (isMounted.current) {
        setState(prev => ({
          ...prev,
          hasValidServerToken: hasValidToken,
          serverValidated: true,
          dataSource: 'server',
        }));
      }
      
      return hasValidToken;
    } catch (error) {
      console.error('[useEnhancedFacebookConnection] Server validation failed:', error);
      
      if (isMounted.current) {
        setState(prev => ({
          ...prev,
          serverValidated: true,
          error: 'Failed to validate with server',
        }));
      }
      
      return false;
    }
  }, []);

  // Property 1: Server Data Precedence + Property 9: Server Validation on Startup
  useEffect(() => {
    if (initializationAttempted.current) {
      return;
    }

    initializationAttempted.current = true;

    const initialize = async () => {
      try {
        console.log('[useEnhancedFacebookConnection] Initializing...');
        
        // Step 1: Initialize connection service (checks server first)
        const connectionState = await facebookConnection.initialize();
        
        // Step 2: Validate with server
        const hasValidServerToken = await validateWithServer();
        
        // Step 3: Update state based on server validation
        if (isMounted.current) {
          setState({
            isConnected: connectionState.isConnected && hasValidServerToken,
            isLoading: false,
            error: connectionState.error,
            accessToken: connectionState.data?.accessToken || null,
            user: connectionState.data?.userId ? { id: connectionState.data.userId } : null,
            pixels: null,
            lastSync: connectionState.lastSync,
            dataSource: hasValidServerToken ? 'server' : 'localStorage',
            hasValidServerToken,
            serverValidated: true,
          });
        }
        
        console.log('[useEnhancedFacebookConnection] Initialization complete');
      } catch (error) {
        console.error('[useEnhancedFacebookConnection] Initialization error:', error);
        
        // Property 10: Fallback Data Access
        const localData = localStorageService.getFacebookData();
        
        if (isMounted.current) {
          setState({
            isConnected: !!localData,
            isLoading: false,
            error: error instanceof Error ? error.message : 'Initialization failed',
            accessToken: localData?.accessToken || null,
            user: localData?.userId ? { id: localData.userId } : null,
            pixels: null,
            lastSync: null,
            dataSource: 'localStorage',
            hasValidServerToken: false,
            serverValidated: false,
          });
        }
      }
    };

    initialize();
  }, [validateWithServer]);

  // Property 3: Data Consistency Across Components
  useEffect(() => {
    const unsubscribeConnected = stateSynchronization.subscribe('facebook-connected', (data) => {
      console.log('[useEnhancedFacebookConnection] Facebook connected event received');
      
      if (isMounted.current) {
        setState(prev => ({
          ...prev,
          isConnected: true,
          accessToken: data?.accessToken || prev.accessToken,
          user: data?.user || prev.user,
          error: null,
        }));
      }
    });

    const unsubscribeDisconnected = stateSynchronization.subscribe('facebook-disconnected', () => {
      console.log('[useEnhancedFacebookConnection] Facebook disconnected event received');
      
      if (isMounted.current) {
        setState({
          isConnected: false,
          isLoading: false,
          error: null,
          accessToken: null,
          user: null,
          pixels: null,
          lastSync: new Date(),
          dataSource: 'server',
          hasValidServerToken: false,
          serverValidated: true,
        });
      }
    });

    return () => {
      unsubscribeConnected();
      unsubscribeDisconnected();
    };
  }, []);

  // Subscribe to connection service changes
  useEffect(() => {
    const unsubscribe = facebookConnection.subscribe((connectionState) => {
      if (isMounted.current) {
        setState(prev => ({
          ...prev,
          isConnected: connectionState.isConnected,
          isLoading: connectionState.isLoading,
          error: connectionState.error,
          accessToken: connectionState.data?.accessToken || null,
          lastSync: connectionState.lastSync,
        }));
      }
    });

    return unsubscribe;
  }, []);

  // Property 7: Atomic State Updates
  const connect = useCallback(async (authData: any): Promise<boolean> => {
    try {
      setState(prev => ({ ...prev, isLoading: true, error: null }));
      
      // Step 1: Connect via service (handles server + localStorage atomically)
      const success = await facebookConnection.connect(authData);
      
      if (!success) {
        throw new Error('Connection failed');
      }
      
      // Step 2: Save token to server
      await apiClient.saveFacebookToken(authData.accessToken);
      
      // Step 3: Notify all components
      stateSynchronization.notifyFacebookConnectionChange(true, authData);
      
      // Step 4: Update local state
      if (isMounted.current) {
        setState(prev => ({
          ...prev,
          isConnected: true,
          isLoading: false,
          accessToken: authData.accessToken,
          user: authData.user || null,
          hasValidServerToken: true,
          serverValidated: true,
          dataSource: 'server',
          lastSync: new Date(),
        }));
      }
      
      return true;
    } catch (error) {
      console.error('[useEnhancedFacebookConnection] Connect error:', error);
      
      if (isMounted.current) {
        setState(prev => ({
          ...prev,
          isLoading: false,
          error: error instanceof Error ? error.message : 'Connection failed',
        }));
      }
      
      return false;
    }
  }, []);

  // Property 2: Complete Disconnect Cleanup + Property 12: Disconnect Error Recovery
  const disconnect = useCallback(async (): Promise<boolean> => {
    try {
      setState(prev => ({ ...prev, isLoading: true, error: null }));
      
      // Use the comprehensive disconnect utility
      const success = await disconnectFacebook(null, {
        onSuccess: () => {
          console.log('[useEnhancedFacebookConnection] Disconnect successful');
          
          // Notify all components
          stateSynchronization.notifyFacebookConnectionChange(false);
          
          // Update local state
          if (isMounted.current) {
            setState({
              isConnected: false,
              isLoading: false,
              error: null,
              accessToken: null,
              user: null,
              pixels: null,
              lastSync: new Date(),
              dataSource: 'server',
              hasValidServerToken: false,
              serverValidated: true,
            });
          }
        },
        onError: (error) => {
          console.error('[useEnhancedFacebookConnection] Disconnect error:', error);
          
          if (isMounted.current) {
            setState(prev => ({
              ...prev,
              isLoading: false,
              error,
            }));
          }
        },
      });
      
      return success;
    } catch (error) {
      console.error('[useEnhancedFacebookConnection] Disconnect error:', error);
      
      if (isMounted.current) {
        setState(prev => ({
          ...prev,
          isLoading: false,
          error: error instanceof Error ? error.message : 'Disconnect failed',
        }));
      }
      
      return false;
    }
  }, []);

  // Refresh connection state
  const refresh = useCallback(async (): Promise<void> => {
    try {
      setState(prev => ({ ...prev, isLoading: true }));
      
      await facebookConnection.refresh();
      await validateWithServer();
      
      if (isMounted.current) {
        setState(prev => ({ ...prev, isLoading: false }));
      }
    } catch (error) {
      console.error('[useEnhancedFacebookConnection] Refresh error:', error);
      
      if (isMounted.current) {
        setState(prev => ({
          ...prev,
          isLoading: false,
          error: error instanceof Error ? error.message : 'Refresh failed',
        }));
      }
    }
  }, [validateWithServer]);

  const clearError = useCallback(() => {
    setState(prev => ({ ...prev, error: null }));
    facebookConnection.clearError();
  }, []);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      isMounted.current = false;
    };
  }, []);

  return {
    state,
    connect,
    disconnect,
    refresh,
    validateWithServer,
    clearError,
  };
}
