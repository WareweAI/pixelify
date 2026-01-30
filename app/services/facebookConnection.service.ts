/**
 * Facebook Connection Manager Service
 * 
 * Manages Facebook connection state with atomic updates and complete cleanup.
 * Requirements: 2.2, 3.1, 3.2, 3.5, 4.4
 */

import { dataFetcher } from './dataFetcher.service';
import { localStorageService, type FacebookData } from './localStorage.service';

export interface ConnectionState {
  isConnected: boolean;
  data: FacebookData | null;
  isLoading: boolean;
  error: string | null;
  lastSync: Date | null;
}

class FacebookConnectionService {
  private state: ConnectionState = {
    isConnected: false,
    data: null,
    isLoading: false,
    error: null,
    lastSync: null,
  };

  private listeners = new Set<(state: ConnectionState) => void>();

  /**
   * Initialize connection state from server
   * Server is always the source of truth
   */
  async initialize(): Promise<ConnectionState> {
    this.setState({ isLoading: true, error: null });

    try {
      // Fetch from server first
      const serverData = await dataFetcher.fetchFromServer<{
        connected: boolean;
        data: FacebookData | null;
      }>('/api/facebook/status');

      // Update both server state and localStorage atomically
      await this.updateConnectionState(
        serverData.connected,
        serverData.data
      );

      return this.state;
    } catch (error) {
      // Fallback to localStorage only if server fails
      const localData = localStorageService.getFacebookData();
      
      this.setState({
        isConnected: !!localData,
        data: localData,
        isLoading: false,
        error: error instanceof Error ? error.message : 'Failed to initialize',
        lastSync: null,
      });

      return this.state;
    }
  }

  /**
   * Connect to Facebook with OAuth data
   */
  async connect(authData: FacebookData): Promise<boolean> {
    this.setState({ isLoading: true, error: null });

    try {
      // Update server first (atomic operation)
      const response = await dataFetcher.fetchFromServer<{
        success: boolean;
        data: FacebookData;
      }>('/api/facebook/connect', {
        skipCache: true,
      });

      if (!response.success) {
        throw new Error('Server connection failed');
      }

      // Update localStorage only after server confirms
      await this.updateConnectionState(true, response.data);

      return true;
    } catch (error) {
      this.setState({
        isLoading: false,
        error: error instanceof Error ? error.message : 'Connection failed',
      });
      return false;
    }
  }

  /**
   * Disconnect from Facebook with complete cleanup
   */
  async disconnect(): Promise<boolean> {
    this.setState({ isLoading: true, error: null });

    try {
      // Server cleanup first
      await dataFetcher.fetchFromServer<{ success: boolean }>(
        '/api/facebook/disconnect',
        { skipCache: true }
      );

      // Complete localStorage cleanup
      await this.completeCleanup();

      return true;
    } catch (error) {
      // Even if server fails, clean up localStorage
      await this.completeCleanup();
      
      this.setState({
        error: error instanceof Error ? error.message : 'Disconnect failed',
      });

      return false;
    }
  }

  /**
   * Update connection state atomically
   * Ensures server and localStorage are in sync
   */
  private async updateConnectionState(
    isConnected: boolean,
    data: FacebookData | null
  ): Promise<void> {
    // Update localStorage
    if (isConnected && data) {
      localStorageService.setFacebookData(data);
    } else {
      localStorageService.removeFacebookData();
    }

    // Update in-memory state
    this.setState({
      isConnected,
      data,
      isLoading: false,
      error: null,
      lastSync: new Date(),
    });
  }

  /**
   * Complete cleanup of all Facebook data
   */
  private async completeCleanup(): Promise<void> {
    // Clean up localStorage
    localStorageService.cleanupFacebookData();

    // Reset in-memory state
    this.setState({
      isConnected: false,
      data: null,
      isLoading: false,
      error: null,
      lastSync: new Date(),
    });
  }

  /**
   * Refresh connection state from server
   */
  async refresh(): Promise<ConnectionState> {
    return this.initialize();
  }

  /**
   * Get current connection state
   */
  getState(): ConnectionState {
    return { ...this.state };
  }

  /**
   * Subscribe to state changes
   */
  subscribe(listener: (state: ConnectionState) => void): () => void {
    this.listeners.add(listener);
    
    // Return unsubscribe function
    return () => {
      this.listeners.delete(listener);
    };
  }

  /**
   * Update state and notify listeners
   */
  private setState(updates: Partial<ConnectionState>): void {
    this.state = { ...this.state, ...updates };
    this.notifyListeners();
  }

  /**
   * Notify all listeners of state change
   */
  private notifyListeners(): void {
    const state = this.getState();
    for (const listener of this.listeners) {
      try {
        listener(state);
      } catch (error) {
        console.error('Error in connection state listener:', error);
      }
    }
  }

  /**
   * Check if currently connected
   */
  isConnected(): boolean {
    return this.state.isConnected;
  }

  /**
   * Get connection data
   */
  getData(): FacebookData | null {
    return this.state.data ? { ...this.state.data } : null;
  }

  /**
   * Check if operation is in progress
   */
  isLoading(): boolean {
    return this.state.isLoading;
  }

  /**
   * Get last error
   */
  getError(): string | null {
    return this.state.error;
  }

  /**
   * Clear error state
   */
  clearError(): void {
    this.setState({ error: null });
  }
}

// Singleton instance
export const facebookConnection = new FacebookConnectionService();
