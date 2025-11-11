#!/usr/bin/env node

import {
  db,
  testDrawings,
  extractionResults,
  accuracyMetrics,
  testRuns,
} from './db/index.js';
import { processWithGemini } from './processors/gemini-processor.js';
import { processWithCloudVisionGeminiHybrid } from './processors/cloud-vision-gemini-hybrid-processor.js';
import { processWithAzureReadGeminiHybrid } from './processors/azure-read-gemini-hybrid-processor.js';
import { processWithAzureLayoutGeminiHybrid } from './processors/azure-layout-gemini-hybrid-processor.js';
import { processWithGeminiCoordinates } from './processors/gemini-coordinates-processor.js';
import { processWithGeminiBboxSynthesis } from './processors/gemini-bbox-synthesis-processor.js';
import { processWithGeminiValidationAzureRead } from './processors/gemini-validation-azure-read-processor.js';
import { processWithGeminiValidationAzureLayout } from './processors/gemini-validation-azure-layout-processor.js';
import { processWithGeminiValidationCloudVision } from './processors/gemini-validation-cloud-vision-processor.js';
import { processWithGeminiGeometric } from './processors/gemini-geometric-processor.js';
import { processWithGeminiSelfCalibrating } from './processors/gemini-self-calibrating-processor.js';
import { accuracyCalculatorTool } from './mastra/tools/accuracy-calculator.js';
import { reportGeneratorTool } from './mastra/tools/report-generator.js';
import * as fs from 'fs';
import * as path from 'path';
import * as dotenv from 'dotenv';
import { eq } from 'drizzle-orm';

dotenv.config({ path: '.env.development' });

interface CliArgs {
  workflow?: string;
  drawing?: string;
  output?: string;
}

function parseArgs(): CliArgs {
  const args = process.argv.slice(2);
  const result: CliArgs = {};

  for (let i = 0; i < args.length; i++) {
    const arg = args[i];
    if (arg === '--workflow' && args[i + 1]) {
      result.workflow = args[i + 1];
      i++;
    } else if (arg === '--drawing' && args[i + 1]) {
      result.drawing = args[i + 1];
      i++;
    } else if (arg === '--output' && args[i + 1]) {
      result.output = args[i + 1];
      i++;
    }
  }

  return result;
}

/**
 * Load ground truth text from external file if specified
 * Supports both inline fullText and external fullTextFile
 */
function loadGroundTruthText(metadata: any, metadataDir: string): any {
  if (!metadata?.groundTruth) {
    return metadata;
  }

  // If fullTextFile is specified, read from external file
  if (metadata.groundTruth.fullTextFile) {
    const textFilePath = path.join(
      metadataDir,
      metadata.groundTruth.fullTextFile
    );

    if (fs.existsSync(textFilePath)) {
      try {
        const fullText = fs.readFileSync(textFilePath, 'utf-8');
        // Populate fullText from the file
        metadata.groundTruth.fullText = fullText;
        console.log(
          `  Loaded ground truth from: ${metadata.groundTruth.fullTextFile}`
        );
      } catch (error) {
        console.error(
          `  Warning: Could not read ground truth file ${textFilePath}:`,
          error
        );
      }
    } else {
      console.error(`  Warning: Ground truth file not found: ${textFilePath}`);
    }
  }

  return metadata;
}

