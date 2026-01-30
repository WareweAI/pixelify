/**
 * Integration Tests for Facebook Connection
 * 
 * Task 10.1: Write integration tests for Facebook components
 * Task 13.1: Write end-to-end integration tests
 * 
 * Property 3: Data Consistency Across Components
 * Property 6: UI State Consistency and Feedback
 * Requirements: 7.1, 7.2, 7.3
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { facebookConnection } from '~/services/facebookConnection.service';
import { localStorageService } from '~/services/localStorage.service';
import { apiClient } from '~/services/api.client';
import { stateSynchronization } from '~/services/stateSynchronization.service';
import { dataFetcher } from '~/services/dataFetcher.service';

describe('Facebook Connection Integration Tests', () => {
  beforeEach(() => {
    localStorage.clear();
    vi.clearAllMocks();
    dataFetcher.cancelAllRequests();
    stateSynchronization.clearAllListeners();
    stateSynchronization.clearAllState();
  });

  describe('Complete OAuth Flow', () => {
    it('should handle complete connection flow with all services', async () => {
      // Mock server responses
      global.fetch = vi.fn()
        .mockResolvedValueOnce({
          ok: true,
          json: async () => ({
            success: true,
            data: {
              accessToken: 'test-token',
              userId: 'user-123',
            },
          }),
        })
        .mockResolvedValueOnce({
          ok: true,
          json: async () => ({
            success: true,
            message: 'Token saved',
          }),
        });

      const authData = {
        accessToken: 'test-token',
        userId: 'user-123',
      };

      // Step 1: Connect via connection service
      const connectSuccess = await facebookConnection.connect(authData);
      expect(connectSuccess).toBe(true);

      // Step 2: Verify localStorage was updated
      const localData = localStorageService.getFacebookData();
      expect(localData).toEqual(authData);

      // Step 3: Verify connection state
      expect(facebookConnection.isConnected()).toBe(true);
      expect(facebookConnection.getData()).toEqual(authData);
    });

    it('should synchronize state across components', async () => {
      const listener1 = vi.fn();
      const listener2 = vi.fn();

      // Subscribe multiple components
      stateSynchronization.subscribe('facebook-connected', listener1);
      stateSynchronization.subscribe('facebook-connected', listener2);

      // Trigger connection change
      stateSynchronization.notifyFacebookConnectionChange(true, {
        accessToken: 'test-token',
      });

      // Both listeners should be notified
      expect(listener1).toHaveBeenCalled();
      expect(listener2).toHaveBeenCalled();

      // Global state should be updated
      expect(stateSynchronization.isFacebookConnected()).toBe(true);
    });
  });

  describe('Complete Disconnect Flow', () => {
    it('should handle complete disconnect with all cleanup', async () => {
      // Setup: Connected state
      localStorageService.setFacebookData({
        accessToken: 'test-token',
        userId: 'user-123',
      });

      global.fetch = vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({
          success: true,
          message: 'Disconnected',
          clearClientStorage: true,
        }),
      });

      // Step 1: Disconnect
      const disconnectSuccess = await facebookConnection.disconnect();
      expect(disconnectSuccess).toBe(true);

      // Step 2: Verify localStorage was cleared
      expect(localStorageService.getFacebookData()).toBeNull();

      // Step 3: Verify connection state
      expect(facebookConnection.isConnected()).toBe(false);
      expect(facebookConnection.getData()).toBeNull();
    });

    it('should notify all components of disconnect', async () => {
      const listener = vi.fn();

      stateSynchronization.subscribe('facebook-disconnected', listener);

      // Trigger disconnect
      stateSynchronization.notifyFacebookConnectionChange(false);

      expect(listener).toHaveBeenCalled();
      expect(stateSynchronization.isFacebookConnected()).toBe(false);
    });
  });

  describe('Data Consistency Across Routes', () => {
    it('should maintain consistent data between dashboard and pixels routes', async () => {
      const mockDashboardData = {
        apps: [{ id: '1', name: 'Test App' }],
        stats: { totalPixels: 1, totalEvents: 100, totalSessions: 50, todayEvents: 10 },
        hasValidFacebookToken: true,
      };

      const mockPixelsData = {
        pixels: [{ id: '1', name: 'Test Pixel' }],
      };

      global.fetch = vi.fn()
        .mockResolvedValueOnce({
          ok: true,
          json: async () => mockDashboardData,
        })
        .mockResolvedValueOnce({
          ok: true,
          json: async () => mockPixelsData,
        });

      // Fetch dashboard data
      const dashboardData = await apiClient.getDashboardData();
      expect(dashboardData.hasValidFacebookToken).toBe(true);

      // Fetch pixels data
      const pixelsData = await apiClient.getPixels();
      expect(pixelsData.pixels).toHaveLength(1);

      // Both should indicate server as data source
      expect(dashboardData.dataSource).toBe('server');
      expect(pixelsData.dataSource).toBe('server');
    });
  });

  describe('Error Recovery', () => {
    it('should handle server errors gracefully', async () => {
      global.fetch = vi.fn().mockRejectedValue(new Error('Server error'));

      await expect(
        apiClient.getDashboardData()
      ).rejects.toThrow('Server error');

      // Should not break the application
      expect(facebookConnection.isConnected()).toBeDefined();
    });

    it('should recover from localStorage corruption', () => {
      // Set corrupted data
      localStorage.setItem('facebook_connection', '{invalid json}');

      // Should handle gracefully
      const data = localStorageService.getFacebookData();
      expect(data).toBeNull();

      // Corrupted data should be cleaned up
      expect(localStorage.getItem('facebook_connection')).toBeNull();
    });
  });

  describe('Request Deduplication', () => {
    it('should deduplicate concurrent requests', async () => {
      let fetchCallCount = 0;

      global.fetch = vi.fn().mockImplementation(async () => {
        fetchCallCount++;
        await new Promise(resolve => setTimeout(resolve, 100));
        return {
          ok: true,
          json: async () => ({ apps: [], stats: {} }),
        };
      });

      // Make multiple concurrent requests
      const promises = [
        apiClient.getDashboardData(),
        apiClient.getDashboardData(),
        apiClient.getDashboardData(),
      ];

      await Promise.all(promises);

      // Should only make one actual fetch call
      expect(fetchCallCount).toBe(1);
    });
  });
});
