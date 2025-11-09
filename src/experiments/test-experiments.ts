#!/usr/bin/env node

import {
  db,
  testDrawings,
  extractionResults,
  accuracyMetrics,
  testRuns,
} from '../db/index.js';
import { processWithGeminiTemplateMatching } from './gemini-coords/gemini-template-matching-processor.js';
import { processWithGeminiMultiOCRFusion } from './gemini-coords/gemini-multi-ocr-fusion-processor.js';
import { processWithGeminiGridOverlay } from './gemini-coords/gemini-grid-overlay-processor.js';
import { processWithGeminiGridOverlay20x20 } from './gemini-coords/gemini-grid-overlay-20x20.js';
import { processWithGeminiGridOverlay40x40 } from './gemini-coords/gemini-grid-overlay-40x40.js';
import { processWithGeminiGridOverlay80x80 } from './gemini-coords/gemini-grid-overlay-80x80.js';
import { processWithGeminiGridOverlay100x100 } from './gemini-coords/gemini-grid-overlay-100x100.js';
import { processWithGeminiRegionDetection } from './gemini-coords/gemini-region-detection-processor.js';
import { processWithGeminiBboxSynthesis } from '../processors/gemini-bbox-synthesis-processor.js';
import { accuracyCalculatorTool } from '../mastra/tools/accuracy-calculator.js';
import * as fs from 'fs';
import * as path from 'path';
import * as dotenv from 'dotenv';
import { eq } from 'drizzle-orm';

dotenv.config({ path: '.env.development' });

interface CliArgs {
  experiment?: string;
  drawing?: string;
}

function parseArgs(): CliArgs {
  const args = process.argv.slice(2);
  const result: CliArgs = {};

  for (let i = 0; i < args.length; i++) {
    const arg = args[i];
    if (arg === '--experiment' && args[i + 1]) {
      result.experiment = args[i + 1];
      i++;
    } else if (arg === '--drawing' && args[i + 1]) {
      result.drawing = args[i + 1];
      i++;
    }
  }

  return result;
}

async function runExperiment(
  experiment: string,
  imagePath: string,
  drawingId: string
) {
  console.log(`\n▶️  Running ${experiment}...`);

  try {
    let result;

    if (experiment === 'template-matching') {
      result = await processWithGeminiTemplateMatching(imagePath, drawingId);
    } else if (experiment === 'multi-ocr-fusion') {
      result = await processWithGeminiMultiOCRFusion(imagePath, drawingId);
    } else if (experiment === 'grid-overlay') {
      result = await processWithGeminiGridOverlay(imagePath, drawingId);
    } else if (experiment === 'grid-20x20') {
      result = await processWithGeminiGridOverlay20x20(imagePath, drawingId);
    } else if (experiment === 'grid-40x40') {
      result = await processWithGeminiGridOverlay40x40(imagePath, drawingId);
    } else if (experiment === 'grid-80x80') {
      result = await processWithGeminiGridOverlay80x80(imagePath, drawingId);
    } else if (experiment === 'grid-100x100') {
      result = await processWithGeminiGridOverlay100x100(imagePath, drawingId);
    } else if (experiment === 'region-detection') {
      result = await processWithGeminiRegionDetection(imagePath, drawingId);
    } else if (experiment === 'baseline') {
      // Run baseline (existing gemini-bbox-synthesis) for comparison
      result = await processWithGeminiBboxSynthesis(imagePath, drawingId);
    } else {
      throw new Error(`Unknown experiment: ${experiment}`);
    }

    return result;
  } catch (error) {
    console.error(`❌ Error running ${experiment}:`, error);
    throw error;
  }
}

