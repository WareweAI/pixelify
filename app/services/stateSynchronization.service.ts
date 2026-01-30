/**
 * State Synchronization Service
 * 
 * Ensures data consistency across all UI components by coordinating
 * state updates and providing a centralized event system.
 * 
 * Property 3: Data Consistency Across Components
 * Requirements: 1.3, 4.2, 5.2, 7.1, 7.2, 7.3, 7.4
 */

type EventType = 
  | 'facebook-connected'
  | 'facebook-disconnected'
  | 'facebook-token-refreshed'
  | 'pixel-created'
  | 'pixel-updated'
  | 'pixel-deleted'
  | 'dashboard-data-updated'
  | 'pixels-data-updated'
  | 'connection-state-changed';

type EventListener = (data: any) => void;

class StateSynchronizationService {
  private listeners: Map<EventType, Set<EventListener>> = new Map();
  private state: Map<string, any> = new Map();

  /**
   * Subscribe to state change events
   */
  subscribe(eventType: EventType, listener: EventListener): () => void {
    if (!this.listeners.has(eventType)) {
      this.listeners.set(eventType, new Set());
    }

    this.listeners.get(eventType)!.add(listener);

    // Return unsubscribe function
    return () => {
      this.listeners.get(eventType)?.delete(listener);
    };
  }

  /**
   * Emit an event to all subscribers
   */
  emit(eventType: EventType, data: any): void {
    console.log(`[StateSynchronization] Emitting event: ${eventType}`, data);

    const listeners = this.listeners.get(eventType);
    if (!listeners) {
      return;
    }

    for (const listener of listeners) {
      try {
        listener(data);
      } catch (error) {
        console.error(`[StateSynchronization] Error in listener for ${eventType}:`, error);
      }
    }
  }

  /**
   * Set global state value
   */
  setState(key: string, value: any): void {
    const oldValue = this.state.get(key);
    this.state.set(key, value);

    // Emit state change event
    this.emit('connection-state-changed' as EventType, {
      key,
      oldValue,
      newValue: value,
    });
  }

  /**
   * Get global state value
   */
  getState(key: string): any {
    return this.state.get(key);
  }

  /**
   * Clear global state value
   */
  clearState(key: string): void {
    this.state.delete(key);
  }

  /**
   * Clear all state
   */
  clearAllState(): void {
    this.state.clear();
  }

  /**
   * Notify all components of Facebook connection change
   */
  notifyFacebookConnectionChange(isConnected: boolean, data?: any): void {
    const eventType: EventType = isConnected ? 'facebook-connected' : 'facebook-disconnected';
    this.emit(eventType, data);
    this.setState('facebookConnected', isConnected);
  }

  /**
   * Notify all components of pixel data change
   */
  notifyPixelDataChange(action: 'created' | 'updated' | 'deleted', pixelData: any): void {
    const eventMap: Record<typeof action, EventType> = {
      created: 'pixel-created',
      updated: 'pixel-updated',
      deleted: 'pixel-deleted',
    };

    this.emit(eventMap[action], pixelData);
  }

  /**
   * Notify all components of dashboard data update
   */
  notifyDashboardDataUpdate(data: any): void {
    this.emit('dashboard-data-updated', data);
    this.setState('dashboardData', data);
  }

  /**
   * Notify all components of pixels data update
   */
  notifyPixelsDataUpdate(data: any): void {
    this.emit('pixels-data-updated', data);
    this.setState('pixelsData', data);
  }

  /**
   * Get current Facebook connection state
   */
  isFacebookConnected(): boolean {
    return this.getState('facebookConnected') || false;
  }

  /**
   * Get number of active listeners
   */
  getListenerCount(eventType?: EventType): number {
    if (eventType) {
      return this.listeners.get(eventType)?.size || 0;
    }

    let total = 0;
    for (const listeners of this.listeners.values()) {
      total += listeners.size;
    }
    return total;
  }

  /**
   * Clear all listeners (useful for testing)
   */
  clearAllListeners(): void {
    this.listeners.clear();
  }
}

// Singleton instance
export const stateSynchronization = new StateSynchronizationService();
