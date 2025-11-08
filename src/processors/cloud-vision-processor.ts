import { cloudVisionClient } from '../lib/cloud-vision-client.js';
import { db, extractionResults } from '../db/index.js';

/**
 * Process drawing with Google Cloud Vision API for character-level OCR
 */
export async function processWithCloudVision(imagePath: string, drawingId: string) {
  console.log(`  Processing with Cloud Vision...`);
  const startTime = Date.now();

  try {
    // Extract text using Cloud Vision
    const result = await cloudVisionClient.extractText(imagePath);
    const boundingBoxes = await cloudVisionClient.extractTextWithBoundingBoxes(imagePath);

    const processingTime = Date.now() - startTime;
    const estimatedCost = cloudVisionClient.estimateCost(1);

    // Save to database (only raw text, no semantic extraction)
    const [dbResult] = await db
      .insert(extractionResults)
      .values({
        drawingId,
        tool: 'cloud-vision',
        rawText: result.text,
        boundingBoxes,
        processingTimeMs: processingTime,
        apiCost: estimatedCost,
      })
      .returning();

    console.log(`  Cloud Vision completed in ${(processingTime / 1000).toFixed(2)}s`);
    console.log(`     Extracted ${result.text.length} characters`);

    return {
      success: true,
      extractionResultId: dbResult.id,
      tool: 'cloud-vision',
      rawText: result.text,
      processingTime,
      cost: estimatedCost,
    };
  } catch (error) {
    console.error(`  Cloud Vision failed:`, error);
    throw error;
  }
}