async function calculateAccuracy(extractionResultId: string, groundTruth: any) {
  const [result] = await db
    .select()
    .from(extractionResults)
    .where(eq(extractionResults.id, extractionResultId));

  if (!result || !result.rawText) {
    console.error('❌ No extraction text found');
    return null;
  }

  if (!groundTruth?.fullText) {
    console.log(
      'ℹ️  No ground truth available - skipping accuracy calculation'
    );
    return null;
  }

  const accuracyResult = await accuracyCalculatorTool.execute({
    context: {
      extractedText: result.rawText,
      groundTruthText: groundTruth.fullText,
      confidenceScore: undefined,
      boundingBoxes: result.boundingBoxes || undefined,
    },
  });

  await db.insert(accuracyMetrics).values({
    extractionResultId,
    drawingId: result.drawingId,
    tool: result.tool,
    characterErrorRate: accuracyResult.characterErrorRate,
    characterAccuracy: accuracyResult.characterAccuracy,
    characterSetCoverage: accuracyResult.characterSetCoverage,
    extractedCharCount: accuracyResult.extractedCharCount,
    groundTruthCharCount: accuracyResult.groundTruthCharCount,
    exactCharCountMatch: accuracyResult.exactCharCountMatch,
    charCountDifference: accuracyResult.charCountDifference,
    editDistance: accuracyResult.editDistance,
    avgConfidenceScore: accuracyResult.avgConfidenceScore,
    bboxSourceStats: accuracyResult.bboxSourceStats,
    breakdown: accuracyResult.breakdown,
  });

  return accuracyResult;
}

