/**
 * Property Tests for Data Fetcher Service
 * 
 * Property 1: Server Data Precedence
 * Property 4: Request Management and Deduplication
 */

import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';
import { dataFetcher } from '../dataFetcher.service';

describe('DataFetcher Property Tests', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    dataFetcher.cancelAllRequests();
  });

  afterEach(() => {
    dataFetcher.cancelAllRequests();
  });

  describe('Property 1: Server Data Precedence', () => {
    it('should always fetch from server first, never localStorage', async () => {
      // Mock successful server response
      global.fetch = vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({ data: 'server-data' }),
      });

      const result = await dataFetcher.fetchFromServer('/api/test');
      
      expect(fetch).toHaveBeenCalledWith(
        '/api/test',
        expect.objectContaining({
          headers: { 'Content-Type': 'application/json' },
        })
      );
      expect(result).toEqual({ data: 'server-data' });
    });

    it('should retry failed requests with exponential backoff', async () => {
      let callCount = 0;
      global.fetch = vi.fn().mockImplementation(() => {
        callCount++;
        if (callCount < 3) {
          return Promise.reject(new Error('Network error'));
        }
        return Promise.resolve({
          ok: true,
          json: async () => ({ success: true }),
        });
      });

      const result = await dataFetcher.fetchFromServer('/api/test', {
        retryCount: 3,
      });

      expect(callCount).toBe(3);
      expect(result).toEqual({ success: true });
    });

    it('should throw error after max retries exceeded', async () => {
      global.fetch = vi.fn().mockRejectedValue(new Error('Network error'));

      await expect(
        dataFetcher.fetchFromServer('/api/test', { retryCount: 2 })
      ).rejects.toThrow('Network error');

      expect(fetch).toHaveBeenCalledTimes(3); // Initial + 2 retries
    });
  });

  describe('Property 4: Request Management and Deduplication', () => {
    it('should deduplicate identical concurrent requests', async () => {
      global.fetch = vi.fn().mockImplementation(() =>
        new Promise(resolve =>
          setTimeout(
            () =>
              resolve({
                ok: true,
                json: async () => ({ data: 'test' }),
              }),
            100
          )
        )
      );

      // Fire multiple identical requests concurrently
      const promises = [
        dataFetcher.fetchFromServer('/api/test'),
        dataFetcher.fetchFromServer('/api/test'),
        dataFetcher.fetchFromServer('/api/test'),
      ];

      const results = await Promise.all(promises);

      // Should only make one actual fetch call
      expect(fetch).toHaveBeenCalledTimes(1);
      expect(results).toEqual([
        { data: 'test' },
        { data: 'test' },
        { data: 'test' },
      ]);
    });

    it('should not deduplicate requests with skipCache option', async () => {
      global.fetch = vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({ data: 'test' }),
      });

      await dataFetcher.fetchFromServer('/api/test', { skipCache: true });
      await dataFetcher.fetchFromServer('/api/test', { skipCache: true });

      expect(fetch).toHaveBeenCalledTimes(2);
    });

    it('should track pending requests correctly', async () => {
      global.fetch = vi.fn().mockImplementation(() =>
        new Promise(resolve =>
          setTimeout(
            () =>
              resolve({
                ok: true,
                json: async () => ({ data: 'test' }),
              }),
            100
          )
        )
      );

      const promise = dataFetcher.fetchFromServer('/api/test');
      
      expect(dataFetcher.isRequestPending('/api/test')).toBe(true);
      expect(dataFetcher.getPendingRequestCount()).toBe(1);

      await promise;

      expect(dataFetcher.isRequestPending('/api/test')).toBe(false);
      expect(dataFetcher.getPendingRequestCount()).toBe(0);
    });

    it('should cancel requests when requested', async () => {
      global.fetch = vi.fn().mockImplementation(
        (_, options: any) =>
          new Promise((resolve, reject) => {
            const timeout = setTimeout(
              () =>
                resolve({
                  ok: true,
                  json: async () => ({ data: 'test' }),
                }),
              1000
            );

            // Listen for abort signal
            if (options?.signal) {
              options.signal.addEventListener('abort', () => {
                clearTimeout(timeout);
                reject(new Error('Request aborted'));
              });
            }
          })
      );

      const promise = dataFetcher.fetchFromServer('/api/test');
      
      // Cancel immediately
      dataFetcher.cancelRequest('/api/test');

      await expect(promise).rejects.toThrow();
    });

    it('should handle request timeout', async () => {
      global.fetch = vi.fn().mockImplementation(
        (_, options: any) =>
          new Promise((resolve, reject) => {
            const timeout = setTimeout(
              () =>
                resolve({
                  ok: true,
                  json: async () => ({ data: 'test' }),
                }),
              5000
            );

            // Listen for abort signal
            if (options?.signal) {
              options.signal.addEventListener('abort', () => {
                clearTimeout(timeout);
                reject(new Error('Request aborted'));
              });
            }
          })
      );

      await expect(
        dataFetcher.fetchFromServer('/api/test', { timeout: 100 })
      ).rejects.toThrow('Request timeout');
    }, 10000);
  });
});