async function loadTestDrawings() {
  const drawingsDir = path.join(process.cwd(), 'test-drawings');

  if (!fs.existsSync(drawingsDir)) {
    console.error('Error: test-drawings directory not found');
    console.log('Please create test-drawings/ and add your test drawings');
    return [];
  }

  const files = fs.readdirSync(drawingsDir, { withFileTypes: true });
  const drawings = [];

  for (const file of files) {
    if (file.isDirectory()) {
      // Check subdirectory for images
      const subDir = path.join(drawingsDir, file.name);
      const subFiles = fs.readdirSync(subDir);
      const imageFiles = subFiles.filter((f) =>
        ['.png', '.jpg', '.jpeg', '.pdf'].some((ext) => f.endsWith(ext))
      );

      for (const imageFile of imageFiles) {
        const filePath = path.join(subDir, imageFile);
        const baseName = imageFile.replace(/\.(png|jpg|jpeg|pdf)$/, '');
        const metadataPath = path.join(subDir, `${baseName}-metadata.json`);

        let metadata = null;
        if (fs.existsSync(metadataPath)) {
          metadata = JSON.parse(fs.readFileSync(metadataPath, 'utf-8'));
          // Load ground truth from external file if specified
          metadata = loadGroundTruthText(metadata, subDir);
        }

        drawings.push({
          fileName: imageFile,
          filePath,
          metadata,
        });
      }
    } else if (
      ['.png', '.jpg', '.jpeg', '.pdf'].some((ext) => file.name.endsWith(ext))
    ) {
      // Image in root test-drawings directory
      const filePath = path.join(drawingsDir, file.name);
      const baseName = file.name.replace(/\.(png|jpg|jpeg|pdf)$/, '');
      const metadataPath = path.join(drawingsDir, `${baseName}-metadata.json`);

      let metadata = null;
      if (fs.existsSync(metadataPath)) {
        metadata = JSON.parse(fs.readFileSync(metadataPath, 'utf-8'));
        // Load ground truth from external file if specified
        metadata = loadGroundTruthText(metadata, drawingsDir);
      }

      drawings.push({
        fileName: file.name,
        filePath,
        metadata,
      });
    }
  }

  return drawings;
}

async function runProcessor(
  processor: string,
  imagePath: string,
  drawingId: string
) {
  console.log(`\nRunning ${processor} on ${drawingId}...`);

  try {
    let result;

    if (processor === 'gemini') {
      result = await processWithGemini(imagePath, drawingId);
    } else if (processor === 'cloud-vision-gemini-hybrid') {
      result = await processWithCloudVisionGeminiHybrid(imagePath, drawingId);
    } else if (processor === 'azure-read-gemini-hybrid') {
      result = await processWithAzureReadGeminiHybrid(imagePath, drawingId);
    } else if (processor === 'azure-layout-gemini-hybrid') {
      result = await processWithAzureLayoutGeminiHybrid(imagePath, drawingId);
    } else if (processor === 'gemini-coordinates') {
      result = await processWithGeminiCoordinates(imagePath, drawingId);
    } else if (processor === 'gemini-bbox-synthesis') {
      result = await processWithGeminiBboxSynthesis(imagePath, drawingId);
    } else if (processor === 'gemini-validation-azure-read') {
      result = await processWithGeminiValidationAzureRead(imagePath, drawingId);
    } else if (processor === 'gemini-validation-azure-layout') {
      result = await processWithGeminiValidationAzureLayout(imagePath, drawingId);
    } else if (processor === 'gemini-validation-cloud-vision') {
      result = await processWithGeminiValidationCloudVision(imagePath, drawingId);
    } else if (processor === 'gemini-geometric') {
      result = await processWithGeminiGeometric(imagePath, drawingId);
    } else if (processor === 'gemini-self-calibrating') {
      result = await processWithGeminiSelfCalibrating(imagePath, drawingId);
    } else {
      throw new Error(`Unknown processor: ${processor}`);
    }

    return result;
  } catch (error) {
    console.error(`Error running ${processor}:`, error);
    throw error;
  }
}

