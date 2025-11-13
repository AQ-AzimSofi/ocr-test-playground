import {
  pgTable,
  uuid,
  text,
  timestamp,
  jsonb,
  real,
  integer,
  boolean,
} from 'drizzle-orm/pg-core';

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

  // Confidential flag (for PDFs that cannot use Gemini processors)
  isConfidential: boolean('is_confidential').default(false).notNull(),

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
  drawingId: text('drawing_id')
    .notNull()
    .references(() => testDrawings.drawingId),
  tool: text('tool').notNull(), // 'cloud-vision', 'gemini-2.0-flash', 'hybrid'

  // Raw extraction output (full text OCR'ed from the drawing)
  rawText: text('raw_text'),

  // Bounding boxes (if available)
  boundingBoxes: jsonb('bounding_boxes').$type<
    Array<{
      text: string;
      bounds: Array<{ x: number; y: number }>;
      confidence?: number;
      page?: number;
      bboxSource?:
        | 'ocr'
        | 'gemini-percentage'
        | 'estimated'
        | 'synthesized'
        | 'spatial-search'
        | 'template-match'; // Track how bbox was generated
      metadata?: Record<string, any>;
    }>
  >(),

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
  extractionResultId: uuid('extraction_result_id')
    .notNull()
    .references(() => extractionResults.id),
  drawingId: text('drawing_id')
    .notNull()
    .references(() => testDrawings.drawingId),
  tool: text('tool').notNull(),

  // Character-level OCR accuracy metrics (position-sensitive)
  characterErrorRate: real('character_error_rate'), // CER (0.0 = perfect, 1.0 = completely wrong)
  characterAccuracy: real('character_accuracy'), // Position-based accuracy (0-100%)
  characterSetCoverage: real('character_set_coverage'), // Unique character coverage (0-100%)

  // Order-independent metrics (content completeness regardless of text order)
  orderIndependentCer: real('order_independent_cer'), // Order-independent CER (0.0 = perfect, 1.0 = completely wrong)
  orderIndependentAccuracy: real('order_independent_accuracy'), // Order-independent accuracy (0-100%)
  orderIndependentEditDistance: integer('order_independent_edit_distance'), // Edit distance after sorting characters

  // Character count metrics
  extractedCharCount: integer('extracted_char_count'),
  groundTruthCharCount: integer('ground_truth_char_count'),
  exactCharCountMatch: boolean('exact_char_count_match'),
  charCountDifference: integer('char_count_difference'), // Can be negative or positive

  // Normalized character counts (after whitespace removal and full-width conversion)
  normalizedExtractedLength: integer('normalized_extracted_length'),
  normalizedGroundTruthLength: integer('normalized_ground_truth_length'),

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

  // Order-independent character frequency analysis
  orderIndependentCharAnalysis: jsonb('order_independent_char_analysis').$type<{
    missingCharacters: Record<string, number>; // char -> count
    extraCharacters: Record<string, number>; // char -> count
    missingTotal: number;
    extraTotal: number;
  }>(),

  calculatedAt: timestamp('calculated_at').defaultNow().notNull(),
});

/**
 * Comparison results between different tools
 */
