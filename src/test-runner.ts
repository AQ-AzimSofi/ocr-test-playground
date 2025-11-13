#!/usr/bin/env node

import {
  db,
  testDrawings,
  extractionResults,
  accuracyMetrics,
  testRuns,
} from './db/index.js';
import { processWithGemini } from './processors/old/gemini-processor.js';
import { processWithCloudVision } from './processors/cloud-vision-processor.js';
import { processWithAzureRead } from './processors/azure-read-processor.js';
import { processWithAzureLayout } from './processors/azure-layout-processor.js';
import { processWithDocumentAI } from './processors/document-ai-processor.js';
import { processWithCloudVisionGeminiHybrid } from './processors/cloud-vision-gemini-hybrid-processor.js';
import { processWithAzureReadGeminiHybrid } from './processors/azure-read-gemini-hybrid-processor.js';
import { processWithAzureLayoutGeminiHybrid } from './processors/azure-layout-gemini-hybrid-processor.js';
import { processWithDocumentAIGeminiHybrid } from './processors/document-ai-gemini-hybrid-processor.js';
import { processWithGeminiCoordinates } from './processors/gemini-coordinates-processor.js';
import { processWithGeminiGeometric } from './processors/gemini-geometric-processor.js';
import { processWithGeminiSelfCalibrating } from './processors/gemini-self-calibrating-processor.js';
import { processWithHybridDetector } from './processors/hybrid-wall-detector-processor.js';
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
  confidentialOnly?: boolean;
  testRunId?: string;
}

/**
 * Check if a processor uses Gemini AI
 */
function isGeminiProcessor(processor: string): boolean {
  const geminiProcessors = [
    'gemini',
    'cloud-vision-gemini-hybrid',
    'azure-read-gemini-hybrid',
    'azure-layout-gemini-hybrid',
    'document-ai-gemini-hybrid',
    'gemini-coordinates',
    'gemini-geometric',
    'gemini-self-calibrating',
    'hybrid-cv-ai',
  ];
  return geminiProcessors.includes(processor);
}

/**
 * Check if a file path is in the confidential directory
 * Files in these directories cannot be processed with Gemini AI processors
 */
