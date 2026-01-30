/**
 * Property Tests for LocalStorage Service
 * 
 * Property 5: Graceful Error Handling and Recovery
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { localStorageService } from '../localStorage.service';

describe('LocalStorage Property Tests', () => {
  beforeEach(() => {
    localStorage.clear();
    vi.clearAllMocks();
  });

  describe('Property 5: Graceful Error Handling and Recovery', () => {
    it('should handle corrupted JSON data gracefully', () => {
      // Manually set corrupted data
      localStorage.setItem('facebook_connection', '{invalid json}');

      const result = localStorageService.getFacebookData();

      expect(result).toBeNull();
      // Should clean up corrupted data
      expect(localStorage.getItem('facebook_connection')).toBeNull();
    });

    it('should handle localStorage unavailability', () => {
      // Mock localStorage as unavailable
      const originalGetItem = Storage.prototype.getItem;
      Storage.prototype.getItem = vi.fn().mockImplementation(() => {
        throw new Error('localStorage not available');
      });

      const result = localStorageService.getFacebookData();

      expect(result).toBeNull();

      // Restore
      Storage.prototype.getItem = originalGetItem;
    });

    it('should handle quota exceeded errors', () => {
      // Store original
      const originalSetItem = localStorage.setItem;
      
      // Mock to throw quota error
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

      // Restore
      localStorage.setItem = originalSetItem;
    });

    it('should successfully store and retrieve Facebook data', () => {
      const testData = {
        accessToken: 'test-token',
        userId: 'user-123',
        adAccountId: 'act_123',
      };

      const setResult = localStorageService.setFacebookData(testData);
      expect(setResult).toBe(true);

      const retrieved = localStorageService.getFacebookData();
      expect(retrieved).toEqual(testData);
    });

    it('should update Facebook data partially', () => {
      localStorageService.setFacebookData({
        accessToken: 'token-1',
        userId: 'user-1',
      });

      localStorageService.updateFacebookData({
        adAccountId: 'act-123',
      });

      const result = localStorageService.getFacebookData();
      expect(result).toEqual({
        accessToken: 'token-1',
        userId: 'user-1',
        adAccountId: 'act-123',
      });
    });

    it('should completely cleanup all Facebook data', () => {
      // Set various Facebook-related keys
      localStorageService.setFacebookData({ accessToken: 'token' });
      localStorage.setItem('fb_access_token', 'token');
      localStorage.setItem('fb_user_id', 'user');
      localStorage.setItem('facebook_pixel_data', '{}');

      localStorageService.cleanupFacebookData();

      expect(localStorageService.getFacebookData()).toBeNull();
      expect(localStorage.getItem('fb_access_token')).toBeNull();
      expect(localStorage.getItem('fb_user_id')).toBeNull();
      expect(localStorage.getItem('facebook_pixel_data')).toBeNull();
    });

    it('should check localStorage availability correctly', () => {
      expect(localStorageService.isAvailable()).toBe(true);

      // Store originals
      const originalSetItem = localStorage.setItem;
      const originalRemoveItem = localStorage.removeItem;
      
      // Mock unavailable
      localStorage.setItem = vi.fn().mockImplementation(() => {
        throw new Error('Not available');
      });
      localStorage.removeItem = vi.fn();

      expect(localStorageService.isAvailable()).toBe(false);

      // Restore
      localStorage.setItem = originalSetItem;
      localStorage.removeItem = originalRemoveItem;
    });

    it('should calculate storage size', () => {
      // Manually set data to ensure it's in storage
      localStorage.setItem('test-key', 'test-value');
      localStorage.setItem('facebook_connection', JSON.stringify({
        accessToken: 'test-token-123',
        userId: 'user-456',
      }));

      // Force a fresh calculation
      const size = localStorageService.getStorageSize();
      
      // Should be greater than 0 since we added data
      expect(size).toBeGreaterThan(0);
      
      // Clean up
      localStorage.removeItem('test-key');
    });
  });
});
