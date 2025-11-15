#!/usr/bin/env node

/**
 * Utility script to execute a test run by ID
 * Useful for completing test runs that were created via the API but not executed
 *
 * Usage: npx tsx src/utils/run-test-by-id.ts <test-run-id>
 */

import { db, testRuns, testDrawings, extractionResults } from '../db/index.js';
import { eq, inArray } from 'drizzle-orm';
import { processWithCloudVision } from '../processors/cloud-vision-processor.js';
import { processWithAzureRead } from '../processors/azure-read-processor.js';
import { processWithAzureLayout } from '../processors/azure-layout-processor.js';
import { processWithDocumentAI } from '../processors/document-ai-processor.js';
import { processWithGemini } from '../processors/old/gemini-processor.js';
import { processWithGeminiGeometric } from '../processors/gemini-geometric-processor.js';
import { processWithGeminiCoordinates } from '../processors/gemini-coordinates-processor.js';
import { processWithGeminiSelfCalibrating } from '../processors/gemini-self-calibrating-processor.js';
import { processWithHybridDetector } from '../processors/hybrid-wall-detector-processor.js';
import { processWithCloudVisionGeminiHybrid } from '../processors/cloud-vision-gemini-hybrid-processor.js';
import { processWithAzureReadGeminiHybrid } from '../processors/azure-read-gemini-hybrid-processor.js';
import { processWithAzureLayoutGeminiHybrid } from '../processors/azure-layout-gemini-hybrid-processor.js';
import { processWithDocumentAIGeminiHybrid } from '../processors/document-ai-gemini-hybrid-processor.js';
import { accuracyCalculatorTool } from '../mastra/tools/accuracy-calculator.js';
import * as dotenv from 'dotenv';

dotenv.config({ path: '.env.development' });

async function runTestById(testRunId: string) {
  console.log('='.repeat(80));
  console.log(`Running Test Run: ${testRunId}`);
  console.log('='.repeat(80));
  console.log('');

  // Load test run from database
  const [testRun] = await db
    .select()
    .from(testRuns)
    .where(eq(testRuns.id, testRunId))
    .limit(1);

  if (!testRun) {
    console.error(`[ERROR] Test run not found: ${testRunId}`);
    process.exit(1);
  }

  console.log(`Test Run: ${testRun.runName}`);
  console.log(`Description: ${testRun.description || 'N/A'}`);
  console.log(`Processors: ${testRun.tools?.join(', ') || 'None'}`);
  console.log(`Drawings: ${testRun.drawingIds?.length || 0}`);
  console.log('');

  if (!testRun.tools || testRun.tools.length === 0) {
    console.error('[ERROR] No processors specified in test run');
    process.exit(1);
  }

  if (!testRun.drawingIds || testRun.drawingIds.length === 0) {
    console.error('[ERROR] No drawings specified in test run');
    process.exit(1);
  }

  // Load drawings
  const drawings = await db
    .select()
    .from(testDrawings)
    .where(inArray(testDrawings.drawingId, testRun.drawingIds));

  console.log(`Loaded ${drawings.length} drawing(s)`);
  console.log('');

  // Process each drawing with each processor
  let totalProcessed = 0;
  let totalErrors = 0;

  for (const drawing of drawings) {
    console.log('─'.repeat(80));
    console.log(`Processing: ${drawing.fileName}`);
    console.log('─'.repeat(80));

    for (const processor of testRun.tools) {
      try {
        console.log(`\n  Running ${processor}...`);

        const result = await runProcessor(processor, drawing.filePath, drawing.drawingId);

        if (result?.extractionResultId) {
          console.log(`  [OK] Completed (${result.processingTime}ms, ¥${result.cost?.toFixed(2) || '0.00'})`);
          totalProcessed++;

          // Calculate accuracy if ground truth exists
          if (drawing.groundTruth) {
            try {
              const accuracy = await accuracyCalculatorTool.execute({
                extractionResultId: result.extractionResultId,
                groundTruthData: drawing.groundTruth,
              });

              if (accuracy.success) {
                console.log(`  [OK] Extraction Accuracy: ${(accuracy.data.orderIndependentAccuracy || 0).toFixed(2)}%`);
              }
            } catch (err) {
              console.warn(`  [WARN] Failed to calculate accuracy:`, err);
            }
          }
        } else {
          console.log(`  [WARN] No result returned`);
        }
      } catch (error) {
        console.error(`  [ERROR] Error:`, error instanceof Error ? error.message : String(error));
        totalErrors++;
      }
    }
  }

  console.log('');
  console.log('='.repeat(80));
  console.log('Summary');
  console.log('='.repeat(80));
  console.log(`Total processed: ${totalProcessed}`);
  console.log(`Total errors: ${totalErrors}`);
  console.log('');

  // Mark test run as completed
  await db
    .update(testRuns)
    .set({
      completed: true,
      completedAt: new Date(),
      status: 'completed',
    })
    .where(eq(testRuns.id, testRunId));

  console.log('[OK] Test run marked as completed');
  console.log('');
  console.log(`View results at: http://localhost:5173/test-run/${testRunId}`);
}

async function runProcessor(processor: string, imagePath: string, drawingId: string) {
  switch (processor) {
    case 'cloud-vision':
      return await processWithCloudVision(imagePath, drawingId);
    case 'azure-read':
      return await processWithAzureRead(imagePath, drawingId);
    case 'azure-layout':
      return await processWithAzureLayout(imagePath, drawingId);
    case 'document-ai':
      return await processWithDocumentAI(imagePath, drawingId);
    case 'gemini':
      return await processWithGemini(imagePath, drawingId);
    case 'gemini-geometric':
      return await processWithGeminiGeometric(imagePath, drawingId);
    case 'gemini-coordinates':
      return await processWithGeminiCoordinates(imagePath, drawingId);
    case 'gemini-self-calibrating':
      return await processWithGeminiSelfCalibrating(imagePath, drawingId);
    case 'hybrid-cv-ai':
      return await processWithHybridDetector(imagePath, drawingId);
    case 'cloud-vision-gemini-hybrid':
      return await processWithCloudVisionGeminiHybrid(imagePath, drawingId);
    case 'azure-read-gemini-hybrid':
      return await processWithAzureReadGeminiHybrid(imagePath, drawingId);
    case 'azure-layout-gemini-hybrid':
      return await processWithAzureLayoutGeminiHybrid(imagePath, drawingId);
    case 'document-ai-gemini-hybrid':
      return await processWithDocumentAIGeminiHybrid(imagePath, drawingId);
    default:
      throw new Error(`Unknown processor: ${processor}`);
  }
}

// Main execution
const testRunId = process.argv[2];

if (!testRunId) {
  console.error('Usage: npx tsx src/utils/run-test-by-id.ts <test-run-id>');
  process.exit(1);
}

runTestById(testRunId)
  .then(() => {
    console.log('[OK] Done!');
    process.exit(0);
  })
  .catch((error) => {
    console.error('[ERROR] Fatal error:', error);
    process.exit(1);
  });
