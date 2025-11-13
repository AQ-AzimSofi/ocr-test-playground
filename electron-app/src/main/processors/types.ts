/**
 * Common types for all OCR processors
 */

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
    googleCloudVision?: string;
    azureComputerVision?: string;
    azureEndpoint?: string;
    googleGemini?: string;
    documentAiProjectId?: string;
    documentAiCredentials?: string;
  };
}
