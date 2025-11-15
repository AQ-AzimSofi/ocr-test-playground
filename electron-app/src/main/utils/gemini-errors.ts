/**
 * Custom error types for Gemini API interactions
 */

export interface RateLimitInfo {
  retryDelay: number; // milliseconds
  quotaMetric?: string;
  quotaLimit?: number;
  quotaValue?: number;
  model?: string;
}

/**
 * Error thrown when Gemini API rate limit is exceeded
 */
export class GeminiRateLimitError extends Error {
  public readonly retryDelay: number;
  public readonly rateLimitInfo: RateLimitInfo;
  public readonly originalError: any;

  constructor(message: string, retryDelay: number, rateLimitInfo: RateLimitInfo, originalError?: any) {
    super(message);
    this.name = 'GeminiRateLimitError';
    this.retryDelay = retryDelay;
    this.rateLimitInfo = rateLimitInfo;
    this.originalError = originalError;

    // Maintains proper stack trace for where our error was thrown (only available on V8)
    if (Error.captureStackTrace) {
      Error.captureStackTrace(this, GeminiRateLimitError);
    }
  }

  /**
   * Parse Google's error response to extract rate limit information
   */
  static fromGoogleError(error: any): GeminiRateLimitError | null {
    const errorMessage = error?.message || String(error);

    // Check if this is a 429 rate limit error
    if (!errorMessage.includes('429') && !errorMessage.includes('Too Many Requests')) {
      return null;
    }

    // Extract retry delay (e.g., "Please retry in 6.459601871s")
    const retryMatch = errorMessage.match(/retry in ([\d.]+)s/i);
    const retryDelaySeconds = retryMatch ? parseFloat(retryMatch[1]) : 60; // Default to 60s if not found
    const retryDelayMs = Math.ceil(retryDelaySeconds * 1000);

    // Extract quota information
    const quotaMetricMatch = errorMessage.match(/Quota exceeded for metric: ([^,]+)/);
    const quotaLimitMatch = errorMessage.match(/limit: (\d+)/);
    const quotaValueMatch = errorMessage.match(/quotaValue['"]:['"](\d+)/);
    const modelMatch = errorMessage.match(/model['"]:['"]([^'"]+)/);

    const rateLimitInfo: RateLimitInfo = {
      retryDelay: retryDelayMs,
      quotaMetric: quotaMetricMatch?.[1],
      quotaLimit: quotaLimitMatch ? parseInt(quotaLimitMatch[1]) : undefined,
      quotaValue: quotaValueMatch ? parseInt(quotaValueMatch[1]) : undefined,
      model: modelMatch?.[1],
    };

    const friendlyMessage = `Gemini API rate limit exceeded. ${
      rateLimitInfo.quotaLimit
        ? `Free tier limit: ${rateLimitInfo.quotaLimit} requests per minute. `
        : ''
    }Please wait ${retryDelaySeconds.toFixed(1)}s before retrying.`;

    return new GeminiRateLimitError(friendlyMessage, retryDelayMs, rateLimitInfo, error);
  }

  /**
   * Get user-friendly message for display in UI
   */
  getUserFriendlyMessage(): string {
    const delaySeconds = (this.retryDelay / 1000).toFixed(1);
    return `Rate limit reached. ${
      this.rateLimitInfo.quotaLimit
        ? `Your free tier allows ${this.rateLimitInfo.quotaLimit} requests per minute. `
        : ''
    }Suggested wait time: ${delaySeconds} seconds.`;
  }
}

/**
 * Check if an error is a Gemini rate limit error
 */
export function isRateLimitError(error: any): error is GeminiRateLimitError {
  return error instanceof GeminiRateLimitError;
}

/**
 * Check if an error message indicates a rate limit
 */
export function isRateLimitMessage(errorMessage: string): boolean {
  return errorMessage.includes('429') ||
         errorMessage.includes('Too Many Requests') ||
         errorMessage.includes('quota') ||
         errorMessage.includes('rate limit');
}
