import { processWithGeminiGeometric } from './gemini-geometric-processor.js';
import { cloudVisionClient } from '../lib/cloud-vision-client.js';
import {
  associateDimensionsWithObjects,
  updateObjectsWithDimensions,
} from '../utils/geometric-associator.js';
import { generateAllRevitOutputs } from '../utils/revit-output-generator.js';
import { generateVisualVerificationFromResult } from '../utils/visual-verifier.js';
import * as path from 'path';
import * as fs from 'fs';

const isDevelopment = process.env.NODE_ENV !== 'production';

/**
 * Complete Revit Processing Pipeline
 *
 * This processor combines:
 * 1. Geometric object detection (walls, doors, windows) using Gemini
 * 2. Text/dimension extraction using Cloud Vision
 * 3. Spatial association of dimensions to objects
 * 4. Revit-compatible JSON/CSV output generation
 *
 * End-to-end workflow: 2D Drawing → Geometric Objects + Dimensions → Revit JSON/CSV
 */
export async function processForRevit(imagePath: string, drawingId: string) {
  if (isDevelopment) {
    console.log(`\n${'='.repeat(70)}`);
    console.log(`COMPLETE REVIT PROCESSING PIPELINE`);
    console.log(`${'='.repeat(70)}\n`);
    console.log(`Drawing: ${drawingId}`);
    console.log(`Path: ${imagePath}\n`);
  }

  const startTime = Date.now();

  try {
    // STEP 1: Detect geometric objects using Gemini
    if (isDevelopment) {
      console.log(
        'STEP 1: Detecting geometric objects (walls, doors, windows)...'
      );
      console.log('-'.repeat(70));
    }
    const geometricResult = await processWithGeminiGeometric(
      imagePath,
      drawingId
    );

    if (!geometricResult.success || !geometricResult.extractionResultId) {
      throw new Error('Geometric detection failed');
    }

    if (isDevelopment) console.log(`\nDetected ${geometricResult.objectCount} objects`);

    // STEP 2: Extract text and dimensions using Cloud Vision
    if (isDevelopment) {
      console.log(
        `\n\nSTEP 2: Extracting dimension text using Cloud Vision OCR...`
      );
      console.log('-'.repeat(70));
    }
    const boundingBoxes =
      await cloudVisionClient.extractTextWithBoundingBoxes(imagePath);
    if (isDevelopment) console.log(`\nExtracted ${boundingBoxes.length} text boxes`);

    // STEP 3: Associate dimensions with geometric objects
    if (isDevelopment) {
      console.log(`\n\nSTEP 3: Associating dimensions with geometric objects...`);
      console.log('-'.repeat(70));
    }
    const associations = await associateDimensionsWithObjects(
      geometricResult.extractionResultId,
      boundingBoxes,
      drawingId,
      200 // max distance in pixels
    );

    if (isDevelopment) console.log(`\nCreated ${associations.size} dimension associations`);

    // STEP 4: Update object properties with dimension values
    if (isDevelopment) {
      console.log(
        `\n\nSTEP 4: Updating object properties with dimension values...`
      );
      console.log('-'.repeat(70));
    }
    await updateObjectsWithDimensions(associations);

    // STEP 5: Generate Revit output files
    if (isDevelopment) {
      console.log(
        `\n\nSTEP 5: Generating Revit-compatible outputs (JSON + CSV)...`
      );
      console.log('-'.repeat(70));
    }

    // Create output directory
    const outputDir = path.join(process.cwd(), 'revit-outputs');
    if (!fs.existsSync(outputDir)) {
      fs.mkdirSync(outputDir, { recursive: true });
    }

    const baseOutputPath = path.join(outputDir, `${drawingId}-revit`);
    const outputs = await generateAllRevitOutputs(
      geometricResult.extractionResultId,
      baseOutputPath
    );

    // STEP 6: Generate visual verification overlay (DISABLED - performance optimization needed)
    // TODO: Optimize Jimp drawing performance for large object counts
    // console.log(`\n\nSTEP 6: Generating visual verification overlay...`);
    // console.log('-'.repeat(70));
    // const annotatedImagePath = await generateVisualVerificationFromResult(
    //   geometricResult.extractionResultId,
    //   outputDir
    // );
    const annotatedImagePath = null; // Temporarily disabled

    const totalTime = Date.now() - startTime;

    // Final summary
    if (isDevelopment) {
      console.log(`\n\n${'='.repeat(70)}`);
      console.log(`PROCESSING COMPLETE`);
      console.log(`${'='.repeat(70)}\n`);
      console.log(`Total processing time: ${(totalTime / 1000).toFixed(2)}s`);
      console.log(
        `Total cost: ¥${(geometricResult.cost + cloudVisionClient.estimateCost(1)).toFixed(2)}\n`
      );

      console.log(`Generated Files:`);
      console.log(`  - Revit JSON: ${outputs.jsonPath}`);
      console.log(`  - Revit CSV:  ${outputs.csvPath}\n`);
      // console.log(`  - Annotated Image: ${annotatedImagePath}\n`);

      console.log(`Next Steps:`);
      console.log(`  1. Open Dynamo in Revit`);
      console.log(`  2. Load the JSON file: ${outputs.jsonPath}`);
      console.log(`  3. Run the Dynamo script to generate 3D model\n`);
    }

    return {
      success: true,
      extractionResultId: geometricResult.extractionResultId,
      objectCount: geometricResult.objectCount,
      dimensionAssociations: associations.size,
      outputs: {
        json: outputs.jsonPath,
        csv: outputs.csvPath,
        annotatedImage: annotatedImagePath,
      },
      processingTime: totalTime,
      totalCost: geometricResult.cost + cloudVisionClient.estimateCost(1),
    };
  } catch (error) {
    if (isDevelopment) console.error(`\nRevit processing failed:`, error);
    throw error;
  }
}
