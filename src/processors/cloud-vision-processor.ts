import { cloudVisionClient } from '../lib/cloud-vision-client.js';
import { extractDimensions, extractEquipmentLabels } from '../lib/utils.js';
import { db, extractionResults } from '../db/index.js';

/**
 * Process drawing with Google Cloud Vision API
 */
export async function processWithCloudVision(imagePath: string, drawingId: string) {
  console.log(`  Processing with Cloud Vision...`);
  const startTime = Date.now();

  try {
    // Extract text using Cloud Vision
    const result = await cloudVisionClient.extractText(imagePath);
    const boundingBoxes = await cloudVisionClient.extractTextWithBoundingBoxes(imagePath);

    // Extract dimensions and equipment from text
    const dimensions = extractDimensions(result.text);
    const equipment = extractEquipmentLabels(result.text);

    const processingTime = Date.now() - startTime;
    const estimatedCost = cloudVisionClient.estimateCost(1);

    // Save to database
    const [dbResult] = await db
      .insert(extractionResults)
      .values({
        drawingId,
        tool: 'cloud-vision',
        rawText: result.text,
        extractedData: {
          dimensions: dimensions.map((dim) => ({
            value: dim.value,
            numbers: dim.numbers,
            unit: dim.unit,
            type: 'extracted',
          })),
          equipment: equipment.map((eq) => ({
            name: eq.term,
            spec: eq.spec,
          })),
        },
        boundingBoxes,
        processingTimeMs: processingTime,
        apiCost: estimatedCost,
      })
      .returning();

    console.log(`  ✅ Cloud Vision completed in ${(processingTime / 1000).toFixed(2)}s`);

    return {
      success: true,
      extractionResultId: dbResult.id,
      tool: 'cloud-vision',
      processingTime,
      cost: estimatedCost,
    };
  } catch (error) {
    console.error(`  ❌ Cloud Vision failed:`, error);
    throw error;
  }
}
