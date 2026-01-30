/**
 * Custom hook for dashboard data fetching with server-first approach
 * Integrates dataFetcher and facebookConnection services
 * Requirements: 1.1, 1.4, 2.1, 2.5
 */

import { useState, useEffect, useCallback } from 'react';
import { dataFetcher } from '~/services/dataFetcher.service';
import { facebookConnection } from '~/services/facebookConnection.service';

export interface DashboardData {
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
}

export interface UseDashboardDataReturn {
  data: DashboardData | null;
  isLoading: boolean;
  error: string | null;
  refresh: () => Promise<void>;
  isConnectedToFacebook: boolean;
  facebookConnectionState: any;
}

export function useDashboardData(): UseDashboardDataReturn {
  const [data, setData] = useState<DashboardData | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [isConnectedToFacebook, setIsConnectedToFacebook] = useState(false);
  const [facebookConnectionState, setFacebookConnectionState] = useState<any>(null);

  // Subscribe to Facebook connection state changes
  useEffect(() => {
    const unsubscribe = facebookConnection.subscribe((state) => {
      setIsConnectedToFacebook(state.isConnected);
      setFacebookConnectionState(state);
    });

    // Initialize connection state
    facebookConnection.initialize().catch((err) => {
      console.error('[useDashboardData] Failed to initialize Facebook connection:', err);
    });

    return unsubscribe;
  }, []);

  const loadData = useCallback(async () => {
    try {
      setIsLoading(true);
      setError(null);

      // Use dataFetcher service for server-first approach
      const response = await dataFetcher.fetchFromServer<DashboardData>(
        '/api/dashboard',
        { skipCache: false }
      );

      setData(response);
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Failed to load dashboard data';
      setError(errorMessage);
      console.error('[useDashboardData] Error loading data:', err);

      // Set fallback data
      setData({
        apps: [],
        stats: {
          totalPixels: 0,
          totalEvents: 0,
          totalSessions: 0,
          todayEvents: 0,
        },
        hasValidFacebookToken: false,
        themeExtensionEnabled: false,
        recentPurchaseEvents: [],
        totalPurchaseEvents: 0,
        purchaseOffset: 0,
        purchaseLimit: 10,
        connectionError: true,
        dataSource: 'fallback',
      });
    } finally {
      setIsLoading(false);
    }
  }, []);

  const refresh = useCallback(async () => {
    await loadData();
  }, [loadData]);

  // Load data on mount
  useEffect(() => {
    loadData();
  }, [loadData]);

  return {
    data,
    isLoading,
    error,
    refresh,
    isConnectedToFacebook,
    facebookConnectionState,
  };
}
