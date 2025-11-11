import { cloudVisionClient } from '../lib/cloud-vision-client.js';
import { geminiClient } from '../lib/gemini-client.js';
import { db, extractionResults } from '../db/index.js';
import Levenshtein from 'fast-levenshtein';

/**
 * Cloud Vision + Gemini Hybrid Processor
 *
 * Strategy:
 * 1. Run Cloud Vision to get bounding boxes + text + confidence scores
 * 2. Run Gemini in parallel for robust text extraction
 * 3. Analyze confidence scores from Cloud Vision
 * 4. Compare results and identify discrepancies
 * 5. Combine intelligently:
 *    - Use Cloud Vision for spatial data (bounding boxes)
 *    - Use Gemini text where Cloud Vision has low confidence
 *    - Flag disagreements for user review
 */

interface ConfidenceRegion {
  index: number;
  text: string;
  confidence: number;
  bounds: Array<{ x: number; y: number }>;
  isLowConfidence: boolean;
}

interface ComparisonResult {
  cloudVisionText: string;
  geminiText: string;
  similarity: number;
  editDistance: number;
  selectedText: string;
  selectionReason: string;
  lowConfidenceRegions: ConfidenceRegion[];
  highConfidenceRegions: ConfidenceRegion[];
  discrepancies: Array<{
    region: ConfidenceRegion;
    geminiVersion: string;
    reason: string;
  }>;
}

