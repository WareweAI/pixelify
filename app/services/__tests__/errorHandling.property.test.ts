/**
 * Property Tests for Error Handling
 * 
 * Task 12.1: Write property test for error handling
 * Property 5: Graceful Error Handling and Recovery
 * Requirements: 6.2, 6.4, 6.5
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { dataFetcher } from '../dataFetcher.service';
import { facebookConnection } from '../facebookConnection.service';
import { localStorageService } from '../localStorage.service';
import { apiClient } from '../api.client';

describe('Error Handling Property Tests', () => {
  beforeEach(() => {
    localStorage.clear();
    vi.clearAllMocks();
    dataFetcher.cancelAllRequests();
  });

  describe('Property 5: Graceful Error Handling and Recovery', () => {
    it('should handle network timeout errors gracefully', async () => {
      global.fetch = vi.fn().mockImplementation(
        () => new Promise((_, reject) => 
          setTimeout(() => reject(new Error('Network timeout')), 100)
        )
      );

      await expect(
        dataFetcher.fetchFromServer('/api/test', { timeout: 50, retryCount: 0 })
      ).rejects.toThrow();

      // System should still be functional
      expect(dataFetcher.getPendingRequestCount()).toBe(0);
    });

    it('should handle HTTP 500 errors with retry', async () => {
      let callCount = 0;
      global.fetch = vi.fn().mockImplementation(async () => {
        callCount++;
        if (callCount < 3) {
          return {
            ok: false,
            status: 500,
            statusText: 'Internal Server Error',
          };
        }
        return {
          ok: true,
          json: async () => ({ success: true }),
        };
      });

      const result = await dataFetcher.fetchFromServer('/api/test', {
        retryCount: 3,
      });

      expect(callCount).toBe(3);
      expect(result).toEqual({ success: true });
    });

    it('should handle HTTP 401 errors without retry', async () => {
      global.fetch = vi.fn().mockResolvedValue({
        ok: false,
        status: 401,
        statusText: 'Unauthorized',
      });

      await expect(
        dataFetcher.fetchFromServer('/api/test', { retryCount: 3 })
      ).rejects.toThrow('HTTP 401');

      // Should not retry on 4xx errors
      expect(fetch).toHaveBeenCalledTimes(1);
    });

    it('should handle corrupted localStorage data', () => {
      // Set various types of corrupted data
      localStorage.setItem('facebook_connection', 'not json');
      localStorage.setItem('facebook_user', '{incomplete');
      localStorage.setItem('facebook_pixels', '[]extra');

      // Should handle all gracefully
      expect(localStorageService.getFacebookData()).toBeNull();
      expect(localStorage.getItem('facebook_connection')).toBeNull();
    });

    it('should handle localStorage quota exceeded', () => {
      const originalSetItem = localStorage.setItem;
      
      localStorage.setItem = vi.fn().mockImplementation(() => {
        const error = new DOMException('QuotaExceededError');
        error.name = 'QuotaExceededError';
        error.code = 22;
        throw error;
      });

      const result = localStorageService.setFacebookData({
        accessToken: 'test-token',
      });

      expect(result).toBe(false);

      localStorage.setItem = originalSetItem;
    });

    it('should handle partial disconnect failures', async () => {
      // Setup connected state
      localStorageService.setFacebookData({
        accessToken: 'test-token',
        userId: 'user-123',
      });

      // Mock server disconnect to fail
      global.fetch = vi.fn().mockRejectedValue(new Error('Server error'));

      // Disconnect should still clean up localStorage
      await facebookConnection.disconnect();

      // localStorage should be cleaned up even if server fails
      expect(localStorageService.getFacebookData()).toBeNull();
      expect(facebookConnection.isConnected()).toBe(false);
    });

    it('should provide clear error messages for API failures', async () => {
      global.fetch = vi.fn().mockResolvedValue({
        ok: false,
        status: 503,
        statusText: 'Service Unavailable',
      });

      try {
        await apiClient.getDashboardData();
        expect.fail('Should have thrown error');
      } catch (error) {
        expect(error).toBeInstanceOf(Error);
        expect((error as Error).message).toContain('503');
      }
    });

    it('should handle concurrent errors without breaking state', async () => {
      global.fetch = vi.fn().mockRejectedValue(new Error('Network error'));

      // Make multiple concurrent failing requests
      const promises = [
        apiClient.getDashboardData().catch(e => e),
        apiClient.getDashboardData().catch(e => e),
        apiClient.getDashboardData().catch(e => e),
      ];

      const results = await Promise.all(promises);

      // All should fail gracefully
      results.forEach(result => {
        expect(result).toBeInstanceOf(Error);
      });

      // System should still be functional
      expect(dataFetcher.getPendingRequestCount()).toBe(0);
    });

    it('should handle missing data gracefully', async () => {
      global.fetch = vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({}), // Empty response
      });

      const result = await apiClient.getDashboardData();

      // Should have default values
      expect(result.dataSource).toBe('server');
      expect(result.lastUpdated).toBeInstanceOf(Date);
    });

    it('should recover from connection service errors', async () => {
      global.fetch = vi.fn().mockRejectedValue(new Error('Connection failed'));

      // Try to connect
      const success = await facebookConnection.connect({
        accessToken: 'test-token',
      });

      expect(success).toBe(false);

      // State should be consistent
      expect(facebookConnection.isConnected()).toBe(false);
      expect(facebookConnection.getError()).toBeTruthy();

      // Should be able to clear error and try again
      facebookConnection.clearError();
      expect(facebookConnection.getError()).toBeNull();
    });
  });

  describe('Error Recovery Mechanisms', () => {
    it('should allow retry after error', async () => {
      let callCount = 0;
      global.fetch = vi.fn().mockImplementation(async () => {
        callCount++;
        if (callCount === 1) {
          throw new Error('First attempt failed');
        }
        return {
          ok: true,
          json: async () => ({ success: true }),
        };
      });

      // First attempt fails
      await expect(
        dataFetcher.fetchFromServer('/api/test', { retryCount: 0 })
      ).rejects.toThrow();

      // Second attempt succeeds
      const result = await dataFetcher.fetchFromServer('/api/test', {
        retryCount: 0,
        skipCache: true,
      });

      expect(result).toEqual({ success: true });
    });

    it('should maintain data integrity during errors', async () => {
      // Set initial valid data
      localStorageService.setFacebookData({
        accessToken: 'valid-token',
        userId: 'user-123',
      });

      // Try to update with invalid data
      const originalSetItem = localStorage.setItem;
      localStorage.setItem = vi.fn().mockImplementation(() => {
        throw new Error('Storage error');
      });

      const result = localStorageService.setFacebookData({
        accessToken: 'new-token',
      });

      expect(result).toBe(false);

      // Original data should still be intact
      localStorage.setItem = originalSetItem;
      const data = localStorageService.getFacebookData();
      expect(data?.accessToken).toBe('valid-token');
    });
  });
});
