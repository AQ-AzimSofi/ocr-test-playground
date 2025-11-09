import { cloudVisionClient } from '../lib/cloud-vision-client.js';
import { geminiClient } from '../lib/gemini-client.js';
import { db, extractionResults } from '../db/index.js';
import {
  batchCropRegions,
  mergeRegionTexts,
  type CropRegion,
} from '../utils/image-cropper.js';

/**
 * Cloud Vision + Gemini Hybrid Processor (Region-Level Fusion)
 *
 * NEW STRATEGY (Region-Level Fusion):
 * 1. Run Cloud Vision → Get all regions with confidence
 * 2. Keep high-confidence regions as-is (≥0.85)
 * 3. Crop low-confidence regions from image
 * 4. Send crops to Gemini for re-extraction
 * 5. Replace low-confidence text with Gemini results
 * 6. Combine: High-conf original + Gemini-corrected = Final result
 *
 * This is TRUE HYBRID FUSION - combines best of both tools!
 */

export async function processWithCloudVisionGeminiHybrid(
  imagePath: string,
  drawingId: string
) {
  console.log(
    `  Processing with Cloud Vision + Gemini Hybrid (Region-Level Fusion)...`
  );
  const startTime = Date.now();

  try {
    // Step 1: Run Cloud Vision to get all regions with confidence
    const cloudVisionBBoxes =
      await cloudVisionClient.extractTextWithBoundingBoxes(imagePath);
    const cloudVisionText = cloudVisionBBoxes.map((b) => b.text).join('\n');

    console.log(
      `  Cloud Vision: ${cloudVisionBBoxes.length} regions, ${cloudVisionText.length} chars`
    );

    // Step 2: Separate high/low confidence regions
    const LOW_CONFIDENCE_THRESHOLD = 0.85;

    const highConfidenceRegions: CropRegion[] = [];
    const lowConfidenceRegions: CropRegion[] = [];

    cloudVisionBBoxes.forEach((bbox, index) => {
      const region: CropRegion = {
        bounds: bbox.bounds,
        text: bbox.text,
        confidence: bbox.confidence || 1.0,
        index,
      };

      if (region.confidence < LOW_CONFIDENCE_THRESHOLD) {
        lowConfidenceRegions.push(region);
      } else {
        highConfidenceRegions.push(region);
      }
    });

    const lowConfidencePercentage =
      (lowConfidenceRegions.length / cloudVisionBBoxes.length) * 100;

    console.log(
      `  High confidence: ${highConfidenceRegions.length} regions (>=${LOW_CONFIDENCE_THRESHOLD * 100}%)`
    );
    console.log(
      `  Low confidence: ${lowConfidenceRegions.length} regions (${lowConfidencePercentage.toFixed(1)}%)`
    );

    // Step 3: Crop low-confidence regions from image
    let croppedRegions = [];
    let geminiCorrectedTexts = new Map<number, string>();
    let geminiCost = 0;

    if (lowConfidenceRegions.length > 0) {
      console.log(
        `  Cropping ${lowConfidenceRegions.length} low-confidence regions...`
      );
      croppedRegions = await batchCropRegions(
        imagePath,
        lowConfidenceRegions,
        10
      );

      // Step 4: Send crops to Gemini for re-extraction
      console.log(`  Sending ${croppedRegions.length} regions to Gemini...`);

      const geminiInputs = croppedRegions.map((cropped) => ({
        base64: cropped.base64,
        originalText: cropped.region.text,
      }));

      const geminiResults =
        await geminiClient.batchExtractTextFromRegions(geminiInputs);

      // Step 5: Build map of corrected texts
      croppedRegions.forEach((cropped, i) => {
        const geminiText = geminiResults[i].text;
        geminiCorrectedTexts.set(cropped.region.index, geminiText);
      });

      geminiCost = geminiClient.estimateCost(lowConfidenceRegions.length, true);
      console.log(`  Gemini corrected ${geminiCorrectedTexts.size} regions`);
    } else {
      console.log(
        `  All regions have high confidence - no Gemini correction needed!`
      );
    }

    // Step 6: Merge results - build final text and bounding boxes
    const allRegions = cloudVisionBBoxes.map(
      (bbox, index): CropRegion => ({
        bounds: bbox.bounds,
        text: bbox.text,
        confidence: bbox.confidence || 1.0,
        index,
      })
    );

    const finalText = mergeRegionTexts(allRegions, geminiCorrectedTexts);

    // Calculate average confidence
    const avgConfidence =
      cloudVisionBBoxes.length > 0
        ? cloudVisionBBoxes.reduce(
            (sum, bbox) => sum + (bbox.confidence || 1.0),
            0
          ) / cloudVisionBBoxes.length
        : 0;

    const processingTime = Date.now() - startTime;

    // Estimate combined cost
    const cloudVisionCost = cloudVisionClient.estimateCost(1);
    const estimatedCost = cloudVisionCost + geminiCost;

    // Save to database with enhanced metadata
    const [dbResult] = await db
      .insert(extractionResults)
      .values({
        drawingId,
        tool: 'cloud-vision-gemini-hybrid',
        rawText: finalText,
        boundingBoxes: cloudVisionBBoxes.map((bbox, index) => {
          const wasGeminiUpdated = geminiCorrectedTexts.has(index);
          const originalText = bbox.text;
          const finalBboxText = geminiCorrectedTexts.get(index) || bbox.text;

          return {
            text: finalBboxText,
            bounds: bbox.bounds,
            confidence: bbox.confidence,
            metadata: {
              isLowConfidence:
                (bbox.confidence || 1.0) < LOW_CONFIDENCE_THRESHOLD,
              geminiUpdated: wasGeminiUpdated,
              originalText: wasGeminiUpdated ? originalText : undefined,
              updateReason: wasGeminiUpdated
                ? `Low confidence (${((bbox.confidence || 1.0) * 100).toFixed(1)}%) - corrected by Gemini`
                : undefined,
              source: wasGeminiUpdated ? 'gemini' : 'cloud-vision',
            },
          };
        }),
        processingTimeMs: processingTime,
        apiCost: estimatedCost,
        metadata: {
          strategy: 'region-level-fusion',
          granularity: 'paragraph',
          cloudVisionCharCount: cloudVisionText.length,
          cloudVisionRegionCount: cloudVisionBBoxes.length,
          finalCharCount: finalText.length,
          avgConfidence,
          lowConfidenceRegionsCount: lowConfidenceRegions.length,
          highConfidenceRegionsCount: highConfidenceRegions.length,
          lowConfidencePercentage,
          geminiCorrectedCount: geminiCorrectedTexts.size,
          confidenceThreshold: LOW_CONFIDENCE_THRESHOLD,
          cloudVisionCost,
          geminiCost,
          costSavings:
            (geminiClient.estimateCost(1, false) - geminiCost).toFixed(2) +
            ' yen (vs full-image Gemini)',
        },
      })
      .returning();

    console.log(
      `  Cloud Vision + Gemini Hybrid completed in ${(processingTime / 1000).toFixed(2)}s`
    );
    console.log(`     Final text: ${finalText.length} chars`);
    console.log(
      `     Cloud Vision: ${cloudVisionBBoxes.length} regions (avg confidence: ${(avgConfidence * 100).toFixed(1)}%)`
    );
    console.log(
      `     Gemini corrections: ${geminiCorrectedTexts.size}/${lowConfidenceRegions.length} low-confidence regions`
    );
    console.log(
      `     Cost: ${estimatedCost.toFixed(2)} yen (saved ${(geminiClient.estimateCost(1, false) - geminiCost).toFixed(2)} yen vs full Gemini)`
    );

    return {
      success: true,
      extractionResultId: dbResult.id,
      tool: 'cloud-vision-gemini-hybrid',
      rawText: finalText,
      confidence: avgConfidence,
      processingTime,
      cost: estimatedCost,
      metadata: {
        strategy: 'region-level-fusion',
        cloudVisionRegions: cloudVisionBBoxes.length,
        geminiCorrected: geminiCorrectedTexts.size,
        lowConfidencePercentage,
      },
    };
  } catch (error) {
    console.error(`  Cloud Vision + Gemini Hybrid failed:`, error);
    throw error;
  }
}
