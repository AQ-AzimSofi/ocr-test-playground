#!/usr/bin/env node

import { db, testDrawings, extractionResults, accuracyMetrics, testRuns } from './db/index.js';
import { processWithCloudVision } from './processors/cloud-vision-processor.js';
import { processWithGemini } from './processors/gemini-processor.js';
import { processWithHybrid } from './processors/hybrid-processor.js';
import { processWithAzureDocument } from './processors/azure-document-processor.js';
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

async function loadTestDrawings() {
  const drawingsDir = path.join(process.cwd(), 'test-drawings');

  if (!fs.existsSync(drawingsDir)) {
    console.error('❌ test-drawings directory not found');
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
        }

        drawings.push({
          fileName: imageFile,
          filePath,
          metadata,
        });
      }
    } else if (['.png', '.jpg', '.jpeg', '.pdf'].some((ext) => file.name.endsWith(ext))) {
      // Image in root test-drawings directory
      const filePath = path.join(drawingsDir, file.name);
      const baseName = file.name.replace(/\.(png|jpg|jpeg|pdf)$/, '');
      const metadataPath = path.join(drawingsDir, `${baseName}-metadata.json`);

      let metadata = null;
      if (fs.existsSync(metadataPath)) {
        metadata = JSON.parse(fs.readFileSync(metadataPath, 'utf-8'));
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
  console.log(`\n▶️  Running ${processor} on ${drawingId}...`);

  try {
    let result;

    if (processor === 'cloud-vision') {
      result = await processWithCloudVision(imagePath, drawingId);
    } else if (processor === 'gemini') {
      result = await processWithGemini(imagePath, drawingId);
    } else if (processor === 'hybrid') {
      result = await processWithHybrid(imagePath, drawingId);
    } else if (processor === 'azure-document') {
      result = await processWithAzureDocument(imagePath, drawingId);
    } else {
      throw new Error(`Unknown processor: ${processor}`);
    }

    return result;
  } catch (error) {
    console.error(`❌ Error running ${processor}:`, error);
    throw error;
  }
}

async function calculateAccuracy(extractionResultId: string, groundTruth: any) {
  // Fetch extraction result
  const [result] = await db
    .select()
    .from(extractionResults)
    .where(eq(extractionResults.id, extractionResultId));

  if (!result || !result.extractedData) {
    console.error('❌ No extraction data found');
    return null;
  }

  // Calculate accuracy using tool
  const accuracyResult = await accuracyCalculatorTool.execute({
    context: {
      extractedData: result.extractedData,
      groundTruth,
    },
  });

  // Save accuracy metrics
  await db.insert(accuracyMetrics).values({
    extractionResultId,
    drawingId: result.drawingId,
    tool: result.tool,
    dimensionsFound: accuracyResult.dimensionMetrics.found,
    dimensionsTotal: accuracyResult.dimensionMetrics.total,
    dimensionsCorrect: accuracyResult.dimensionMetrics.correct,
    dimensionRecall: accuracyResult.dimensionMetrics.recall,
    dimensionPrecision: accuracyResult.dimensionMetrics.precision,
    dimensionF1Score: accuracyResult.dimensionMetrics.f1Score,
    equipmentFound: accuracyResult.equipmentMetrics.found,
    equipmentTotal: accuracyResult.equipmentMetrics.total,
    equipmentCorrect: accuracyResult.equipmentMetrics.correct,
    equipmentRecall: accuracyResult.equipmentMetrics.recall,
    equipmentPrecision: accuracyResult.equipmentMetrics.precision,
    equipmentF1Score: accuracyResult.equipmentMetrics.f1Score,
    areasFound: accuracyResult.areaMetrics.found,
    areasTotal: accuracyResult.areaMetrics.total,
    areasCorrect: accuracyResult.areaMetrics.correct,
    areaRecall: accuracyResult.areaMetrics.recall,
    areaPrecision: accuracyResult.areaMetrics.precision,
    avgConfidenceScore: accuracyResult.avgConfidenceScore,
    breakdown: accuracyResult.breakdown,
  });

  return accuracyResult;
}

async function main() {
  console.log('🧪 OCR Test Runner\n');

  const args = parseArgs();
  const workflow = args.workflow || 'all';
  const outputPath = args.output || './results';

  // Ensure output directory exists
  if (!fs.existsSync(outputPath)) {
    fs.mkdirSync(outputPath, { recursive: true });
  }

  // Load test drawings
  console.log('📁 Loading test drawings...');
  const drawings = await loadTestDrawings();

  if (drawings.length === 0) {
    console.error('\n❌ No test drawings found!');
    console.log('\nTo add test drawings:');
    console.log('1. Create test-drawings/ directory');
    console.log('2. Add image files (.png, .jpg, .pdf)');
    console.log('3. Add corresponding -metadata.json files with ground truth data');
    console.log('\nExample metadata file (drawing-001-metadata.json):');
    console.log(
      JSON.stringify(
        {
          id: 'drawing-001',
          type: 'site-layout',
          quality: 'high',
          source: 'synthetic',
          groundTruth: {
            dimensions: [
              { value: '3500mm', element: 'storage-area' },
              { value: '1255', element: 'crane-width' },
            ],
            equipment: [
              { name: 'タワークレーン', spec: '13t' },
              { name: '仮囲い', length: '50m' },
            ],
            areas: [{ name: '資材置場', size: '3500mm × 4200mm' }],
          },
        },
        null,
        2
      )
    );
    process.exit(1);
  }

  console.log(`✅ Found ${drawings.length} test drawing(s)\n`);

  // Register drawings in database before processing
  console.log('📝 Registering drawings in database...');
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
      console.log(`  ✅ Registered: ${drawingId}`);
    } catch (error) {
      console.error(`  ⚠️  Warning: Could not register ${drawingId}:`, error);
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
      tools: workflow === 'all' ? ['cloud-vision', 'gemini-2.0-flash', 'hybrid', 'azure-document-intelligence'] : [workflow],
      summary: {
        totalDrawings: drawings.length,
        totalExtractions: 0,
        avgAccuracyByTool: {},
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
    console.log(`📄 Processing: ${drawing.fileName}`);
    console.log(`${'='.repeat(60)}`);

    const processorsToRun =
      workflow === 'all' ? ['cloud-vision', 'gemini', 'hybrid', 'azure-document'] : [workflow];

    for (const processor of processorsToRun) {
      try {
        // Run processor
        const result = await runProcessor(processor, drawing.filePath, drawingId);

        // Calculate accuracy if ground truth is available
        if (groundTruth && result.extractionResultId) {
          console.log('  📊 Calculating accuracy...');
          const accuracy = await calculateAccuracy(result.extractionResultId, groundTruth);

          if (accuracy) {
            console.log(`\n  📈 Accuracy Metrics for ${processor}:`);
            console.log(`     Dimension F1: ${(accuracy.dimensionMetrics.f1Score * 100).toFixed(1)}%`);
            console.log(`     Equipment F1: ${(accuracy.equipmentMetrics.f1Score * 100).toFixed(1)}%`);
            console.log(`     Confidence: ${(accuracy.avgConfidenceScore * 100).toFixed(1)}%`);

            // Fetch processing time and cost from extraction result
            const [extraction] = await db
              .select()
              .from(extractionResults)
              .where(eq(extractionResults.id, result.extractionResultId));

            testResults.push({
              drawingId,
              tool: processor,
              metrics: {
                dimensionMetrics: accuracy.dimensionMetrics,
                equipmentMetrics: accuracy.equipmentMetrics,
                processingTimeMs: extraction.processingTimeMs || 0,
                apiCost: extraction.apiCost || 0,
              },
            });
          }
        }
      } catch (error) {
        console.error(`❌ Failed to process ${drawingId} with ${processor}:`, error);
      }
    }
  }

  // Generate report if we have results
  if (testResults.length > 0) {
    console.log(`\n${'='.repeat(60)}`);
    console.log('📊 Generating Comparison Report...');
    console.log(`${'='.repeat(60)}\n`);

    const report = await reportGeneratorTool.execute({
      context: {
        testRunId: testRun.id,
        testResults,
        outputPath,
      },
    });

    console.log(`\n✅ Report generated: ${report.reportPath}`);
    console.log('\n🏆 Summary:');
    console.log(`  Best Overall: ${report.summary.bestOverallTool}`);
    console.log(`  Best Accuracy: ${report.summary.bestAccuracyTool}`);
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

  console.log('\n✨ All tests completed!\n');
}

main().catch((error) => {
  console.error('Fatal error:', error);
  process.exit(1);
});
