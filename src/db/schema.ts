import { pgTable, uuid, text, timestamp, jsonb, real, integer, boolean } from 'drizzle-orm/pg-core';

/**
 * Test drawings metadata
 * Stores information about each test drawing including ground truth data
 */
export const testDrawings = pgTable('test_drawings', {
  id: uuid('id').primaryKey().defaultRandom(),
  drawingId: text('drawing_id').notNull().unique(),
  fileName: text('file_name').notNull(),
  filePath: text('file_path').notNull(),
  type: text('type').notNull(), // 'site-layout', 'floor-plan', 'elevation', etc.
  quality: text('quality').notNull(), // 'high', 'medium', 'low'
  source: text('source').notNull(), // 'synthetic', 'cad-generated', 'scanned', 'manual'

  // Ground truth data for accuracy calculation
  groundTruth: jsonb('ground_truth').notNull().$type<{
    fullText: string; // Complete text content from the drawing for character-level comparison
  }>(),

  metadata: jsonb('metadata').$type<Record<string, any>>(),
  createdAt: timestamp('created_at').defaultNow().notNull(),
});

/**
 * Extraction results from different tools/workflows
 */
export const extractionResults = pgTable('extraction_results', {
  id: uuid('id').primaryKey().defaultRandom(),
  drawingId: text('drawing_id').notNull().references(() => testDrawings.drawingId),
  tool: text('tool').notNull(), // 'cloud-vision', 'gemini-2.0-flash', 'hybrid'

  // Raw extraction output (full text OCR'ed from the drawing)
  rawText: text('raw_text'),

  // Bounding boxes (if available)
  boundingBoxes: jsonb('bounding_boxes').$type<Array<{
    text: string;
    bounds: Array<{ x: number; y: number }>;
    confidence?: number;
    page?: number;
    bboxSource?: 'ocr' | 'gemini-percentage' | 'estimated' | 'synthesized'; // Track how bbox was generated
    metadata?: Record<string, any>;
  }>>(),

  // Performance metrics
  processingTimeMs: real('processing_time_ms'),
  apiCost: real('api_cost'), // in yen

  // Additional metadata for hybrid processors and analysis
  metadata: jsonb('metadata').$type<Record<string, any>>(),

  createdAt: timestamp('created_at').defaultNow().notNull(),
});

/**
 * Accuracy metrics calculated by comparing extraction results with ground truth
 * Focuses on character-level OCR accuracy
 */
export const accuracyMetrics = pgTable('accuracy_metrics', {
  id: uuid('id').primaryKey().defaultRandom(),
  extractionResultId: uuid('extraction_result_id').notNull().references(() => extractionResults.id),
  drawingId: text('drawing_id').notNull().references(() => testDrawings.drawingId),
  tool: text('tool').notNull(),

  // Character-level OCR accuracy metrics
  characterErrorRate: real('character_error_rate'), // CER (0.0 = perfect, 1.0 = completely wrong)
  characterAccuracy: real('character_accuracy'), // Position-based accuracy (0-100%)
  characterSetCoverage: real('character_set_coverage'), // Unique character coverage (0-100%)

  // Character count metrics
  extractedCharCount: integer('extracted_char_count'),
  groundTruthCharCount: integer('ground_truth_char_count'),
  exactCharCountMatch: boolean('exact_char_count_match'),
  charCountDifference: integer('char_count_difference'), // Can be negative or positive

  // Edit distance (Levenshtein)
  editDistance: integer('edit_distance'),

  // Overall confidence score (if provided by API)
  avgConfidenceScore: real('avg_confidence_score'),

  // Bbox source statistics (for processors with multiple bbox sources)
  bboxSourceStats: jsonb('bbox_source_stats').$type<{
    ocr?: number; // Count of precise OCR bboxes
    geminiPercentage?: number; // Count of Gemini-provided percentage bboxes
    estimated?: number; // Count of estimated bboxes
    synthesized?: number; // Count of synthesized bboxes
  }>(),

  // Detailed breakdown
  breakdown: jsonb('breakdown').$type<{
    extractedText?: string;
    groundTruthText?: string;
    characterDifferences?: Array<{
      position: number;
      expected: string;
      actual: string;
    }>;
  }>(),

  calculatedAt: timestamp('calculated_at').defaultNow().notNull(),
});

/**
 * Comparison results between different tools
 */
export const toolComparisons = pgTable('tool_comparisons', {
  id: uuid('id').primaryKey().defaultRandom(),
  drawingId: text('drawing_id').notNull().references(() => testDrawings.drawingId),
  toolA: text('tool_a').notNull(),
  toolB: text('tool_b').notNull(),

  // Which tool performed better
  betterTool: text('better_tool'),

  // Metric comparisons
  metricComparison: jsonb('metric_comparison').$type<{
    characterErrorRate: { toolA: number; toolB: number; winner: string };
    characterAccuracy: { toolA: number; toolB: number; winner: string };
    characterSetCoverage: { toolA: number; toolB: number; winner: string };
    processingTime: { toolA: number; toolB: number; winner: string };
    cost: { toolA: number; toolB: number; winner: string };
    overallScore: { toolA: number; toolB: number; winner: string };
  }>(),

  comparedAt: timestamp('compared_at').defaultNow().notNull(),
});

/**
 * Test run summary - tracks complete test runs across multiple drawings
 */
export const testRuns = pgTable('test_runs', {
  id: uuid('id').primaryKey().defaultRandom(),
  runName: text('run_name').notNull(),
  description: text('description'),

  // Drawings tested
  drawingIds: jsonb('drawing_ids').$type<string[]>().notNull(),

  // Tools tested
  tools: jsonb('tools').$type<string[]>().notNull(),

  // Overall results
  summary: jsonb('summary').$type<{
    totalDrawings: number;
    totalExtractions: number;
    avgCharacterErrorRateByTool: Record<string, number>;
    avgCharacterAccuracyByTool: Record<string, number>;
    avgProcessingTimeByTool: Record<string, number>;
    totalCostByTool: Record<string, number>;
    recommendedTool: string;
    notes: string;
  }>(),

  completed: boolean('completed').default(false),
  startedAt: timestamp('started_at').defaultNow().notNull(),
  completedAt: timestamp('completed_at'),
});
