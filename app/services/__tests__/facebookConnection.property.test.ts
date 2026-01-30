/**
 * Property Tests for Facebook Connection Service
 * 
 * Property 2: Complete Disconnect Cleanup
 * Property 7: Atomic State Updates
 */

import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';
import { facebookConnection } from '../facebookConnection.service';
import { localStorageService } from '../localStorage.service';
import { dataFetcher } from '../dataFetcher.service';

describe('FacebookConnection Property Tests', () => {
  beforeEach(() => {
    localStorage.clear();
    vi.clearAllMocks();
    dataFetcher.cancelAllRequests();
    
    // Reset the connection service state
    facebookConnection['state'] = {
      isConnected: false,
      data: null,
      isLoading: false,
      error: null,
      lastSync: null,
    };
    facebookConnection['listeners'].clear();
  });

  afterEach(() => {
    dataFetcher.cancelAllRequests();
  });

  describe('Property 7: Atomic State Updates', () => {
    it('should update server and localStorage atomically on connect', async () => {
      global.fetch = vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({
          success: true,
          data: {
            accessToken: 'token-123',
            userId: 'user-123',
          },
        }),
      });

      const authData = {
        accessToken: 'token-123',
        userId: 'user-123',
      };

      await facebookConnection.connect(authData);

      // Check both server was called and localStorage updated
      expect(fetch).toHaveBeenCalledWith(
        '/api/facebook/connect',
        expect.any(Object)
      );
      
      const localData = localStorageService.getFacebookData();
      expect(localData).toEqual(authData);

      const state = facebookConnection.getState();
      expect(state.isConnected).toBe(true);
      expect(state.data).toEqual(authData);
    });

    it('should not update localStorage if server update fails', async () => {
      // Clear any previous state and ensure clean start
      localStorage.clear();
      dataFetcher.cancelAllRequests();
      
      global.fetch = vi.fn().mockRejectedValue(new Error('Server error'));

      const authData = {
        accessToken: 'token-123',
        userId: 'user-123',
      };

      const result = await facebookConnection.connect(authData);

      expect(result).toBe(false);
      expect(localStorageService.getFacebookData()).toBeNull();
      
      // The connection service should maintain consistent state
      const state = facebookConnection.getState();
      expect(state.isConnected).toBe(false);
      expect(state.error).toBeTruthy();
    }, 10000);

    it('should maintain consistency during concurrent operations', async () => {
      global.fetch = vi.fn().mockImplementation((url) => {
        if (url.includes('connect')) {
          return Promise.resolve({
            ok: true,
            json: async () => ({
              success: true,
              data: { accessToken: 'token' },
            }),
          });
        }
        if (url.includes('disconnect')) {
          return Promise.resolve({
            ok: true,
            json: async () => ({ success: true }),
          });
        }
        return Promise.reject(new Error('Unknown endpoint'));
      });

      // Try concurrent connect and disconnect
      const connectPromise = facebookConnection.connect({
        accessToken: 'token',
      });
      const disconnectPromise = facebookConnection.disconnect();

      await Promise.all([connectPromise, disconnectPromise]);

      // Final state should be consistent
      const state = facebookConnection.getState();
      const localData = localStorageService.getFacebookData();

      if (state.isConnected) {
        expect(localData).not.toBeNull();
      } else {
        expect(localData).toBeNull();
      }
    });
  });

  describe('Property 2: Complete Disconnect Cleanup', () => {
    it('should completely remove all Facebook data on disconnect', async () => {
      // Setup connected state
      localStorageService.setFacebookData({
        accessToken: 'token',
        userId: 'user',
        adAccountId: 'act_123',
      });
      localStorage.setItem('fb_access_token', 'token');
      localStorage.setItem('facebook_pixel_data', '{}');

      global.fetch = vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({ success: true }),
      });

      await facebookConnection.disconnect();

      // Verify complete cleanup
      expect(localStorageService.getFacebookData()).toBeNull();
      expect(localStorage.getItem('fb_access_token')).toBeNull();
      expect(localStorage.getItem('facebook_pixel_data')).toBeNull();

      const state = facebookConnection.getState();
      expect(state.isConnected).toBe(false);
      expect(state.data).toBeNull();
    });

    it('should cleanup localStorage even if server disconnect fails', async () => {
      localStorageService.setFacebookData({
        accessToken: 'token',
        userId: 'user',
      });

      global.fetch = vi.fn().mockRejectedValue(new Error('Server error'));

      await facebookConnection.disconnect();

      // Should still cleanup localStorage
      expect(localStorageService.getFacebookData()).toBeNull();
      expect(facebookConnection.isConnected()).toBe(false);
    }, 10000);

    it('should notify listeners of state changes', async () => {
      const listener = vi.fn();
      const unsubscribe = facebookConnection.subscribe(listener);

      global.fetch = vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({
          connected: true,
          data: { accessToken: 'token' },
        }),
      });

      await facebookConnection.initialize();

      expect(listener).toHaveBeenCalled();
      const lastCall = listener.mock.calls[listener.mock.calls.length - 1][0];
      expect(lastCall.isConnected).toBe(true);

      unsubscribe();
    });

    it('should handle multiple disconnect calls gracefully', async () => {
      global.fetch = vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({ success: true }),
      });

      await facebookConnection.disconnect();
      await facebookConnection.disconnect();
      await facebookConnection.disconnect();

      expect(facebookConnection.isConnected()).toBe(false);
      expect(localStorageService.getFacebookData()).toBeNull();
    });
  });

  describe('State Management', () => {
    it('should initialize from server on startup', async () => {
      global.fetch = vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({
          connected: true,
          data: {
            accessToken: 'server-token',
            userId: 'server-user',
          },
        }),
      });

      const state = await facebookConnection.initialize();

      expect(state.isConnected).toBe(true);
      expect(state.data?.accessToken).toBe('server-token');
      expect(fetch).toHaveBeenCalledWith(
        '/api/facebook/status',
        expect.any(Object)
      );
    });

    it('should fallback to localStorage if server fails', async () => {
      localStorageService.setFacebookData({
        accessToken: 'local-token',
        userId: 'local-user',
      });

      global.fetch = vi.fn().mockRejectedValue(new Error('Server down'));

      const state = await facebookConnection.initialize();

      expect(state.isConnected).toBe(true);
      expect(state.data?.accessToken).toBe('local-token');
      expect(state.error).toBeTruthy();
    }, 10000);

    it('should provide immutable state copies', () => {
      const state1 = facebookConnection.getState();
      const state2 = facebookConnection.getState();

      expect(state1).not.toBe(state2);
      expect(state1).toEqual(state2);
    });
  });
});
