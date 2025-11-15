/**
 * Request queue system for Gemini API with rate limiting support
 */

// Internal imports
import { GeminiRateLimitError } from './gemini-errors';

const isDevelopment = process.env.NODE_ENV !== 'production';

export interface QueueConfig {
  concurrency: number; // Max concurrent requests (default: 2 for free tier)
  delayBetweenBatches: number; // Delay in ms between batches (default: 2000ms)
  maxRetries: number; // Max retry attempts per request (default: 3)
  autoRetry: boolean; // Auto-retry on rate limit (default: true)
  onRateLimitDetected?: (error: GeminiRateLimitError) => Promise<RateLimitDecision>; // Callback when rate limit hit
  onProgress?: (progress: QueueProgress) => void; // Progress callback
}

export interface QueueProgress {
  total: number;
  completed: number;
  queued: number;
  processing: number;
  failed: number;
  status: string; // e.g., "Processing", "Waiting for rate limit", "Paused"
  estimatedTimeRemaining?: number; // milliseconds
  rateLimitWaitTime?: number; // Total time spent waiting for rate limits (milliseconds)
}

export enum RateLimitDecision {
  CONTINUE_SLOWER = 'continue_slower', // Reduce concurrency and continue
  SKIP_CURRENT = 'skip_current', // Skip current batch
  CANCEL_ALL = 'cancel_all', // Cancel all remaining requests
}

interface QueuedRequest<T> {
  id: string;
  execute: () => Promise<T>;
  resolve: (value: T) => void;
  reject: (error: any) => void;
  retries: number;
  status: 'queued' | 'processing' | 'completed' | 'failed';
}

/**
 * Smart request queue for Gemini API calls
 */
export class GeminiRequestQueue {
  private queue: QueuedRequest<any>[] = [];
  private processing = 0;
  private completed = 0;
  private failed = 0;
  private config: Required<QueueConfig>;
  private isPaused = false;
  private isCancelled = false;
  private rateLimitDetected = false;
  private requestCounter = 0;
  private rateLimitWaitTime = 0; // Track total time spent waiting for rate limits

  // Default config optimized for Gemini free tier
  private static DEFAULT_CONFIG: Required<QueueConfig> = {
    concurrency: 2,
    delayBetweenBatches: 2000,
    maxRetries: 3,
    autoRetry: true,
    onRateLimitDetected: async () => RateLimitDecision.CONTINUE_SLOWER,
    onProgress: () => {},
  };

  constructor(config?: Partial<QueueConfig>) {
    this.config = {
      ...GeminiRequestQueue.DEFAULT_CONFIG,
      ...config,
    };

    // Debug logging
    if (isDevelopment) console.log('[GeminiQueue] Constructor - callback exists:', {
      hasRateLimitCallback: !!this.config.onRateLimitDetected,
      hasProgressCallback: !!this.config.onProgress,
      concurrency: this.config.concurrency,
      delayBetweenBatches: this.config.delayBetweenBatches,
      callbackIsDefault: this.config.onRateLimitDetected === GeminiRequestQueue.DEFAULT_CONFIG.onRateLimitDetected,
    });
  }

  /**
   * Add a request to the queue
   */
  async enqueue<T>(execute: () => Promise<T>): Promise<T> {
    return new Promise((resolve, reject) => {
      const request: QueuedRequest<T> = {
        id: `req_${++this.requestCounter}`,
        execute,
        resolve,
        reject,
        retries: 0,
        status: 'queued',
      };

      this.queue.push(request);
      this.reportProgress();
      this.processQueue();
    });
  }

  /**
   * Process the queue with concurrency control
   */
  private async processQueue(): Promise<void> {
    if (this.isPaused || this.isCancelled) {
      return;
    }

    // Process up to concurrency limit
    while (this.processing < this.config.concurrency && this.queue.length > 0) {
      const request = this.queue.shift();
      if (!request) break;

      this.processing++;
      request.status = 'processing';
      this.reportProgress();

      this.executeRequest(request)
        .then((result) => {
          request.resolve(result);
          this.completed++;
          request.status = 'completed';
        })
        .catch((error) => {
          request.reject(error);
          this.failed++;
          request.status = 'failed';
        })
        .finally(() => {
          this.processing--;
          this.reportProgress();

          // Add delay between batches if needed
          if (this.queue.length > 0 && this.processing === 0) {
            setTimeout(() => this.processQueue(), this.config.delayBetweenBatches);
          } else {
            this.processQueue();
          }
        });
    }
  }

  /**
   * Execute a single request with retry logic
   */
  private async executeRequest<T>(request: QueuedRequest<T>): Promise<T> {
    try {
      const result = await request.execute();
      return result;
    } catch (error) {
      // Check if it's already a GeminiRateLimitError or needs conversion
      let rateLimitError: GeminiRateLimitError | null;

      if (error instanceof GeminiRateLimitError) {
        if (isDevelopment) console.log('[GeminiQueue] Error is already a GeminiRateLimitError');
        rateLimitError = error;  // Already converted
      } else {
        if (isDevelopment) console.log('[GeminiQueue] Converting error to GeminiRateLimitError');
        rateLimitError = GeminiRateLimitError.fromGoogleError(error);  // Convert it
      }

      if (rateLimitError) {
        return this.handleRateLimitError(request, rateLimitError);
      }

      // For non-rate-limit errors, retry with exponential backoff
      if (request.retries < this.config.maxRetries) {
        request.retries++;
        const backoffDelay = Math.min(1000 * Math.pow(2, request.retries), 30000); // Max 30s
        if (isDevelopment) console.log(`[GeminiQueue] Retrying request ${request.id} after ${backoffDelay}ms (attempt ${request.retries}/${this.config.maxRetries})`);

        await this.delay(backoffDelay);
        return this.executeRequest(request);
      }

      // Max retries exceeded
      throw error;
    }
  }

