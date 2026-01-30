/**
 * Tests for State Synchronization Service
 * 
 * Property 3: Data Consistency Across Components
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { stateSynchronization } from '../stateSynchronization.service';

describe('StateSynchronization Tests', () => {
  beforeEach(() => {
    stateSynchronization.clearAllListeners();
    stateSynchronization.clearAllState();
  });

  describe('Property 3: Data Consistency Across Components', () => {
    it('should notify all subscribers when Facebook connection changes', () => {
      const listener1 = vi.fn();
      const listener2 = vi.fn();

      stateSynchronization.subscribe('facebook-connected', listener1);
      stateSynchronization.subscribe('facebook-connected', listener2);

      const testData = { accessToken: 'test-token', user: { id: '123' } };
      stateSynchronization.notifyFacebookConnectionChange(true, testData);

      expect(listener1).toHaveBeenCalledWith(testData);
      expect(listener2).toHaveBeenCalledWith(testData);
    });

    it('should update global state when Facebook connection changes', () => {
      stateSynchronization.notifyFacebookConnectionChange(true);

      expect(stateSynchronization.isFacebookConnected()).toBe(true);

      stateSynchronization.notifyFacebookConnectionChange(false);

      expect(stateSynchronization.isFacebookConnected()).toBe(false);
    });

    it('should notify subscribers of pixel data changes', () => {
      const listener = vi.fn();

      stateSynchronization.subscribe('pixel-created', listener);

      const pixelData = { id: '1', name: 'Test Pixel' };
      stateSynchronization.notifyPixelDataChange('created', pixelData);

      expect(listener).toHaveBeenCalledWith(pixelData);
    });

    it('should handle multiple event types independently', () => {
      const connectListener = vi.fn();
      const disconnectListener = vi.fn();
      const pixelListener = vi.fn();

      stateSynchronization.subscribe('facebook-connected', connectListener);
      stateSynchronization.subscribe('facebook-disconnected', disconnectListener);
      stateSynchronization.subscribe('pixel-created', pixelListener);

      stateSynchronization.emit('facebook-connected', { test: 'data' });

      expect(connectListener).toHaveBeenCalled();
      expect(disconnectListener).not.toHaveBeenCalled();
      expect(pixelListener).not.toHaveBeenCalled();
    });

    it('should allow unsubscribing from events', () => {
      const listener = vi.fn();

      const unsubscribe = stateSynchronization.subscribe('facebook-connected', listener);

      stateSynchronization.emit('facebook-connected', {});
      expect(listener).toHaveBeenCalledTimes(1);

      unsubscribe();

      stateSynchronization.emit('facebook-connected', {});
      expect(listener).toHaveBeenCalledTimes(1); // Still 1, not called again
    });

    it('should handle errors in listeners gracefully', () => {
      const errorListener = vi.fn().mockImplementation(() => {
        throw new Error('Listener error');
      });
      const normalListener = vi.fn();

      stateSynchronization.subscribe('facebook-connected', errorListener);
      stateSynchronization.subscribe('facebook-connected', normalListener);

      // Should not throw
      expect(() => {
        stateSynchronization.emit('facebook-connected', {});
      }).not.toThrow();

      // Normal listener should still be called
      expect(normalListener).toHaveBeenCalled();
    });
  });

  describe('State Management', () => {
    it('should set and get state values', () => {
      stateSynchronization.setState('testKey', 'testValue');

      expect(stateSynchronization.getState('testKey')).toBe('testValue');
    });

    it('should clear specific state values', () => {
      stateSynchronization.setState('testKey', 'testValue');
      stateSynchronization.clearState('testKey');

      expect(stateSynchronization.getState('testKey')).toBeUndefined();
    });

    it('should clear all state', () => {
      stateSynchronization.setState('key1', 'value1');
      stateSynchronization.setState('key2', 'value2');

      stateSynchronization.clearAllState();

      expect(stateSynchronization.getState('key1')).toBeUndefined();
      expect(stateSynchronization.getState('key2')).toBeUndefined();
    });

    it('should emit state change events when state is updated', () => {
      const listener = vi.fn();

      stateSynchronization.subscribe('connection-state-changed', listener);

      stateSynchronization.setState('testKey', 'newValue');

      expect(listener).toHaveBeenCalledWith({
        key: 'testKey',
        oldValue: undefined,
        newValue: 'newValue',
      });
    });
  });

  describe('Listener Management', () => {
    it('should track listener count correctly', () => {
      expect(stateSynchronization.getListenerCount()).toBe(0);

      const unsubscribe1 = stateSynchronization.subscribe('facebook-connected', vi.fn());
      expect(stateSynchronization.getListenerCount()).toBe(1);

      const unsubscribe2 = stateSynchronization.subscribe('facebook-disconnected', vi.fn());
      expect(stateSynchronization.getListenerCount()).toBe(2);

      unsubscribe1();
      expect(stateSynchronization.getListenerCount()).toBe(1);

      unsubscribe2();
      expect(stateSynchronization.getListenerCount()).toBe(0);
    });

    it('should get listener count for specific event type', () => {
      stateSynchronization.subscribe('facebook-connected', vi.fn());
      stateSynchronization.subscribe('facebook-connected', vi.fn());
      stateSynchronization.subscribe('facebook-disconnected', vi.fn());

      expect(stateSynchronization.getListenerCount('facebook-connected')).toBe(2);
      expect(stateSynchronization.getListenerCount('facebook-disconnected')).toBe(1);
    });
  });
});
