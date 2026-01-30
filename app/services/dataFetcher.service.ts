/**
 * Data Fetcher Service
 * 
 * Server-first data fetching with request deduplication and proper error handling.
 * Requirements: 1.1, 1.2, 4.1, 4.3, 4.5
 */

interface FetchOptions {
  skipCache?: boolean;
  retryCount?: number;
  timeout?: number;
}

interface RequestState<T> {
  promise: Promise<T>;
  timestamp: number;
  abortController: AbortController;
}

class DataFetcherService {
  private pendingRequests = new Map<string, RequestState<any>>();
  private readonly DEFAULT_TIMEOUT = 30000; // 30 seconds
  private readonly DEFAULT_RETRY_COUNT = 3;
  private readonly DEDUPLICATION_WINDOW = 1000; // 1 second

  /**
   * Fetch data from server with deduplication and retry logic
   * Server data always takes precedence over localStorage
   */
  async fetchFromServer<T>(
    url: string,
    options: FetchOptions = {}
  ): Promise<T> {
    const cacheKey = this.getCacheKey(url, options);
    
    // Check for pending request (deduplication)
    const pending = this.pendingRequests.get(cacheKey);
    if (pending && !options.skipCache) {
      const age = Date.now() - pending.timestamp;
      if (age < this.DEDUPLICATION_WINDOW) {
        return pending.promise;
      }
    }

    // Create new request
    const abortController = new AbortController();
    const promise = this.executeRequest<T>(url, options, abortController);
    
    this.pendingRequests.set(cacheKey, {
      promise,
      timestamp: Date.now(),
      abortController,
    });

    try {
      const result = await promise;
      return result;
    } finally {
      // Cleanup after request completes
      this.pendingRequests.delete(cacheKey);
    }
  }

  /**
   * Execute HTTP request with timeout and retry logic
   */
  private async executeRequest<T>(
    url: string,
    options: FetchOptions,
    abortController: AbortController
  ): Promise<T> {
    const timeout = options.timeout || this.DEFAULT_TIMEOUT;
    const maxRetries = options.retryCount ?? this.DEFAULT_RETRY_COUNT;
    
    let lastError: Error | null = null;
    
    for (let attempt = 0; attempt <= maxRetries; attempt++) {
      try {
        const timeoutId = setTimeout(() => abortController.abort(), timeout);
        
        const response = await fetch(url, {
          signal: abortController.signal,
          headers: {
            'Content-Type': 'application/json',
          },
        });

        clearTimeout(timeoutId);

        if (!response.ok) {
          throw new Error(`HTTP ${response.status}: ${response.statusText}`);
        }

        const data = await response.json();
        return data as T;
      } catch (error) {
        lastError = error instanceof Error ? error : new Error(String(error));
        
        // Don't retry on abort or client errors
        if (abortController.signal.aborted) {
          throw new Error('Request timeout');
        }
        
        if (error instanceof Error && error.message.includes('HTTP 4')) {
          throw error;
        }

        // Wait before retry with exponential backoff
        if (attempt < maxRetries) {
          await this.delay(Math.pow(2, attempt) * 1000);
        }
      }
    }

    throw lastError || new Error('Request failed');
  }

  /**
   * Cancel all pending requests
   */
  cancelAllRequests(): void {
    for (const [key, state] of this.pendingRequests.entries()) {
      state.abortController.abort();
      this.pendingRequests.delete(key);
    }
  }

  /**
   * Cancel specific request by URL
   */
  cancelRequest(url: string): void {
    for (const [key, state] of this.pendingRequests.entries()) {
      if (key.startsWith(url)) {
        state.abortController.abort();
        this.pendingRequests.delete(key);
      }
    }
  }

  /**
   * Get number of pending requests
   */
  getPendingRequestCount(): number {
    return this.pendingRequests.size;
  }

  /**
   * Check if request is pending
   */
  isRequestPending(url: string): boolean {
    for (const key of this.pendingRequests.keys()) {
      if (key.startsWith(url)) {
        return true;
      }
    }
    return false;
  }

  private getCacheKey(url: string, options: FetchOptions): string {
    return `${url}:${JSON.stringify(options)}`;
  }

  private delay(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
}

// Singleton instance
export const dataFetcher = new DataFetcherService();
