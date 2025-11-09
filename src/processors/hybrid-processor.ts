import { cloudVisionClient } from '../lib/cloud-vision-client.js';
import { geminiClient } from '../lib/gemini-client.js';
import { calculateLevenshteinDistance } from '../lib/utils.js';
import { db, extractionResults } from '../db/index.js';

/**
 * Process drawing with both Cloud Vision and Gemini, select best result for character-level OCR
 */
export async function processWithHybrid(imagePath: string, drawingId: string) {
  console.log(`  Processing with Hybrid (Cloud Vision + Gemini)...`);
  const startTime = Date.now();

  try {
    // Run both extractions in parallel (including bounding boxes for Cloud Vision)
    const [cloudVisionResult, geminiResult, cloudVisionBBoxes] =
      await Promise.all([
        cloudVisionClient.extractText(imagePath),
        geminiClient.extractText(imagePath),
        cloudVisionClient.extractTextWithBoundingBoxes(imagePath),
      ]);

    // Compare both results and select the longer one
    // (typically more text extracted = better OCR)
    const cvLength = cloudVisionResult.text.length;
    const geminiLength = geminiResult.text.length;

    // Calculate similarity between the two results
    const similarity = calculateLevenshteinDistance(
      cloudVisionResult.text,
      geminiResult.text
    );

    const maxLength = Math.max(cvLength, geminiLength);
    const similarityRate = maxLength > 0 ? 1 - similarity / maxLength : 0;

    // Select the result with more text extracted
    // If lengths are similar (within 10%), prefer Cloud Vision for better accuracy
    const useCloudVision = cvLength >= geminiLength * 0.9;

    const selectedText = useCloudVision
      ? cloudVisionResult.text
      : geminiResult.text;
    const selectedSource = useCloudVision ? 'cloud-vision' : 'gemini';
    const avgConfidence = useCloudVision
      ? cloudVisionResult.confidence
      : geminiResult.confidence;

    // Use Cloud Vision bounding boxes when available, empty array for Gemini
    // (Gemini doesn't provide bounding box data)
    const boundingBoxes = useCloudVision ? cloudVisionBBoxes : [];

    const processingTime = Date.now() - startTime;
    const totalCost =
      cloudVisionClient.estimateCost(1) + geminiClient.estimateCost(1);

    // Save to database
    const [dbResult] = await db
      .insert(extractionResults)
      .values({
        drawingId,
        tool: 'hybrid',
        rawText: selectedText,
        boundingBoxes,
        processingTimeMs: processingTime,
        apiCost: totalCost,
        metadata: {
          selectedSource,
          cloudVisionChars: cvLength,
          geminiChars: geminiLength,
          agreementRate: Math.round(similarityRate * 100),
        },
      })
      .returning();

    console.log(`  Hybrid completed in ${(processingTime / 1000).toFixed(2)}s`);
    console.log(
      `     Selected: ${selectedSource} (${selectedText.length} chars, ${boundingBoxes.length} bboxes)`
    );
    console.log(
      `     Cloud Vision: ${cvLength} chars, Gemini: ${geminiLength} chars`
    );
    console.log(`     Agreement: ${(similarityRate * 100).toFixed(1)}%`);

    return {
      success: true,
      extractionResultId: dbResult.id,
      tool: 'hybrid',
      rawText: selectedText,
      confidence: avgConfidence,
      processingTime,
      cost: totalCost,
      metadata: {
        selectedSource,
        cloudVisionChars: cvLength,
        geminiChars: geminiLength,
        agreementRate: Math.round(similarityRate * 100),
      },
    };
  } catch (error) {
    console.error(`  Hybrid processing failed:`, error);
    throw error;
  }
}