async function calculateAccuracy(extractionResultId: string, groundTruth: any) {
  // Fetch extraction result
  const [result] = await db
    .select()
    .from(extractionResults)
    .where(eq(extractionResults.id, extractionResultId));

  if (!result || !result.rawText) {
    console.error('No extraction text found');
    return null;
  }

  if (!groundTruth?.fullText) {
    console.error(
      'No ground truth text found - please provide fullText in metadata'
    );
    return null;
  }

  // Calculate accuracy using character-level comparison
  const accuracyResult = await accuracyCalculatorTool.execute({
    context: {
      extractedText: result.rawText,
      groundTruthText: groundTruth.fullText,
      confidenceScore: undefined, // Will be set if available from processor
      boundingBoxes: result.boundingBoxes || undefined, // Pass bboxes for source tracking
    },
  });

  // Save accuracy metrics
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
  console.log('OCR Test Runner\n');

  const args = parseArgs();
  const workflow = args.workflow || 'all';
  const outputPath = args.output || './results';

  // Ensure output directory exists
  if (!fs.existsSync(outputPath)) {
    fs.mkdirSync(outputPath, { recursive: true });
  }

  // Load test drawings
  console.log('Loading test drawings...');
  let drawings = await loadTestDrawings();

  // Filter by drawing ID if specified
  if (args.drawing) {
    console.log(`Filtering for drawing: ${args.drawing}`);
    drawings = drawings.filter((d) => {
      const drawingId = d.metadata?.id || d.fileName;
      return (
        drawingId === args.drawing ||
        d.fileName.includes(args.drawing) ||
        drawingId.includes(args.drawing)
      );
    });

    if (drawings.length === 0) {
      console.error(`\nNo drawing found matching: ${args.drawing}`);
      console.log('\nAvailable drawings:');
      const allDrawings = await loadTestDrawings();
      allDrawings.forEach((d) => {
        const id = d.metadata?.id || d.fileName;
        console.log(`  - ${id} (${d.fileName})`);
      });
      process.exit(1);
    }
  }

  if (drawings.length === 0) {
    console.error('\nNo test drawings found!');
    console.log('\nTo add test drawings:');
    console.log('1. Create test-drawings/ directory');
    console.log('2. Add image files (.png, .jpg, .pdf)');
    console.log(
      '3. Add corresponding -metadata.json files with ground truth data'
    );
    console.log('\nExample metadata file (drawing-001-metadata.json):');
    console.log(
      JSON.stringify(
        {
          id: 'drawing-001',
          type: 'floor-plan',
          quality: 'high',
          source: 'scanned',
          groundTruth: {
            fullText:
              '10,920\n1,820\n910\n浴室\n洗面室\n押入\n床の間\n板の間\n...',
          },
        },
        null,
        2
      )
    );
    process.exit(1);
  }

  console.log(`Found ${drawings.length} test drawing(s)\n`);

  // Register drawings in database before processing
  console.log('Registering drawings in database...');
  for (const drawing of drawings) {
    const drawingId = drawing.metadata?.id || drawing.fileName;

    try {
      await db
        .insert(testDrawings)
        .values({
          drawingId,
          fileName: drawing.fileName,
          filePath: drawing.filePath,
          type: drawing.metadata?.type || 'unknown',
          quality: drawing.metadata?.quality || 'medium',
          source: drawing.metadata?.source || 'uploaded',
          groundTruth: drawing.metadata?.groundTruth || {},
          metadata: drawing.metadata || {},
        })
        .onConflictDoUpdate({
          target: testDrawings.drawingId,
          set: {
            fileName: drawing.fileName,
            filePath: drawing.filePath,
            groundTruth: drawing.metadata?.groundTruth || {},
            metadata: drawing.metadata || {},
          },
        });
      console.log(`  Registered: ${drawingId}`);
    } catch (error) {
      console.error(`  Warning: Could not register ${drawingId}:`, error);
    }
  }
  console.log('');

  // Create test run
  const [testRun] = await db
    .insert(testRuns)
    .values({
      runName: `Test Run ${new Date().toISOString()}`,
      description: `Testing workflow: ${workflow}`,
      drawingIds: drawings.map((d) => d.metadata?.id || d.fileName),
      tools:
        workflow === 'all'
          ? [
              'cloud-vision-gemini-hybrid',
              'azure-read-gemini-hybrid',
              'azure-layout-gemini-hybrid',
              'gemini-coordinates',
              // 'gemini-bbox-synthesis',
              // 'gemini-validation-azure-read',
              // 'gemini-validation-azure-layout',
              // 'gemini-validation-cloud-vision',
              'gemini-geometric',
            ]
          : [workflow],
      summary: {
        totalDrawings: drawings.length,
        totalExtractions: 0,
        avgCharacterErrorRateByTool: {},
        avgCharacterAccuracyByTool: {},
        avgProcessingTimeByTool: {},
        totalCostByTool: {},
        recommendedTool: '',
        notes: '',
      },
    })
    .returning();

  const testResults: any[] = [];

  // Run workflows on each drawing
  for (const drawing of drawings) {
    const drawingId = drawing.metadata?.id || drawing.fileName;
    const groundTruth = drawing.metadata?.groundTruth;

    console.log(`\n${'='.repeat(60)}`);
    console.log(`Processing: ${drawing.fileName}`);
    console.log(`${'='.repeat(60)}`);

    const processorsToRun =
      workflow === 'all'
        ? [
            'cloud-vision-gemini-hybrid',
            'azure-read-gemini-hybrid',
            'azure-layout-gemini-hybrid',
            'gemini-coordinates',
            // 'gemini-bbox-synthesis',
            // 'gemini-validation-azure-read',
            // 'gemini-validation-azure-layout',
            // 'gemini-validation-cloud-vision',

            // 'gemini-geometric',
          ]
        : [workflow];

    for (const processor of processorsToRun) {
      try {
        // Run processor
        const result = await runProcessor(
          processor,
          drawing.filePath,
          drawingId
        );

        // Calculate accuracy if ground truth is available
        if (groundTruth && result.extractionResultId) {
          console.log('  Calculating accuracy...');
          const accuracy = await calculateAccuracy(
            result.extractionResultId,
            groundTruth
          );

          if (accuracy) {
            console.log(
              `\n  Character-Level Accuracy Metrics for ${processor}:`
            );
            console.log(
              `     Character Error Rate (CER): ${(accuracy.characterErrorRate * 100).toFixed(2)}%`
            );
            console.log(
              `     Character Accuracy: ${accuracy.characterAccuracy.toFixed(1)}%`
            );
            console.log(
              `     Character Set Coverage: ${accuracy.characterSetCoverage.toFixed(1)}%`
            );
            console.log(
              `     Character Count: ${accuracy.extractedCharCount}/${accuracy.groundTruthCharCount} ${accuracy.exactCharCountMatch ? 'MATCH' : 'DIFF'}`
            );
            console.log(`     Edit Distance: ${accuracy.editDistance}`);

            // Fetch processing time and cost from extraction result
            const [extraction] = await db
              .select()
              .from(extractionResults)
              .where(eq(extractionResults.id, result.extractionResultId));

            testResults.push({
              drawingId,
              tool: processor,
              metrics: {
                characterErrorRate: accuracy.characterErrorRate,
                characterAccuracy: accuracy.characterAccuracy,
                characterSetCoverage: accuracy.characterSetCoverage,
                exactCharCountMatch: accuracy.exactCharCountMatch,
                extractedCharCount: accuracy.extractedCharCount,
                groundTruthCharCount: accuracy.groundTruthCharCount,
                processingTimeMs: extraction.processingTimeMs || 0,
                apiCost: extraction.apiCost || 0,
              },
            });
          }
        }
      } catch (error) {
        console.error(
          `Failed to process ${drawingId} with ${processor}:`,
          error
        );
      }
    }
  }

  // Generate report if we have results
  if (testResults.length > 0) {
    console.log(`\n${'='.repeat(60)}`);
    console.log('Generating Comparison Report...');
    console.log(`${'='.repeat(60)}\n`);

    const report = await reportGeneratorTool.execute({
      context: {
        testRunId: testRun.id,
        testResults,
        outputPath,
      },
    });

    console.log(`\nReport generated: ${report.reportPath}`);
    console.log('\nSummary:');
    console.log(
      `  Best Overall (Lowest CER): ${report.summary.bestOverallTool}`
    );
    console.log(
      `  Best Character Accuracy: ${report.summary.bestAccuracyTool}`
    );
    console.log(`  Lowest CER: ${report.summary.lowestCERTool}`);
    console.log(`  Fastest: ${report.summary.fastestTool}`);
    console.log(`  Cheapest: ${report.summary.cheapestTool}`);

    // Update test run summary
    await db
      .update(testRuns)
      .set({
        completed: true,
        completedAt: new Date(),
        summary: {
          ...testRun.summary,
          totalExtractions: testResults.length,
          recommendedTool: report.summary.bestOverallTool,
        },
      })
      .where(eq(testRuns.id, testRun.id));
  }

  console.log('\nAll tests completed!\n');
}

main().catch((error) => {
  console.error('Fatal error:', error);
  process.exit(1);
});
