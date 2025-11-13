#!/usr/bin/env tsx

import * as dotenv from 'dotenv';
import { processWithGeminiGeometric } from './processors/gemini-geometric-processor.js';
import { processWithRoboflow } from './processors/roboflow-wall-detector-processor.js';
import { processWithHybridDetector } from './processors/hybrid-wall-detector-processor.js';
import { db, testRuns, testDrawings } from './db/index.js';
import { eq } from 'drizzle-orm';

dotenv.config({ path: '.env.development' });

/**
 * Wall Detection Test Script
 * Compares different wall detection approaches on floor plan images
 */

interface TestResult {
  approach: string;
  success: boolean;
  objectCount: number;
  processingTime: number;
  cost: number;
  error?: string;
}

async function testWallDetection(drawingName: string) {
  console.log('\n' + '='.repeat(80));
  console.log(`WALL DETECTION TEST: ${drawingName}`);
  console.log('='.repeat(80) + '\n');

  // Get or create drawing from database
  let [drawing] = await db
    .select()
    .from(testDrawings)
    .where(eq(testDrawings.drawingId, drawingName))
    .limit(1);

  if (!drawing) {
    console.log(`Drawing "${drawingName}" not found in database, creating...`);

    // Try to find the image file
    const imagePath = `test-drawings/${drawingName}/${drawingName}.png`;
    const fs = await import('fs');

    if (!fs.existsSync(imagePath)) {
      console.error(`Image file not found: ${imagePath}`);
      process.exit(1);
    }

    // Create the drawing
    [drawing] = await db
      .insert(testDrawings)
      .values({
        drawingId: drawingName,
        fileName: `${drawingName}.png`,
        filePath: imagePath,
        type: 'floor-plan',
        quality: 'high',
        source: 'synthetic',
        groundTruth: {
          fullText: '', // No ground truth for wall detection
        },
        metadata: {},
      })
      .returning();

    console.log(`✓ Created drawing: ${drawingName}`);
  }

  const imagePath = drawing.filePath;
  console.log(`Image: ${imagePath}\n`);

  // Create test run
  const [testRun] = await db
    .insert(testRuns)
    .values({
      runName: `Wall Detection Test - ${drawingName}`,
      description: 'Comparing wall detection approaches: Gemini Geometric, Roboflow, Hybrid CV+AI',
      drawingIds: [drawing.drawingId],
      tools: ['gemini-geometric', 'roboflow', 'hybrid-cv-ai'],
      summary: {
        totalDrawings: 1,
        totalExtractions: 0,
        avgCharacterErrorRateByTool: {},
      },
      isActive: false,
      startedAt: new Date(),
    })
    .returning();

  const results: TestResult[] = [];

  // Test 1: Improved Gemini Geometric
  console.log('\n' + '-'.repeat(80));
  console.log('TEST 1: Gemini Geometric (Improved Prompts)');
  console.log('-'.repeat(80));
  try {
    const result = await processWithGeminiGeometric(imagePath, drawing.drawingId);
    results.push({
      approach: 'Gemini Geometric',
      success: result.success,
      objectCount: result.objectCount,
      processingTime: result.processingTime,
      cost: result.cost,
    });
  } catch (error) {
    console.error('Failed:', error);
    results.push({
      approach: 'Gemini Geometric',
      success: false,
      objectCount: 0,
      processingTime: 0,
      cost: 0,
      error: error instanceof Error ? error.message : String(error),
    });
  }

  // Test 2: Roboflow (if API key is available)
  console.log('\n' + '-'.repeat(80));
  console.log('TEST 2: Roboflow Pre-trained Models');
  console.log('-'.repeat(80));
  if (process.env.ROBOFLOW_API_KEY) {
    try {
      const result = await processWithRoboflow(imagePath, drawing.drawingId, 'both');
      results.push({
        approach: 'Roboflow',
        success: result.success,
        objectCount: result.objectCount,
        processingTime: result.processingTime,
        cost: result.cost,
      });
    } catch (error) {
      console.error('Failed:', error);
      results.push({
        approach: 'Roboflow',
        success: false,
        objectCount: 0,
        processingTime: 0,
        cost: 0,
        error: error instanceof Error ? error.message : String(error),
      });
    }
  } else {
    console.warn('ROBOFLOW_API_KEY not set - skipping Roboflow test');
    console.log(
      'Get your API key from https://roboflow.com/ and add it to .env.development'
    );
    results.push({
      approach: 'Roboflow',
      success: false,
      objectCount: 0,
      processingTime: 0,
      cost: 0,
      error: 'API key not configured',
    });
  }

  // Test 3: Hybrid OpenCV + Gemini
  console.log('\n' + '-'.repeat(80));
  console.log('TEST 3: Hybrid OpenCV + Gemini');
  console.log('-'.repeat(80));
  try {
    const result = await processWithHybridDetector(imagePath, drawing.drawingId);
    results.push({
      approach: 'Hybrid CV+AI',
      success: result.success,
      objectCount: result.objectCount,
      processingTime: result.processingTime,
      cost: result.cost,
    });
  } catch (error) {
    console.error('Failed:', error);
    results.push({
      approach: 'Hybrid CV+AI',
      success: false,
      objectCount: 0,
      processingTime: 0,
      cost: 0,
      error: error instanceof Error ? error.message : String(error),
    });
  }

  // Update test run
  await db
    .update(testRuns)
    .set({
      completedAt: new Date(),
      status: 'completed',
    })
    .where(eq(testRuns.id, testRun.id));

  // Print comparison results
  console.log('\n' + '='.repeat(80));
  console.log('COMPARISON RESULTS');
  console.log('='.repeat(80) + '\n');

  console.log('Approach              | Success | Objects | Time (s) | Cost (¥) | Notes');
  console.log('-'.repeat(80));

  results.forEach((r) => {
    const approach = r.approach.padEnd(20);
    const success = r.success ? ' ✓ ' : ' ✗ ';
    const objects = r.objectCount.toString().padStart(7);
    const time = (r.processingTime / 1000).toFixed(2).padStart(8);
    const cost = `¥${r.cost.toFixed(2)}`.padStart(8);
    const notes = r.error ? `Error: ${r.error}` : '';

    console.log(`${approach} | ${success}   | ${objects} | ${time} | ${cost} | ${notes}`);
  });

  console.log('\n' + '='.repeat(80));
  console.log('SUMMARY');
  console.log('='.repeat(80) + '\n');

  const successful = results.filter((r) => r.success);
  if (successful.length > 0) {
    const best = successful.reduce((a, b) =>
      a.objectCount > b.objectCount ? a : b
    );
    const fastest = successful.reduce((a, b) =>
      a.processingTime < b.processingTime ? a : b
    );
    const cheapest = successful.reduce((a, b) => (a.cost < b.cost ? a : b));

    console.log(`Most objects detected: ${best.approach} (${best.objectCount} objects)`);
    console.log(`Fastest: ${fastest.approach} (${(fastest.processingTime / 1000).toFixed(2)}s)`);
    console.log(`Cheapest: ${cheapest.approach} (¥${cheapest.cost.toFixed(2)})`);
  } else {
    console.log('All approaches failed!');
  }

  console.log('\nTest Run ID:', testRun.id);
  console.log(
    'View detailed results in the database or frontend UI.'
  );
}

// Main execution
const args = process.argv.slice(2);
const drawingName = args[0] || 'just-box-sample';

testWallDetection(drawingName)
  .then(() => {
    console.log('\n✓ Wall detection test completed!\n');
    process.exit(0);
  })
  .catch((error) => {
    console.error('\n✗ Test failed:', error);
    process.exit(1);
  });
