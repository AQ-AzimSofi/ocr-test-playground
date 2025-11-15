// Internal imports
import { cloudVisionClient } from '../lib/cloud-vision-client.js';
import { geminiClient } from '../lib/gemini-client.js';
import { db, extractionResults } from '../db/index.js';
import {
  batchCropRegions,
  mergeRegionTexts,
  type CropRegion,
} from '../utils/image-cropper.js';

const isDevelopment = process.env.NODE_ENV !== 'production';

/**
 * Cloud Vision + Gemini Hybrid Processor (Region-Level Fusion)
 *
 * Combines Cloud Vision's region detection with Gemini's text correction.
 * High-confidence regions (≥0.85) are kept as-is; low-confidence regions are
 * cropped and re-extracted by Gemini, then merged into the final result.
 */

export async function processWithCloudVisionGeminiHybrid(
  imagePath: string,
  drawingId: string
) {
  if (isDevelopment) {
    console.log(
      `  Processing with Cloud Vision + Gemini Hybrid (Region-Level Fusion)...`
    );
  }
  const startTime = Date.now();

  try {
    const cloudVisionBBoxes =
      await cloudVisionClient.extractTextWithBoundingBoxes(imagePath);
    const cloudVisionText = cloudVisionBBoxes.map((b) => b.text).join('\n');

    if (isDevelopment) {
      console.log(
        `  Cloud Vision: ${cloudVisionBBoxes.length} regions, ${cloudVisionText.length} chars`
      );
    }

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

    if (isDevelopment) {
      console.log(
        `  High confidence: ${highConfidenceRegions.length} regions (>=${LOW_CONFIDENCE_THRESHOLD * 100}%)`
      );
      console.log(
        `  Low confidence: ${lowConfidenceRegions.length} regions (${lowConfidencePercentage.toFixed(1)}%)`
      );
    }

    let croppedRegions = [];
    let geminiCorrectedTexts = new Map<number, string>();
    let geminiCost = 0;

    if (lowConfidenceRegions.length > 0) {
      if (isDevelopment) {
        console.log(
          `  Cropping ${lowConfidenceRegions.length} low-confidence regions...`
        );
      }
      croppedRegions = await batchCropRegions(
        imagePath,
        lowConfidenceRegions,
        10
      );

      if (isDevelopment) {
        console.log(`  Sending ${croppedRegions.length} regions to Gemini...`);
      }

      const geminiInputs = croppedRegions.map((cropped) => ({
        base64: cropped.base64,
        originalText: cropped.region.text,
      }));

      const geminiResults =
        await geminiClient.batchExtractTextFromRegions(geminiInputs);

      croppedRegions.forEach((cropped, i) => {
        const geminiText = geminiResults[i].text;
        geminiCorrectedTexts.set(cropped.region.index, geminiText);
      });

      geminiCost = geminiClient.estimateCost(lowConfidenceRegions.length, true);
      if (isDevelopment) {
        console.log(`  Gemini corrected ${geminiCorrectedTexts.size} regions`);
      }
    } else {
      if (isDevelopment) {
        console.log(
          `  All regions have high confidence - no Gemini correction needed!`
        );
      }
    }

    const allRegions = cloudVisionBBoxes.map(
      (bbox, index): CropRegion => ({
        bounds: bbox.bounds,
        text: bbox.text,
        confidence: bbox.confidence || 1.0,
        index,
      })
    );

    const finalText = mergeRegionTexts(allRegions, geminiCorrectedTexts);

    const avgConfidence =
      cloudVisionBBoxes.length > 0
        ? cloudVisionBBoxes.reduce(
            (sum, bbox) => sum + (bbox.confidence || 1.0),
            0
          ) / cloudVisionBBoxes.length
        : 0;

    const processingTime = Date.now() - startTime;

    const cloudVisionCost = cloudVisionClient.estimateCost(1);
    const estimatedCost = cloudVisionCost + geminiCost;

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

    if (isDevelopment) {
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
    }

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