async function main() {
  console.log('🧪 Experimental OCR Processor Test Runner\n');
  console.log('Testing Gemini Coordinate Accuracy Experiments\n');

  const args = parseArgs();
  const experimentToRun = args.experiment || 'all';

  // Load test drawings
  const testDrawingsDir = path.join(process.cwd(), 'test-drawings');
  if (!fs.existsSync(testDrawingsDir)) {
    console.error('❌ test-drawings directory not found');
    process.exit(1);
  }

  // Find drawings
  const drawings: Array<{ fileName: string; filePath: string; metadata: any }> =
    [];

  const scanDir = (dir: string) => {
    const files = fs.readdirSync(dir, { withFileTypes: true });

    for (const file of files) {
      if (file.isDirectory()) {
        const subDir = path.join(dir, file.name);
        scanDir(subDir);
      } else if (
        ['.png', '.jpg', '.jpeg'].some((ext) => file.name.endsWith(ext))
      ) {
        const filePath = path.join(dir, file.name);
        const baseName = file.name.replace(/\.(png|jpg|jpeg)$/, '');
        const metadataPath = path.join(dir, `${baseName}-metadata.json`);

        let metadata = null;
        if (fs.existsSync(metadataPath)) {
          metadata = JSON.parse(fs.readFileSync(metadataPath, 'utf-8'));

          // Load ground truth from external file
          if (metadata?.groundTruth?.fullTextFile) {
            const textFilePath = path.join(
              dir,
              metadata.groundTruth.fullTextFile
            );
            if (fs.existsSync(textFilePath)) {
              metadata.groundTruth.fullText = fs.readFileSync(
                textFilePath,
                'utf-8'
              );
            }
          }
        }

        drawings.push({ fileName: file.name, filePath, metadata });
      }
    }
  };

  scanDir(testDrawingsDir);

  if (drawings.length === 0) {
    console.error('❌ No test drawings found');
    process.exit(1);
  }

  console.log(`✅ Found ${drawings.length} test drawing(s)\n`);

  // Determine which experiments to run
  const availableExperiments = [
    'template-matching',
    'multi-ocr-fusion',
    'grid-overlay',
    'grid-20x20',
    'grid-40x40',
    'grid-80x80',
    'grid-100x100',
    'region-detection',
    'baseline', // For comparison
  ];

  const experimentsToRun =
    experimentToRun === 'all' ? availableExperiments : [experimentToRun];

  console.log(`📋 Experiments to run: ${experimentsToRun.join(', ')}\n`);

  // Create test run
  const experimentToolNames = experimentsToRun.map((exp) => {
    if (exp === 'baseline') return 'gemini-bbox-synthesis';
    if (exp === 'grid-20x20') return 'exp-gemini-grid-20x20';
    if (exp === 'grid-40x40') return 'exp-gemini-grid-40x40';
    if (exp === 'grid-80x80') return 'exp-gemini-grid-80x80';
    if (exp === 'grid-100x100') return 'exp-gemini-grid-100x100';
    return `exp-gemini-${exp}`;
  });

  const [testRun] = await db
    .insert(testRuns)
    .values({
      runName: `Experiment Run ${new Date().toISOString()}`,
      description: `Testing Gemini coordinate accuracy experiments: ${experimentsToRun.join(', ')}`,
      drawingIds: drawings.map((d) => d.metadata?.id || d.fileName),
      tools: experimentToolNames,
      summary: {
        totalDrawings: drawings.length,
        totalExtractions: 0,
        avgCharacterErrorRateByTool: {},
        avgCharacterAccuracyByTool: {},
        avgProcessingTimeByTool: {},
        totalCostByTool: {},
        recommendedTool: '',
        notes:
          'Experimental processors testing different approaches to get accurate bboxes for Gemini-detected text',
      },
    })
    .returning();

  console.log(`📝 Created test run: ${testRun.id}\n`);

  // Run experiments
  const results: Array<{
    experiment: string;
    drawingId: string;
    accuracy: any;
    cost: number;
    time: number;
    bboxStats?: any;
  }> = [];

  for (const drawing of drawings) {
    const drawingId = drawing.metadata?.id || drawing.fileName;

    console.log(`\n${'='.repeat(80)}`);
    console.log(`📄 Testing: ${drawing.fileName}`);
    console.log(`${'='.repeat(80)}`);

    // Register drawing in database
    try {
      await db
        .insert(testDrawings)
        .values({
          drawingId,
          fileName: drawing.fileName,
          filePath: drawing.filePath,
          type: drawing.metadata?.type || 'unknown',
          quality: drawing.metadata?.quality || 'medium',
          source: drawing.metadata?.source || 'test',
          groundTruth: drawing.metadata?.groundTruth || {},
          metadata: drawing.metadata || {},
        })
        .onConflictDoUpdate({
          target: testDrawings.drawingId,
          set: {
            groundTruth: drawing.metadata?.groundTruth || {},
          },
        });
    } catch (err) {
      console.warn('⚠️  Could not register drawing:', err);
    }

    for (const experiment of experimentsToRun) {
      try {
        console.log(`\n${'─'.repeat(80)}`);
        console.log(`🔬 Experiment: ${experiment}`);
        console.log(`${'─'.repeat(80)}`);

        const result = await runExperiment(
          experiment,
          drawing.filePath,
          drawingId
        );

        if (result.extractionResultId) {
          const accuracy = await calculateAccuracy(
            result.extractionResultId,
            drawing.metadata?.groundTruth
          );

          if (accuracy) {
            console.log(`\n  📊 Accuracy Metrics:`);
            const cer = accuracy.characterErrorRate ?? 0;
            const charAcc = accuracy.characterAccuracy ?? 0;
            const coverage = accuracy.characterSetCoverage ?? 0;
            console.log(`     CER: ${(cer * 100).toFixed(2)}%`);
            console.log(`     Character Accuracy: ${charAcc.toFixed(1)}%`);
            console.log(`     Coverage: ${coverage.toFixed(1)}%`);
            console.log(
              `     Chars: ${accuracy.extractedCharCount}/${accuracy.groundTruthCharCount}`
            );

            if (accuracy.bboxSourceStats) {
              console.log(`\n  📍 Bbox Sources:`);
              if (accuracy.bboxSourceStats.ocr) {
                console.log(`     OCR: ${accuracy.bboxSourceStats.ocr}`);
              }
              if (accuracy.bboxSourceStats.geminiPercentage) {
                console.log(
                  `     Gemini %: ${accuracy.bboxSourceStats.geminiPercentage}`
                );
              }
              if (accuracy.bboxSourceStats.synthesized) {
                console.log(
                  `     Synthesized: ${accuracy.bboxSourceStats.synthesized}`
                );
              }
              if (accuracy.bboxSourceStats.estimated) {
                console.log(
                  `     Estimated: ${accuracy.bboxSourceStats.estimated}`
                );
              }
              if (accuracy.bboxSourceStats.spatialSearch) {
                console.log(
                  `     Spatial Search: ${accuracy.bboxSourceStats.spatialSearch}`
                );
              }
              if (accuracy.bboxSourceStats.templateMatch) {
                console.log(
                  `     Template Match: ${accuracy.bboxSourceStats.templateMatch}`
                );
              }
            }
          }

          results.push({
            experiment,
            drawingId,
            accuracy,
            cost: result.cost || 0,
            time: result.processingTime || 0,
            bboxStats: accuracy?.bboxSourceStats,
          });
        }

        // Small delay between experiments to avoid rate limiting
        if (
          experimentsToRun.indexOf(experiment) <
          experimentsToRun.length - 1
        ) {
          await new Promise((resolve) => setTimeout(resolve, 2000)); // 2 second delay
        }
      } catch (error) {
        console.error(`❌ Experiment ${experiment} failed:`);
        if (error instanceof Error) {
          console.error(`   ${error.message}`);
          if (error.stack) {
            console.error(`   Stack: ${error.stack.split('\n')[1]?.trim()}`);
          }
        } else {
          console.error(`   ${error}`);
        }
        console.log(`   Continuing with next experiment...\n`);
      }
    }
  }

  // Summary
  console.log(`\n\n${'='.repeat(80)}`);
  console.log('📊 EXPERIMENT COMPARISON SUMMARY');
  console.log(`${'='.repeat(80)}\n`);

  if (results.length > 0) {
    // Group by experiment
    const byExperiment = results.reduce(
      (acc, r) => {
        if (!acc[r.experiment]) acc[r.experiment] = [];
        acc[r.experiment].push(r);
        return acc;
      },
      {} as Record<string, typeof results>
    );

    console.log(
      'Experiment             | Avg CER  | Avg Accuracy | Avg Cost | Avg Time'
    );
    console.log('-'.repeat(80));

    for (const [experiment, expResults] of Object.entries(byExperiment)) {
      const resultsWithAccuracy = expResults.filter((r) => r.accuracy);
      const avgCER =
        resultsWithAccuracy.length > 0
          ? resultsWithAccuracy.reduce(
              (sum, r) => sum + (r.accuracy.characterErrorRate ?? 0),
              0
            ) / resultsWithAccuracy.length
          : 0;
      const avgAccuracy =
        resultsWithAccuracy.length > 0
          ? resultsWithAccuracy.reduce(
              (sum, r) => sum + (r.accuracy.characterAccuracy ?? 0),
              0
            ) / resultsWithAccuracy.length
          : 0;
      const avgCost =
        expResults.length > 0
          ? expResults.reduce((sum, r) => sum + r.cost, 0) / expResults.length
          : 0;
      const avgTime =
        expResults.length > 0
          ? expResults.reduce((sum, r) => sum + r.time, 0) / expResults.length
          : 0;

      console.log(
        `${experiment.padEnd(22)} | ${(avgCER * 100).toFixed(2)}%  | ${avgAccuracy.toFixed(1)}%       | ¥${avgCost.toFixed(2)}  | ${(avgTime / 1000).toFixed(1)}s`
      );
    }

    console.log('\n');

    // Find best performer
    const withAccuracy = results.filter((r) => r.accuracy);
    if (withAccuracy.length > 0) {
      const best = withAccuracy.reduce((best, r) => {
        const rCER = r.accuracy.characterErrorRate ?? Infinity;
        const bestCER = best.accuracy.characterErrorRate ?? Infinity;
        return rCER < bestCER ? r : best;
      });

      const bestCER = best.accuracy.characterErrorRate ?? 0;
      console.log(
        `🏆 Best CER: ${best.experiment} (${(bestCER * 100).toFixed(2)}%)`
      );

      const mostComplete = withAccuracy.reduce((best, r) => {
        const rCoverage = r.accuracy.characterSetCoverage ?? 0;
        const bestCoverage = best.accuracy.characterSetCoverage ?? 0;
        return rCoverage > bestCoverage ? r : best;
      });

      const bestCoverage = mostComplete.accuracy.characterSetCoverage ?? 0;
      console.log(
        `📝 Best Coverage: ${mostComplete.experiment} (${bestCoverage.toFixed(1)}%)`
      );
    }
  } else {
    console.log('No results to compare');
  }

  // Update test run with summary statistics
  if (results.length > 0) {
    const byExperiment = results.reduce(
      (acc, r) => {
        if (!acc[r.experiment]) acc[r.experiment] = [];
        acc[r.experiment].push(r);
        return acc;
      },
      {} as Record<string, typeof results>
    );

    const avgCharacterErrorRateByTool: Record<string, number> = {};
    const avgCharacterAccuracyByTool: Record<string, number> = {};
    const avgProcessingTimeByTool: Record<string, number> = {};
    const totalCostByTool: Record<string, number> = {};

    for (const [experiment, expResults] of Object.entries(byExperiment)) {
      let toolName: string;
      if (experiment === 'baseline') {
        toolName = 'gemini-bbox-synthesis';
      } else if (experiment === 'grid-20x20') {
        toolName = 'exp-gemini-grid-20x20';
      } else if (experiment === 'grid-40x40') {
        toolName = 'exp-gemini-grid-40x40';
      } else if (experiment === 'grid-80x80') {
        toolName = 'exp-gemini-grid-80x80';
      } else if (experiment === 'grid-100x100') {
        toolName = 'exp-gemini-grid-100x100';
      } else {
        toolName = `exp-gemini-${experiment}`;
      }
      const resultsWithAccuracy = expResults.filter((r) => r.accuracy);

      avgCharacterErrorRateByTool[toolName] =
        resultsWithAccuracy.length > 0
          ? resultsWithAccuracy.reduce(
              (sum, r) => sum + (r.accuracy.characterErrorRate ?? 0),
              0
            ) / resultsWithAccuracy.length
          : 0;

      avgCharacterAccuracyByTool[toolName] =
        resultsWithAccuracy.length > 0
          ? resultsWithAccuracy.reduce(
              (sum, r) => sum + (r.accuracy.characterAccuracy ?? 0),
              0
            ) / resultsWithAccuracy.length
          : 0;

      avgProcessingTimeByTool[toolName] =
        expResults.length > 0
          ? expResults.reduce((sum, r) => sum + r.time, 0) / expResults.length
          : 0;

      totalCostByTool[toolName] = expResults.reduce(
        (sum, r) => sum + r.cost,
        0
      );
    }

    // Find recommended tool (best CER)
    const withAccuracy = results.filter((r) => r.accuracy);
    const recommendedTool =
      withAccuracy.length > 0
        ? withAccuracy.reduce((best, r) => {
            const rCER = r.accuracy.characterErrorRate ?? Infinity;
            const bestCER = best.accuracy.characterErrorRate ?? Infinity;
            return rCER < bestCER ? r : best;
          }).experiment
        : '';

    let recommendedToolName: string;
    if (recommendedTool === 'baseline') {
      recommendedToolName = 'gemini-bbox-synthesis';
    } else if (recommendedTool === 'grid-20x20') {
      recommendedToolName = 'exp-gemini-grid-20x20';
    } else if (recommendedTool === 'grid-40x40') {
      recommendedToolName = 'exp-gemini-grid-40x40';
    } else if (recommendedTool === 'grid-80x80') {
      recommendedToolName = 'exp-gemini-grid-80x80';
    } else if (recommendedTool === 'grid-100x100') {
      recommendedToolName = 'exp-gemini-grid-100x100';
    } else {
      recommendedToolName = `exp-gemini-${recommendedTool}`;
    }

    await db
      .update(testRuns)
      .set({
        summary: {
          totalDrawings: drawings.length,
          totalExtractions: results.length,
          avgCharacterErrorRateByTool,
          avgCharacterAccuracyByTool,
          avgProcessingTimeByTool,
          totalCostByTool,
          recommendedTool: recommendedToolName,
          notes:
            'Experimental processors testing different approaches to get accurate bboxes for Gemini-detected text',
        },
        completed: true,
        completedAt: new Date(),
      })
      .where(eq(testRuns.id, testRun.id));

    console.log(`\n📊 Updated test run with summary statistics`);
  }

  console.log('\n✅ Experiments complete!\n');
  console.log(`🔗 View results in frontend:`);
  console.log(`   1. Start API server: npm run api:dev`);
  console.log(`   2. Start frontend: cd frontend && npm run dev`);
  console.log(`   3. Open: http://localhost:5173/test-run/${testRun.id}\n`);
}

main().catch(console.error);