  /**
   * Handle rate limit errors
   */
  private async handleRateLimitError<T>(
    request: QueuedRequest<T>,
    error: GeminiRateLimitError
  ): Promise<T> {
    if (isDevelopment) console.log(`[GeminiQueue] handleRateLimitError called for request ${request.id}`);
    if (isDevelopment) console.log(`[GeminiQueue] Rate limit detected: ${error.getUserFriendlyMessage()}`);
    if (isDevelopment) console.log(`[GeminiQueue] rateLimitDetected flag:`, this.rateLimitDetected);
    if (isDevelopment) console.log(`[GeminiQueue] Has callback:`, !!this.config.onRateLimitDetected);

    // Only show prompt on first rate limit detection
    if (!this.rateLimitDetected && this.config.onRateLimitDetected) {
      if (isDevelopment) console.log(`[GeminiQueue] Calling rate limit callback...`);
      this.rateLimitDetected = true;

      try {
        const decision = await this.config.onRateLimitDetected(error);
        if (isDevelopment) console.log(`[GeminiQueue] User decision:`, decision);

        switch (decision) {
          case RateLimitDecision.CONTINUE_SLOWER:
            // Reduce concurrency and add more delay
            this.config.concurrency = Math.max(1, Math.floor(this.config.concurrency / 2));
            this.config.delayBetweenBatches = Math.min(this.config.delayBetweenBatches * 2, 10000);
            if (isDevelopment) console.log(`[GeminiQueue] Reducing concurrency to ${this.config.concurrency}, delay to ${this.config.delayBetweenBatches}ms`);
            break;

          case RateLimitDecision.SKIP_CURRENT:
            throw new Error('Skipped by user decision');

          case RateLimitDecision.CANCEL_ALL:
            this.cancelAll();
            throw new Error('Cancelled by user decision');
        }
      } catch (callbackError) {
        console.error(`[GeminiQueue] Error in rate limit callback:`, callbackError);
        // Continue with default behavior (auto-retry)
      }
    } else {
      if (isDevelopment) console.log(`[GeminiQueue] Skipping callback - already called or no callback defined`);
    }

    // Wait for the suggested retry delay
    if (this.config.autoRetry) {
      const retryDelay = error.retryDelay + 1000; // Add 1s buffer
      this.reportProgress(`Waiting for rate limit - ${(retryDelay / 1000).toFixed(1)}s remaining`);

      if (isDevelopment) console.log(`[GeminiQueue] Waiting ${retryDelay}ms before retrying`);

      // Track rate limit wait time
      const waitStart = Date.now();
      await this.delay(retryDelay);
      this.rateLimitWaitTime += (Date.now() - waitStart);

      // Retry the request
      request.retries++;
      if (request.retries <= this.config.maxRetries) {
        return this.executeRequest(request);
      }
    }

    throw error;
  }

  /**
   * Report progress to callback
   */
  private reportProgress(customStatus?: string): void {
    const total = this.completed + this.failed + this.processing + this.queue.length;
    const queued = this.queue.length;

    const progress: QueueProgress = {
      total,
      completed: this.completed,
      queued,
      processing: this.processing,
      failed: this.failed,
      status: customStatus || (this.isPaused ? 'Paused' : this.processing > 0 ? 'Processing' : 'Idle'),
      estimatedTimeRemaining: this.estimateTimeRemaining(),
      rateLimitWaitTime: this.rateLimitWaitTime,
    };

    this.config.onProgress?.(progress);
  }

  /**
   * Estimate time remaining based on current rate
   */
  private estimateTimeRemaining(): number | undefined {
    const remaining = this.queue.length;
    if (remaining === 0) return 0;

    // Estimate based on concurrency and delay
    const batchSize = this.config.concurrency;
    const batches = Math.ceil(remaining / batchSize);
    const avgRequestTime = 2000; // Assume 2s per request
    const totalDelay = (batches - 1) * this.config.delayBetweenBatches;

    return (batches * avgRequestTime) + totalDelay;
  }

  /**
   * Pause the queue
   */
  pause(): void {
    this.isPaused = true;
    this.reportProgress('Paused');
  }

  /**
   * Resume the queue
   */
  resume(): void {
    this.isPaused = false;
    this.reportProgress();
    this.processQueue();
  }

  /**
   * Cancel all queued requests
   */
  cancelAll(): void {
    this.isCancelled = true;
    this.queue.forEach((req) => {
      req.reject(new Error('Queue cancelled'));
    });
    this.queue = [];
    this.reportProgress('Cancelled');
  }

  /**
   * Update queue configuration
   */
  updateConfig(config: Partial<QueueConfig>): void {
    this.config = {
      ...this.config,
      ...config,
    };
  }

  /**
   * Get current queue stats
   */
  getStats(): QueueProgress {
    const total = this.completed + this.failed + this.processing + this.queue.length;
    return {
      total,
      completed: this.completed,
      queued: this.queue.length,
      processing: this.processing,
      failed: this.failed,
      status: this.isPaused ? 'Paused' : this.processing > 0 ? 'Processing' : 'Idle',
      estimatedTimeRemaining: this.estimateTimeRemaining(),
      rateLimitWaitTime: this.rateLimitWaitTime,
    };
  }

  /**
   * Reset the queue
   */
  reset(): void {
    this.queue = [];
    this.processing = 0;
    this.completed = 0;
    this.failed = 0;
    this.isPaused = false;
    this.isCancelled = false;
    this.rateLimitDetected = false;
    this.requestCounter = 0;
    this.rateLimitWaitTime = 0;
  }

  /**
   * Utility: Delay helper
   */
  private delay(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }
}