export const toolComparisons = pgTable('tool_comparisons', {
  id: uuid('id').primaryKey().defaultRandom(),
  drawingId: text('drawing_id')
    .notNull()
    .references(() => testDrawings.drawingId),
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

/**
 * Geometric objects detected from architectural drawings
 * Stores walls, doors, windows, and other structural elements
 */
export const geometricObjects = pgTable('geometric_objects', {
  id: uuid('id').primaryKey().defaultRandom(),
  extractionResultId: uuid('extraction_result_id')
    .notNull()
    .references(() => extractionResults.id),
  drawingId: text('drawing_id')
    .notNull()
    .references(() => testDrawings.drawingId),

  // Object classification
  objectType: text('object_type').notNull(), // 'wall', 'door', 'window', 'line', 'symbol', etc.
  subType: text('sub_type'), // 'exterior-wall', 'sliding-door', 'casement-window', etc.

  // Geometric data
  geometry: jsonb('geometry').notNull().$type<{
    type: 'line' | 'polygon' | 'point' | 'rectangle' | 'circle';
    coordinates: Array<{ x: number; y: number }>; // Polygon/line vertices or single point
    bounds?: { x: number; y: number; width: number; height: number }; // Bounding rectangle
  }>(),

  // Physical properties (in drawing units, typically mm)
  properties: jsonb('properties').$type<{
    length?: number; // For walls, lines
    width?: number; // For doors, windows
    thickness?: number; // For walls
    height?: number; // For 3D elements
    area?: number; // For rooms, surfaces
    angle?: number; // Rotation angle in degrees
    [key: string]: any; // Additional custom properties
  }>(),

  // Detection metadata
  confidence: real('confidence'), // Detection confidence (0-1)
  detectionMethod: text('detection_method').notNull(), // 'opencv-hough', 'ai-detection', 'hybrid', etc.

  // Associated dimension text reference (if any)
  associatedDimensionId: uuid('associated_dimension_id').references(
    () => geometricObjects.id
  ),

  metadata: jsonb('metadata').$type<Record<string, any>>(),
  createdAt: timestamp('created_at').defaultNow().notNull(),
});

/**
 * Relationships between geometric objects and dimension text
 * Links extracted text (dimensions, labels) to geometric objects (walls, doors)
 */
export const elementRelationships = pgTable('element_relationships', {
  id: uuid('id').primaryKey().defaultRandom(),
  drawingId: text('drawing_id')
    .notNull()
    .references(() => testDrawings.drawingId),

  // Source geometric object
  sourceObjectId: uuid('source_object_id')
    .notNull()
    .references(() => geometricObjects.id),

  // Target (could be text bbox or another geometric object)
  targetType: text('target_type').notNull(), // 'dimension-text', 'label-text', 'geometric-object'
  targetId: text('target_id').notNull(), // UUID or text content

  // Relationship type
  relationshipType: text('relationship_type').notNull(), // 'has-dimension', 'has-label', 'adjacent-to', 'contains', etc.

  // Spatial association
  spatialData: jsonb('spatial_data').$type<{
    distance?: number; // Distance between objects
    direction?: 'above' | 'below' | 'left' | 'right' | 'inside' | 'outside';
    confidence?: number; // Association confidence
  }>(),

  metadata: jsonb('metadata').$type<Record<string, any>>(),
  createdAt: timestamp('created_at').defaultNow().notNull(),
});

/**
 * Manual verification of bounding boxes for confidential documents
 * Allows users to mark each bbox as correct/incorrect without ground truth
 */
export const bboxVerifications = pgTable('bbox_verifications', {
  id: uuid('id').primaryKey().defaultRandom(),
  extractionResultId: uuid('extraction_result_id')
    .notNull()
    .references(() => extractionResults.id),
  drawingId: text('drawing_id')
    .notNull()
    .references(() => testDrawings.drawingId),

  // Bbox identification (index in the boundingBoxes array)
  bboxIndex: integer('bbox_index').notNull(),

  // Verification status
  status: text('status').notNull(), // 'correct' | 'incorrect' | 'unverified'

  // Optional notes about why it's incorrect
  notes: text('notes'),

  // Verification metadata
  verifiedAt: timestamp('verified_at').defaultNow().notNull(),
  metadata: jsonb('metadata').$type<Record<string, any>>(),
});

/**
 * Missing text entries for confidential documents
 * Tracks text that should have been detected but wasn't found by OCR
 */
export const missingTextEntries = pgTable('missing_text_entries', {
  id: uuid('id').primaryKey().defaultRandom(),
  extractionResultId: uuid('extraction_result_id')
    .notNull()
    .references(() => extractionResults.id),
  drawingId: text('drawing_id')
    .notNull()
    .references(() => testDrawings.drawingId),

  // The text that should have been detected
  text: text('text').notNull(),

  // Optional estimated location where this text should be
  estimatedLocation: jsonb('estimated_location').$type<{
    x?: number;
    y?: number;
    width?: number;
    height?: number;
    page?: number;
  }>(),

  // Optional notes
  notes: text('notes'),

  // When this missing text was added
  addedAt: timestamp('added_at').defaultNow().notNull(),
  metadata: jsonb('metadata').$type<Record<string, any>>(),
});
