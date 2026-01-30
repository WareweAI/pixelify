/**
 * LocalStorage Manager Service
 * 
 * Safe localStorage operations with error handling and Facebook data management.
 * Requirements: 3.2, 3.4, 6.3
 */

export interface FacebookData {
  accessToken?: string;
  userId?: string;
  adAccountId?: string;
  businessId?: string;
  catalogId?: string;
  pixelId?: string;
  connectedAt?: string;
}

class LocalStorageService {
  private readonly FACEBOOK_KEY = 'facebook_connection';
  private readonly FACEBOOK_PIXEL_KEY = 'facebook_pixel_data';

  /**
   * Safely get item from localStorage with error handling
   */
  getItem<T>(key: string): T | null {
    if (!this.isAvailable()) {
      return null;
    }

    try {
      const item = localStorage.getItem(key);
      if (!item) {
        return null;
      }
      return JSON.parse(item) as T;
    } catch (error) {
      console.error(`Error reading from localStorage (${key}):`, error);
      // Attempt to clean up corrupted data
      this.removeItem(key);
      return null;
    }
  }

  /**
   * Safely set item in localStorage with error handling
   */
  setItem<T>(key: string, value: T): boolean {
    if (!this.isAvailable()) {
      return false;
    }

    try {
      const serialized = JSON.stringify(value);
      localStorage.setItem(key, serialized);
      return true;
    } catch (error) {
      if (this.isQuotaExceeded(error)) {
        console.error('localStorage quota exceeded');
        this.handleQuotaExceeded();
      } else {
        console.error(`Error writing to localStorage (${key}):`, error);
      }
      return false;
    }
  }

  /**
   * Safely remove item from localStorage
   */
  removeItem(key: string): boolean {
    if (!this.isAvailable()) {
      return false;
    }

    try {
      localStorage.removeItem(key);
      return true;
    } catch (error) {
      console.error(`Error removing from localStorage (${key}):`, error);
      return false;
    }
  }

  /**
   * Get Facebook connection data
   */
  getFacebookData(): FacebookData | null {
    return this.getItem<FacebookData>(this.FACEBOOK_KEY);
  }

  /**
   * Set Facebook connection data
   */
  setFacebookData(data: FacebookData): boolean {
    return this.setItem(this.FACEBOOK_KEY, data);
  }

  /**
   * Update Facebook connection data (partial update)
   */
  updateFacebookData(updates: Partial<FacebookData>): boolean {
    const current = this.getFacebookData() || {};
    const updated = { ...current, ...updates };
    return this.setFacebookData(updated);
  }

  /**
   * Remove Facebook connection data
   */
  removeFacebookData(): boolean {
    return this.removeItem(this.FACEBOOK_KEY);
  }

  /**
   * Get Facebook pixel data
   */
  getFacebookPixelData(): any | null {
    return this.getItem(this.FACEBOOK_PIXEL_KEY);
  }

  /**
   * Remove Facebook pixel data
   */
  removeFacebookPixelData(): boolean {
    return this.removeItem(this.FACEBOOK_PIXEL_KEY);
  }

  /**
   * Complete cleanup of all Facebook-related data
   */
  cleanupFacebookData(): boolean {
    let success = true;
    
    // Remove all Facebook-related keys
    const facebookKeys = [
      this.FACEBOOK_KEY,
      this.FACEBOOK_PIXEL_KEY,
      'fb_access_token',
      'fb_user_id',
      'fb_ad_account',
      'fb_business_id',
      'fb_catalog_id',
      'fb_pixel_id',
    ];

    for (const key of facebookKeys) {
      if (!this.removeItem(key)) {
        success = false;
      }
    }

    return success;
  }

  /**
   * Clear all localStorage data
   */
  clearAll(): boolean {
    if (!this.isAvailable()) {
      return false;
    }

    try {
      localStorage.clear();
      return true;
    } catch (error) {
      console.error('Error clearing localStorage:', error);
      return false;
    }
  }

  /**
   * Check if localStorage is available
   */
  isAvailable(): boolean {
    try {
      const test = '__localStorage_test__';
      localStorage.setItem(test, test);
      localStorage.removeItem(test);
      return true;
    } catch {
      return false;
    }
  }

  /**
   * Get all keys in localStorage
   */
  getAllKeys(): string[] {
    if (!this.isAvailable()) {
      return [];
    }

    try {
      const keys: string[] = [];
      for (let i = 0; i < localStorage.length; i++) {
        const key = localStorage.key(i);
        if (key) {
          keys.push(key);
        }
      }
      return keys;
    } catch {
      return [];
    }
  }

  /**
   * Get storage size estimate in bytes
   */
  getStorageSize(): number {
    if (!this.isAvailable()) {
      return 0;
    }

    try {
      let size = 0;
      const keys = this.getAllKeys();
      for (const key of keys) {
        const value = localStorage.getItem(key);
        if (value) {
          size += key.length + value.length;
        }
      }
      return size * 2; // UTF-16 encoding
    } catch {
      return 0;
    }
  }

  /**
   * Check if error is quota exceeded
   */
  private isQuotaExceeded(error: any): boolean {
    return (
      error instanceof DOMException &&
      (error.code === 22 ||
        error.code === 1014 ||
        error.name === 'QuotaExceededError' ||
        error.name === 'NS_ERROR_DOM_QUOTA_REACHED')
    );
  }

  /**
   * Handle quota exceeded by removing old data
   */
  private handleQuotaExceeded(): void {
    console.warn('Attempting to free up localStorage space');
    
    // Remove non-critical data first
    const nonCriticalKeys = this.getAllKeys().filter(
      key => !key.startsWith('facebook_') && !key.startsWith('fb_')
    );

    for (const key of nonCriticalKeys) {
      this.removeItem(key);
    }
  }
}

// Singleton instance
export const localStorageService = new LocalStorageService();