function isConfidentialFile(filePath: string): boolean {
  return (
    filePath.includes('/confidential/') ||
    filePath.includes('\\confidential\\') ||
    filePath.includes('/confidential-temp-excluded/') ||
    filePath.includes('\\confidential-temp-excluded\\')
  );
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
    } else if (arg === '--test-run-id' && args[i + 1]) {
      result.testRunId = args[i + 1];
      i++;
    } else if (arg === '--confidential-only') {
      result.confidentialOnly = true;
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

async function loadTestDrawings(
  includeConfidential: boolean = false,
  confidentialOnly: boolean = false
) {
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

        // Filter confidential files based on test mode
        const isConfidential = isConfidentialFile(filePath);
        if (!includeConfidential && isConfidential) {
          continue; // Skip confidential files for regular tests
        }
        if (confidentialOnly && !isConfidential) {
          continue; // Skip non-confidential files for confidential-only tests
        }

        const baseName = imageFile.replace(/\.(png|jpg|jpeg|pdf)$/, '');
        const metadataPath = path.join(subDir, `${baseName}-metadata.json`);
        const txtPath = path.join(subDir, `${baseName}.txt`);

        let metadata = null;
        if (fs.existsSync(metadataPath)) {
          metadata = JSON.parse(fs.readFileSync(metadataPath, 'utf-8'));
          // Load ground truth from external file if specified
          metadata = loadGroundTruthText(metadata, subDir);
        } else if (fs.existsSync(txtPath)) {
          // Auto-detect ground truth from .txt file with same base name
          const fullText = fs.readFileSync(txtPath, 'utf-8');
          metadata = {
            groundTruth: {
              fullText,
            },
          };
          console.log(`  Loaded ground truth from: ./${baseName}.txt`);
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

      // Filter confidential files based on test mode
      const isConfidential = isConfidentialFile(filePath);
      if (!includeConfidential && isConfidential) {
        continue; // Skip confidential files for regular tests
      }
      if (confidentialOnly && !isConfidential) {
        continue; // Skip non-confidential files for confidential-only tests
      }

      const baseName = file.name.replace(/\.(png|jpg|jpeg|pdf)$/, '');
      const metadataPath = path.join(drawingsDir, `${baseName}-metadata.json`);
      const txtPath = path.join(drawingsDir, `${baseName}.txt`);

      let metadata = null;
      if (fs.existsSync(metadataPath)) {
        metadata = JSON.parse(fs.readFileSync(metadataPath, 'utf-8'));
        // Load ground truth from external file if specified
        metadata = loadGroundTruthText(metadata, drawingsDir);
      } else if (fs.existsSync(txtPath)) {
        // Auto-detect ground truth from .txt file with same base name
        const fullText = fs.readFileSync(txtPath, 'utf-8');
        metadata = {
          groundTruth: {
            fullText,
          },
        };
        console.log(`  Loaded ground truth from: ./${baseName}.txt`);
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
    } else if (processor === 'cloud-vision') {
      result = await processWithCloudVision(imagePath, drawingId);
    } else if (processor === 'azure-read') {
      result = await processWithAzureRead(imagePath, drawingId);
    } else if (processor === 'azure-layout') {
      result = await processWithAzureLayout(imagePath, drawingId);
    } else if (processor === 'document-ai') {
      result = await processWithDocumentAI(imagePath, drawingId);
    } else if (processor === 'cloud-vision-gemini-hybrid') {
      result = await processWithCloudVisionGeminiHybrid(imagePath, drawingId);
    } else if (processor === 'azure-read-gemini-hybrid') {
      result = await processWithAzureReadGeminiHybrid(imagePath, drawingId);
    } else if (processor === 'azure-layout-gemini-hybrid') {
      result = await processWithAzureLayoutGeminiHybrid(imagePath, drawingId);
    } else if (processor === 'document-ai-gemini-hybrid') {
      result = await processWithDocumentAIGeminiHybrid(imagePath, drawingId);
    } else if (processor === 'gemini-coordinates') {
      result = await processWithGeminiCoordinates(imagePath, drawingId);
    } else if (processor === 'gemini-geometric') {
      result = await processWithGeminiGeometric(imagePath, drawingId);
    } else if (processor === 'gemini-self-calibrating') {
      result = await processWithGeminiSelfCalibrating(imagePath, drawingId);
    } else if (processor === 'hybrid-cv-ai') {
      result = await processWithHybridDetector(imagePath, drawingId);
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

  // Detect large texts and log memory-efficient mode
  const extractedLength = result.rawText.length;
  const groundTruthLength = groundTruth.fullText.length;
  const maxLength = Math.max(extractedLength, groundTruthLength);

  if (maxLength > 10000) {
    console.log(`  [INFO] Large document detected (${maxLength.toLocaleString()} chars) - using memory-efficient analysis`);
  }

  const accuracyResult = await accuracyCalculatorTool.execute({
    context: {
      extractedText: result.rawText,
      groundTruthText: groundTruth.fullText,
      confidenceScore: undefined, // Will be set if available from processor
      boundingBoxes: result.boundingBoxes || undefined, // Pass bboxes for source tracking
    },
  });

  await db.insert(accuracyMetrics).values({
    extractionResultId,
    drawingId: result.drawingId,
    tool: result.tool,
    characterErrorRate: accuracyResult.characterErrorRate,
    orderIndependentCer: accuracyResult.orderIndependentCER,
    orderIndependentAccuracy: accuracyResult.orderIndependentAccuracy,
    orderIndependentEditDistance: accuracyResult.orderIndependentEditDistance,
    characterAccuracy: accuracyResult.characterAccuracy,
    characterSetCoverage: accuracyResult.characterSetCoverage,
    extractedCharCount: accuracyResult.extractedCharCount,
    groundTruthCharCount: accuracyResult.groundTruthCharCount,
    exactCharCountMatch: accuracyResult.exactCharCountMatch,
    charCountDifference: accuracyResult.charCountDifference,
    normalizedExtractedLength: accuracyResult.normalizedExtractedLength,
    normalizedGroundTruthLength: accuracyResult.normalizedGroundTruthLength,
    editDistance: accuracyResult.editDistance,
    avgConfidenceScore: accuracyResult.avgConfidenceScore,
    bboxSourceStats: accuracyResult.bboxSourceStats,
    breakdown: accuracyResult.breakdown,
    orderIndependentCharAnalysis: accuracyResult.orderIndependentCharAnalysis,
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

  console.log('Loading test drawings...');
  const includeConfidential = args.confidentialOnly === true;
  const confidentialOnly = args.confidentialOnly === true;
  let drawings = await loadTestDrawings(includeConfidential, confidentialOnly);

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
      const allDrawings = await loadTestDrawings(includeConfidential, confidentialOnly);
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

  console.log(
    `Found ${drawings.length} test drawing(s)${args.confidentialOnly ? ' (confidential only)' : ''}\n`
  );

  // Register drawings in database before processing
  console.log('Registering drawings in database...');
  for (const drawing of drawings) {
    const drawingId = drawing.metadata?.id || drawing.fileName;
    const isConfidential = isConfidentialFile(drawing.filePath);

    if (isConfidential) {
      console.log(`  [CONFIDENTIAL] ${drawingId}`);
    }

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
          isConfidential,
          groundTruth: drawing.metadata?.groundTruth || {},
          metadata: drawing.metadata || {},
        })
        .onConflictDoUpdate({
          target: testDrawings.drawingId,
          set: {
            fileName: drawing.fileName,
            filePath: drawing.filePath,
            isConfidential,
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

  // Load or create test run
  let testRun: any;

  if (args.testRunId) {
    // Load existing test run
    console.log(`Loading existing test run: ${args.testRunId}`);
    const [existingRun] = await db
      .select()
      .from(testRuns)
      .where(eq(testRuns.id, args.testRunId))
      .limit(1);

    if (!existingRun) {
      console.error(`Test run not found: ${args.testRunId}`);
      process.exit(1);
    }

    testRun = existingRun;
    console.log(`  Name: ${testRun.runName}`);
    console.log(`  Processors: ${testRun.tools?.join(', ')}`);
    console.log(`  Drawings: ${testRun.drawingIds?.length}`);
    console.log('');

    // Override workflow and drawings with test run's configuration
    workflow = testRun.tools?.length === 1 ? testRun.tools[0] : 'custom';
    // Filter drawings to only those in the test run
    drawings = drawings.filter((d) =>
      testRun.drawingIds?.includes(d.metadata?.id || d.fileName)
    );
  } else {
    // Create new test run
    [testRun] = await db
      .insert(testRuns)
      .values({
        runName: `Test Run ${new Date().toISOString()}`,
        description: `Testing workflow: ${workflow}`,
        drawingIds: drawings.map((d) => d.metadata?.id || d.fileName),
        tools:
          workflow === 'confidential-safe'
            ? ['cloud-vision', 'azure-read', 'azure-layout', 'document-ai']
            : workflow === 'all'
            ? [
                'cloud-vision',
                'azure-read',
                'azure-layout',
                'cloud-vision-gemini-hybrid',
                'azure-read-gemini-hybrid',
                'azure-layout-gemini-hybrid',
                'document-ai-gemini-hybrid',
                'gemini-coordinates',
                'gemini-geometric',
                'gemini-self-calibrating',
                'hybrid-cv-ai',
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
  }

  const testResults: any[] = [];

  for (const drawing of drawings) {
    const drawingId = drawing.metadata?.id || drawing.fileName;
    const groundTruth = drawing.metadata?.groundTruth;

    console.log(`\n${'='.repeat(60)}`);
    console.log(`Processing: ${drawing.fileName}`);
    console.log(`${'='.repeat(60)}`);

    let processorsToRun =
      args.testRunId
        ? testRun.tools || []
        : workflow === 'confidential-safe'
        ? ['cloud-vision', 'azure-read', 'azure-layout', 'document-ai']
        : workflow === 'confidential-fast'
        ? ['azure-read', 'azure-layout', 'document-ai']
        : workflow === 'all'
        ? [
            'cloud-vision',
            'azure-read',
            'azure-layout',
            'cloud-vision-gemini-hybrid',
            'azure-read-gemini-hybrid',
            'azure-layout-gemini-hybrid',
            'document-ai-gemini-hybrid',
            'gemini-coordinates',
            'gemini-geometric',
            'gemini-self-calibrating',
            'hybrid-cv-ai',
          ]
        : [workflow];

    // CONFIDENTIAL FILE PROTECTION: Block Gemini processors (safety check)
    const isConfidential = isConfidentialFile(drawing.filePath);
    if (isConfidential) {
      if (!args.confidentialOnly) {
        console.warn(
          `  [WARNING] Confidential file found in regular test run: ${drawingId}`
        );
        console.warn(`  This file should have been filtered out during loading.`);
      }

      const originalCount = processorsToRun.length;
      processorsToRun = processorsToRun.filter(p => !isGeminiProcessor(p));
      const blockedCount = originalCount - processorsToRun.length;

      if (blockedCount > 0) {
        console.log(`  [CONFIDENTIAL] Blocked ${blockedCount} Gemini processor(s)`);
      }

      if (processorsToRun.length === 0) {
        console.error(`\n  [ERROR] Cannot run Gemini processors on confidential files!`);
        console.error(`  This file is in the 'confidential/' directory.`);
        console.error(`  Use pure OCR processors instead: --workflow azure-read | azure-layout | cloud-vision`);
        continue; // Skip this drawing
      }
    }

    for (const processor of processorsToRun) {
      try {
        const result = await runProcessor(
          processor,
          drawing.filePath,
          drawingId
        );

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

            // Display order-independent character analysis
            const charAnalysis = accuracy.orderIndependentCharAnalysis;
            if (charAnalysis.missingTotal > 0 || charAnalysis.extraTotal > 0) {
              console.log(`\n  Order-Independent Character Analysis:`);

              if (charAnalysis.missingTotal > 0) {
                const missingList = Object.entries(charAnalysis.missingCharacters)
                  .sort((a, b) => b[1] - a[1]) // Sort by count descending
                  .map(([char, count]) => `'${char}'×${count}`)
                  .join(', ');
                console.log(`     Missing: ${missingList} (${charAnalysis.missingTotal} chars)`);
              }

              if (charAnalysis.extraTotal > 0) {
                const extraList = Object.entries(charAnalysis.extraCharacters)
                  .sort((a, b) => b[1] - a[1]) // Sort by count descending
                  .map(([char, count]) => `'${char}'×${count}`)
                  .join(', ');
                console.log(`     Extra: ${extraList} (${charAnalysis.extraTotal} chars)`);
              }
            }

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
                orderIndependentCER: accuracy.orderIndependentCER,
                orderIndependentAccuracy: accuracy.orderIndependentAccuracy,
                characterAccuracy: accuracy.characterAccuracy,
                characterSetCoverage: accuracy.characterSetCoverage,
                exactCharCountMatch: accuracy.exactCharCountMatch,
                extractedCharCount: accuracy.extractedCharCount,
                groundTruthCharCount: accuracy.groundTruthCharCount,
                editDistance: accuracy.editDistance,
                orderIndependentEditDistance: accuracy.orderIndependentEditDistance,
                processingTimeMs: extraction.processingTimeMs || 0,
                apiCost: extraction.apiCost || 0,
              },
              orderIndependentCharAnalysis: accuracy.orderIndependentCharAnalysis,
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