export async function processWithCloudVisionGeminiHybrid(
  imagePath: string,
  drawingId: string
) {
  console.log(`  Processing with Cloud Vision + Gemini Hybrid...`);
  const startTime = Date.now();

  try {
    // Run both tools in parallel for speed
    const [cloudVisionResult, cloudVisionBBoxes, geminiResult] =
      await Promise.all([
        cloudVisionClient.extractText(imagePath),
        cloudVisionClient.extractTextWithBoundingBoxes(imagePath),
        geminiClient.extractText(imagePath),
      ]);

    const cloudVisionText = cloudVisionResult.text;
    const geminiText = geminiResult.text;

    // Analyze confidence scores and categorize regions
    const LOW_CONFIDENCE_THRESHOLD = 0.85; // Adjustable threshold

    const lowConfidenceRegions: ConfidenceRegion[] = [];
    const highConfidenceRegions: ConfidenceRegion[] = [];

    cloudVisionBBoxes.forEach((bbox, index) => {
      const region: ConfidenceRegion = {
        index,
        text: bbox.text,
        confidence: bbox.confidence || 1.0,
        bounds: bbox.bounds,
        isLowConfidence: (bbox.confidence || 1.0) < LOW_CONFIDENCE_THRESHOLD,
      };

      if (region.isLowConfidence) {
        lowConfidenceRegions.push(region);
      } else {
        highConfidenceRegions.push(region);
      }
    });

    // Calculate similarity between Cloud Vision and Gemini results
    const editDistance = Levenshtein.get(cloudVisionText, geminiText);
    const maxLength = Math.max(cloudVisionText.length, geminiText.length);
    const similarity =
      maxLength > 0 ? ((maxLength - editDistance) / maxLength) * 100 : 0;

    // Decision logic for text selection
    let selectedText: string;
    let selectionReason: string;
    const discrepancies: ComparisonResult['discrepancies'] = [];

    // Strategy: Use Gemini when overall agreement is high OR when Cloud Vision has many low-confidence regions
    const lowConfidencePercentage =
      (lowConfidenceRegions.length / cloudVisionBBoxes.length) * 100;

    if (lowConfidencePercentage > 30) {
      // Many low-confidence regions - prefer Gemini
      selectedText = geminiText;
      selectionReason = `High percentage of low-confidence regions (${lowConfidencePercentage.toFixed(1)}%) - using Gemini`;

      // Flag all low-confidence regions as discrepancies
      lowConfidenceRegions.forEach((region) => {
        discrepancies.push({
          region,
          geminiVersion: 'Used Gemini due to low confidence',
          reason: `Confidence ${(region.confidence * 100).toFixed(1)}% < ${LOW_CONFIDENCE_THRESHOLD * 100}%`,
        });
      });
    } else if (similarity < 70) {
      // Low agreement - prefer longer/more complete extraction
      if (geminiText.length > cloudVisionText.length) {
        selectedText = geminiText;
        selectionReason = `Low agreement (${similarity.toFixed(1)}%), Gemini extracted more text (${geminiText.length} vs ${cloudVisionText.length} chars)`;
      } else {
        selectedText = cloudVisionText;
        selectionReason = `Low agreement (${similarity.toFixed(1)}%), Cloud Vision extracted more text (${cloudVisionText.length} vs ${geminiText.length} chars)`;
      }
    } else {
      // High agreement - use Cloud Vision (has spatial data)
      selectedText = cloudVisionText;
      selectionReason = `High agreement (${similarity.toFixed(1)}%) - using Cloud Vision with spatial data`;

      // Still flag low-confidence regions for user awareness
      lowConfidenceRegions.forEach((region) => {
        discrepancies.push({
          region,
          geminiVersion: 'Alternative extraction available from Gemini',
          reason: `Low confidence: ${(region.confidence * 100).toFixed(1)}%`,
        });
      });
    }

    const processingTime = Date.now() - startTime;

    // Estimate combined cost
    const cloudVisionCost = cloudVisionClient.estimateCost(1);
    const geminiCost = geminiClient.estimateCost(geminiText.length);
    const estimatedCost = cloudVisionCost + geminiCost;

    // Calculate average confidence from Cloud Vision
    const avgConfidence =
      cloudVisionBBoxes.length > 0
        ? cloudVisionBBoxes.reduce(
            (sum, bbox) => sum + (bbox.confidence || 1.0),
            0
          ) / cloudVisionBBoxes.length
        : undefined;

    // Save to database with comprehensive metadata
    const [dbResult] = await db
      .insert(extractionResults)
      .values({
        drawingId,
        tool: 'cloud-vision-gemini-hybrid',
        rawText: selectedText,
        boundingBoxes: cloudVisionBBoxes.map((bbox, index) => ({
          text: bbox.text,
          bounds: bbox.bounds,
          confidence: bbox.confidence,
          metadata: {
            isLowConfidence: lowConfidenceRegions.some(
              (r) => r.index === index
            ),
            usedGeminiFallback:
              selectedText === geminiText &&
              lowConfidenceRegions.some((r) => r.index === index),
          },
        })),
        processingTimeMs: processingTime,
        apiCost: estimatedCost,
        metadata: {
          cloudVisionCharCount: cloudVisionText.length,
          geminiCharCount: geminiText.length,
          selectedSource:
            selectedText === cloudVisionText ? 'cloud-vision' : 'gemini',
          selectionReason,
          similarity,
          editDistance,
          avgConfidence,
          lowConfidenceRegionsCount: lowConfidenceRegions.length,
          highConfidenceRegionsCount: highConfidenceRegions.length,
          lowConfidencePercentage,
          discrepanciesCount: discrepancies.length,
          confidenceThreshold: LOW_CONFIDENCE_THRESHOLD,
        },
      })
      .returning();

    console.log(
      `  Cloud Vision + Gemini Hybrid completed in ${(processingTime / 1000).toFixed(2)}s`
    );
    console.log(
      `     Selected: ${selectedText === cloudVisionText ? 'Cloud Vision' : 'Gemini'} (${selectedText.length} chars)`
    );
    console.log(
      `     Cloud Vision: ${cloudVisionText.length} chars (avg confidence: ${((avgConfidence || 0) * 100).toFixed(1)}%)`
    );
    console.log(`     Gemini: ${geminiText.length} chars`);
    console.log(`     Agreement: ${similarity.toFixed(1)}%`);
    console.log(
      `     Low confidence regions: ${lowConfidenceRegions.length}/${cloudVisionBBoxes.length} (${lowConfidencePercentage.toFixed(1)}%)`
    );
    if (discrepancies.length > 0) {
      console.log(
        `     Warning: ${discrepancies.length} regions flagged for review`
      );
    }

    return {
      success: true,
      extractionResultId: dbResult.id,
      tool: 'cloud-vision-gemini-hybrid',
      rawText: selectedText,
      confidence: avgConfidence,
      processingTime,
      cost: estimatedCost,
      metadata: {
        cloudVisionText,
        geminiText,
        similarity,
        selectionReason,
        lowConfidenceRegions: lowConfidenceRegions.length,
        discrepancies: discrepancies.length,
      },
    };
  } catch (error) {
    console.error(`  Cloud Vision + Gemini Hybrid failed:`, error);
    throw error;
  }
}
