// API Keys
export interface ApiKeys {
  googleCloudVision?: string; // API key (fallback method)
  cloudVisionServiceAccount?: string; // Service account JSON (recommended)
  cloudVisionProjectId?: string; // Project ID for service account
  azureComputerVision?: string;
  azureEndpoint?: string;
  googleGemini?: string;
  documentAiProjectId?: string;
  documentAiCredentials?: string;
  documentAiProcessorId?: string; // Specific processor instance ID
  documentAiLocation?: string; // Processor location (us, eu, asia-northeast1, etc.)
}

// Processor Categories
export type ProcessorCategory = 'confidential-safe' | 'hybrids' | 'experimental';

export interface ProcessorInfo {
  id: string;
  name: string;
  description: string;
  category: ProcessorCategory;
  cost: string;
  requiresApiKeys: string[];
  confidentialSafe: boolean;
}

// OCR Test Results
export interface OrderDependentMetrics {
  cer: number;
  precision: number;
  recall: number;
  f1Score: number;
  editDistance: number;
}

export interface OrderIndependentMetrics {
  cer: number;
  accuracy: number;
  editDistance: number;
  missingChars: Record<string, number>;
  extraChars: Record<string, number>;
}

export interface ProcessorResult {
  processorId: string;
  extractedText: string;
  orderDependent: OrderDependentMetrics;
  orderIndependent: OrderIndependentMetrics;
  cost: number;
  processingTime: number;
  boundingBoxes?: Array<{
    text: string;
    vertices: Array<{ x: number; y: number }>;
    confidence: number;
  }>;
}

export interface TestReport {
  timestamp: string;
  mode: 'pdf' | 'text';
  groundTruth: string;
  results: ProcessorResult[];
  totalCost: number;
  totalTime: number;
}

// Floor Plan Types
export interface GeometricObject {
  id: string;
  type: 'wall' | 'door' | 'window' | 'room';
  subType?: string;
  coordinates: Array<{ x: number; y: number }>;
  properties?: Record<string, any>;
  confidence: number;
}

export interface RevitOutput {
  metadata: {
    drawing_id: string;
    scale: string;
    units: string;
    scaling_factor: number;
  };
  elements: Array<{
    id: string;
    type: string;
    subType?: string;
    geometry: {
      type: 'line' | 'polygon' | 'point';
      coordinates_px: Array<{ x: number; y: number }>;
      coordinates_mm: Array<{ x: number; y: number }>;
    };
    properties: Record<string, any>;
    level: string;
    confidence: number;
  }>;
}

// Progress Updates
export interface ProgressUpdate {
  step: string;
  progress: number;
  total: number;
  message?: string;
}
