export interface BoundingBox {
  text: string;
  bounds: Array<{ x: number; y: number }>;
  confidence?: number;
  page?: number;
  metadata?: {
    isLowConfidence?: boolean;
    geminiUpdated?: boolean;
    originalText?: string;
    updateReason?: string;
    source?: 'azure-read' | 'cloud-vision' | 'gemini' | 'manual';
    granularity?: 'word' | 'paragraph';
    verified?: boolean; // User has verified/approved this bbox
  };
  // Manual verification status (from verification system)
  verification?: {
    status: 'correct' | 'incorrect' | 'unverified';
    notes?: string | null;
    verifiedAt: string;
  } | null;
}

export interface ExtractionResult {
  id: string;
  drawingId: string;
  tool: string;
  rawText: string | null;
  boundingBoxes: BoundingBox[] | null;
  processingTimeMs: number | null;
  apiCost: number | null;
  metadata: Record<string, any> | null;
  createdAt: string;
}

export interface Drawing {
  id: string;
  drawingId: string;
  fileName: string;
  filePath: string;
  type: string;
  quality: string;
  source: string;
  isConfidential: boolean; // Confidential PDFs cannot use Gemini processors
  groundTruth: {
    fullText?: string;
    fullTextFile?: string;
  };
  metadata: Record<string, any>;
  createdAt: string;
}

export interface AccuracyMetrics {
  /** Position-Sensitive Error Rate (considers character order) */
  characterErrorRate: number;
  /** Content Error Rate (ignores character order) */
  orderIndependentCer: number;
  /** Extraction Accuracy (100% - Content Error Rate) */
  orderIndependentAccuracy: number;
  /** Character Accuracy (position-based) */
  characterAccuracy: number;
  /** Character Set Coverage (percentage of unique characters found) */
  characterSetCoverage: number;
  extractedCharCount: number;
  groundTruthCharCount: number;
  exactCharCountMatch?: boolean;
  editDistance?: number;
}

export interface ResultWithDetails extends ExtractionResult {
  accuracy: AccuracyMetrics | null;
  stats: {
    total: number;
    geminiUpdated: number;
    lowConfidence: number;
    bySource: Record<string, number>;
  };
  isConfidential: boolean;
  verification: {
    totalBboxes: number;
    verifiedCount: number;
    correctCount: number;
    incorrectCount: number;
    missingTextCount: number;
    verificationProgress: number; // Percentage
  };
}

export interface DrawingResults {
  drawing: Drawing;
  results: ExtractionResult[];
  resultsByTool: Record<string, ExtractionResult>;
  tools: string[];
}

export interface TestRun {
  id: string;
  runName: string;
  description: string | null;
  drawingIds: string[];
  tools: string[];
  summary: {
    totalDrawings: number;
    totalExtractions: number;
    avgCharacterErrorRateByTool: Record<string, number>;
    avgCharacterAccuracyByTool: Record<string, number>;
    avgProcessingTimeByTool: Record<string, number>;
    totalCostByTool: Record<string, number>;
    recommendedTool: string;
    notes: string;
  };
  completed: boolean;
  startedAt: string;
  completedAt: string | null;
  // Enriched data from API
  drawings?: Array<{
    drawingId: string;
    fileName: string;
    filePath: string;
    type: string;
    quality: string;
    isConfidential: boolean;
  }>;
  toolCounts?: Record<string, number>;
  isConfidential?: boolean; // True if any drawing in the run is confidential
}

export interface TestRunDetails {
  testRun: TestRun;
  comparisons: Array<{
    drawingId: string;
    tools: Array<{
      tool: string;
      result: {
        id: string;
        rawText: string | null;
        boundingBoxes: BoundingBox[] | null;
        processingTime: number | null;
        apiCost: number | null;
        metadata: Record<string, any> | null;
      };
      accuracy: {
        characterErrorRate: number;
        characterAccuracy: number;
        characterSetCoverage: number;
        extractedCharCount: number;
        groundTruthCharCount: number;
      } | null;
    }>;
  }>;
  aggregateStats: Array<{
    tool: string;
    avgCER: number;
    avgAccuracy: number;
    avgCoverage: number;
    avgProcessingTime: number;
    totalCost: number;
    count: number;
  }>;
  summary: TestRun['summary'];
}

export interface APIResponse<T> {
  success: boolean;
  data: T;
  error?: string;
}

// Edit mode types
export type BBoxChangeType = 'add' | 'modify' | 'delete';

export interface BBoxCorrection {
  type: BBoxChangeType;
  bbox: BoundingBox;
  originalBbox?: BoundingBox; // For modify/delete operations
}

export interface SaveCorrectionsRequest {
  resultId: string;
  corrections: BBoxCorrection[];
}

export interface SaveCorrectionsResponse {
  success: boolean;
  result: ExtractionResult;
}

// Verification types for confidential documents
export interface BBoxVerification {
  bboxIndex: number;
  status: 'correct' | 'incorrect' | 'unverified';
  notes?: string;
}

export interface MissingTextEntry {
  id: string;
  text: string;
  estimatedLocation?: {
    x?: number;
    y?: number;
    width?: number;
    height?: number;
    page?: number;
  };
  notes?: string | null;
  addedAt: string;
}

export interface VerificationStats {
  totalBboxes: number;
  verifiedCount: number;
  unverifiedCount: number;
  correctCount: number;
  incorrectCount: number;
  missingTextCount: number;
  verificationProgress: number; // Percentage
  correctRate: number; // Percentage
  incorrectRate: number; // Percentage
  verifications: Record<number, {
    status: 'correct' | 'incorrect' | 'unverified';
    notes?: string | null;
    verifiedAt: string;
  }>;
  missingTexts: MissingTextEntry[];
}

export interface VerifyBBoxRequest {
  bboxIndex: number;
  status: 'correct' | 'incorrect' | 'unverified';
  notes?: string;
}

export interface AddMissingTextRequest {
  text: string;
  estimatedLocation?: {
    x?: number;
    y?: number;
    width?: number;
    height?: number;
    page?: number;
  };
  notes?: string;
}
