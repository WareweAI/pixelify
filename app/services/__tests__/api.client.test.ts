/**
 * Tests for API Client
 * 
 * Property 1: Server Data Precedence
 * Property 8: Correct API Endpoint Usage
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { apiClient } from '../api.client';
import { dataFetcher } from '../dataFetcher.service';

describe('APIClient Tests', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    dataFetcher.cancelAllRequests();
  });

  describe('Property 8: Correct API Endpoint Usage', () => {
    it('should call /api/dashboard for dashboard data', async () => {
      global.fetch = vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({
          apps: [],
          stats: { totalPixels: 0, totalEvents: 0, totalSessions: 0, todayEvents: 0 },
          hasValidFacebookToken: false,
        }),
      });

      await apiClient.getDashboardData();

      expect(fetch).toHaveBeenCalledWith(
        '/api/dashboard',
        expect.any(Object)
      );
    });

    it('should call /api/pixels for pixels data', async () => {
      global.fetch = vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({ pixels: [] }),
      });

      await apiClient.getPixels();

      expect(fetch).toHaveBeenCalledWith(
        '/api/pixels',
        expect.any(Object)
      );
    });
  });

  describe('Property 1: Server Data Precedence', () => {
    it('should return server data with dataSource marker', async () => {
      const mockData = {
        apps: [{ id: '1', name: 'Test App' }],
        stats: { totalPixels: 1, totalEvents: 100, totalSessions: 50, todayEvents: 10 },
        hasValidFacebookToken: true,
      };

      global.fetch = vi.fn().mockResolvedValue({
        ok: true,
        json: async () => mockData,
      });

      const result = await apiClient.getDashboardData();

      expect(result.dataSource).toBe('server');
      expect(result.apps).toEqual(mockData.apps);
      expect(result.lastUpdated).toBeInstanceOf(Date);
    });
  });

  describe('Disconnect Functionality', () => {
    it('should call disconnect endpoint with correct intent', async () => {
      global.fetch = vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({
          success: true,
          message: 'Disconnected',
          clearClientStorage: true,
        }),
      });

      const result = await apiClient.disconnectFacebook();

      expect(fetch).toHaveBeenCalledWith(
        '/api/dashboard',
        expect.objectContaining({
          method: 'POST',
        })
      );
      expect(result.success).toBe(true);
      expect(result.clearClientStorage).toBe(true);
    });

    it('should throw error on disconnect failure', async () => {
      global.fetch = vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({
          success: false,
          error: 'Disconnect failed',
        }),
      });

      await expect(apiClient.disconnectFacebook()).rejects.toThrow('Disconnect failed');
    });
  });

  describe('Request Management', () => {
    it('should check if request is pending', () => {
      const isPending = apiClient.isRequestPending('/api/dashboard');
      expect(typeof isPending).toBe('boolean');
    });

    it('should get pending request count', () => {
      const count = apiClient.getPendingRequestCount();
      expect(typeof count).toBe('number');
      expect(count).toBeGreaterThanOrEqual(0);
    });
  });
});
