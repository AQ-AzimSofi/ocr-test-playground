/**
 * Common types for all OCR processors
 */

import type { QueueConfig, RateLimitDecision } from '../utils/gemini-queue';
import type { GeminiRateLimitError } from '../utils/gemini-errors';

export interface BoundingBox {
  text: string;
  bounds: Array<{ x: number; y: number }>;
  confidence: number;
  page: number;
}

export interface ProcessorResult {
  success: boolean;
  tool: string;
  rawText: string;
  boundingBoxes: BoundingBox[];
  confidence: number;
  processingTime: number;
  cost: number;
  rateLimitWaitTime?: number; // Time spent waiting for rate limits (milliseconds)
  metadata: {
    granularity?: string;
    model?: string;
    wordCount?: number;
    pageCount: number;
    avgConfidence: number;
    [key: string]: any;
  };
  error?: string;
}

export interface ProcessorConfig {
  apiKeys: {
    googleCloudVision?: string; // API key (fallback)
    cloudVisionServiceAccount?: string; // Service account JSON (recommended)
    cloudVisionProjectId?: string; // Project ID for service account
    azureComputerVision?: string;
    azureEndpoint?: string;
    googleGemini?: string;
    documentAiProjectId?: string;
    documentAiCredentials?: string;
    documentAiProcessorId?: string; // Specific processor instance ID
    documentAiLocation?: string; // Processor location (us, eu, asia-northeast1, etc.)
  };
  queueConfig?: Partial<QueueConfig>;
  onRateLimitDetected?: (error: GeminiRateLimitError) => Promise<RateLimitDecision>;
  onProgress?: (progress: { total: number; completed: number; status: string }) => void;
}
