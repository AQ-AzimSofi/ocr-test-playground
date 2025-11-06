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
    dimensions: Array<{
      value: string;
      x?: number;
      y?: number;
      element?: string;
      type?: string;
    }>;
    equipment: Array<{
      name: string;
      spec?: string;
      x?: number;
      y?: number;
    }>;
    areas: Array<{
      name: string;
      width?: string;
      depth?: string;
      size?: string;
    }>;
    distances?: Array<{
      value: string;
      between?: string[];
    }>;
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

  // Raw extraction output
  rawText: text('raw_text'),
  extractedData: jsonb('extracted_data').$type<{
    dimensions?: Array<{
      value: string;
      location?: string;
      element?: string;
      type?: string;
      confidence?: number;
    }>;
    equipment?: Array<{
      name: string;
      spec?: string;
      position?: { x: number; y: number };
      confidence?: number;
    }>;
    areas?: Array<{
      name: string;
      size?: string;
      confidence?: number;
    }>;
    distances?: Array<{
      value: string;
      between?: string[];
      confidence?: number;
    }>;
  }>(),

  // Bounding boxes (if available)
  boundingBoxes: jsonb('bounding_boxes').$type<Array<{
    text: string;
    bounds: Array<{ x: number; y: number }>;
  }>>(),

  // Performance metrics
  processingTimeMs: real('processing_time_ms'),
  apiCost: real('api_cost'), // in yen

  createdAt: timestamp('created_at').defaultNow().notNull(),
});

/**
 * Accuracy metrics calculated by comparing extraction results with ground truth
 */
export const accuracyMetrics = pgTable('accuracy_metrics', {
  id: uuid('id').primaryKey().defaultRandom(),
  extractionResultId: uuid('extraction_result_id').notNull().references(() => extractionResults.id),
  drawingId: text('drawing_id').notNull().references(() => testDrawings.drawingId),
  tool: text('tool').notNull(),

  // Text accuracy (if OCR was performed)
  characterAccuracy: real('character_accuracy'), // %
  wordAccuracy: real('word_accuracy'), // %

  // Dimension extraction metrics
  dimensionsFound: integer('dimensions_found'),
  dimensionsTotal: integer('dimensions_total'),
  dimensionsCorrect: integer('dimensions_correct'),
  dimensionRecall: real('dimension_recall'), // found/total
  dimensionPrecision: real('dimension_precision'), // correct/found
  dimensionF1Score: real('dimension_f1_score'),

  // Equipment/label extraction metrics
  equipmentFound: integer('equipment_found'),
  equipmentTotal: integer('equipment_total'),
  equipmentCorrect: integer('equipment_correct'),
  equipmentRecall: real('equipment_recall'),
  equipmentPrecision: real('equipment_precision'),
  equipmentF1Score: real('equipment_f1_score'),

  // Area extraction metrics
  areasFound: integer('areas_found'),
  areasTotal: integer('areas_total'),
  areasCorrect: integer('areas_correct'),
  areaRecall: real('area_recall'),
  areaPrecision: real('area_precision'),

  // Overall confidence score
  avgConfidenceScore: real('avg_confidence_score'),

  // Detailed breakdown
  breakdown: jsonb('breakdown').$type<{
    dimensionErrors?: string[];
    equipmentErrors?: string[];
    areaErrors?: string[];
    falsePositives?: string[];
    falseNegatives?: string[];
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
    dimensionAccuracy: { toolA: number; toolB: number; winner: string };
    equipmentAccuracy: { toolA: number; toolB: number; winner: string };
    processingTime: { toolA: number; toolB: number; winner: string };
    cost: { toolA: number; toolB: number; winner: string };
    overallScore: { toolA: number; toolB: number; winner: string };
  }>(),

  // Agreement analysis (how often both tools found the same data)
  agreement: jsonb('agreement').$type<{
    dimensionsAgreed: number;
    equipmentAgreed: number;
    totalAgreement: number; // %
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
    avgAccuracyByTool: Record<string, number>;
    avgProcessingTimeByTool: Record<string, number>;
    totalCostByTool: Record<string, number>;
    recommendedTool: string;
    notes: string;
  }>(),

  completed: boolean('completed').default(false),
  startedAt: timestamp('started_at').defaultNow().notNull(),
  completedAt: timestamp('completed_at'),
});
