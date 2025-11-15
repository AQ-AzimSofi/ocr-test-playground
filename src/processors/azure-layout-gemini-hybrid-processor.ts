import { azureDocumentClient } from '../lib/azure-document-client.js';
import { geminiClient } from '../lib/gemini-client.js';
import { db, extractionResults } from '../db/index.js';
import {
  batchCropRegions,
  mergeRegionTexts,
  type CropRegion,
} from '../utils/image-cropper.js';

const isDevelopment = process.env.NODE_ENV !== 'production';

/**
 * Azure Layout + Gemini Hybrid Processor (Line-Level Fusion)
 *
 * STRATEGY (Line-Level Fusion):
 * 1. Run Azure Layout → Get line-level bounding boxes with confidence
 * 2. Keep high-confidence lines as-is (≥0.85)
 * 3. Crop low-confidence line regions from image
 * 4. Send crops to Gemini for re-extraction
 * 5. Replace low-confidence lines with Gemini results
 * 6. Combine: High-conf lines + Gemini-corrected lines = Final result
 *
 * Benefits: Line-level precision with document structure awareness
 */

export async function processWithAzureLayoutGeminiHybrid(
  imagePath: string,
  drawingId: string
) {
  if (isDevelopment) {
    console.log(
      `  Processing with Azure Layout + Gemini Hybrid (Line-Level Fusion)...`
    );
  }
  const startTime = Date.now();

  try {
    const azureResult = await azureDocumentClient.analyzeLayout(imagePath);
    const azureText = azureResult.content;

    if (isDevelopment) {
      console.log(
        `  Azure Layout: ${azureResult.lines.length} lines, ${azureText.length} chars`
      );
    }

    const LOW_CONFIDENCE_THRESHOLD = 0.85;

    const highConfidenceLines: CropRegion[] = [];
    const lowConfidenceLines: CropRegion[] = [];

    azureResult.lines.forEach((line, index) => {
      const region: CropRegion = {
        bounds: line.bounds,
        text: line.text,
        confidence: line.confidence,
        index,
      };

      if (region.confidence !== undefined && region.confidence < LOW_CONFIDENCE_THRESHOLD) {
        lowConfidenceLines.push(region);
      } else {
        highConfidenceLines.push(region);
      }
    });

    const lowConfidencePercentage =
      (lowConfidenceLines.length / azureResult.lines.length) * 100;
    const confidences = azureResult.lines
      .map((line: any) => line.confidence)
      .filter((c: number) => c !== undefined);
    const avgConfidence =
      confidences.length > 0
        ? confidences.reduce((sum: number, c: number) => sum + c, 0) /
          confidences.length
        : undefined;

    if (isDevelopment) {
      console.log(
        `  High confidence: ${highConfidenceLines.length} lines (>=${LOW_CONFIDENCE_THRESHOLD * 100}%)`
      );
      console.log(
        `  Low confidence: ${lowConfidenceLines.length} lines (${lowConfidencePercentage.toFixed(1)}%)`
      );
      console.log(`  Average confidence: ${avgConfidence !== undefined ? (avgConfidence * 100).toFixed(1) + '%' : 'N/A'}`);
    }

    let croppedLines = [];
    let geminiCorrectedTexts = new Map<number, string>();
    let geminiCost = 0;

    if (lowConfidenceLines.length > 0) {
      if (isDevelopment) {
        console.log(
          `  Cropping ${lowConfidenceLines.length} low-confidence lines...`
        );
      }
      croppedLines = await batchCropRegions(imagePath, lowConfidenceLines, 8);

      if (isDevelopment) {
        console.log(`  Sending ${croppedLines.length} lines to Gemini...`);
      }

      const geminiInputs = croppedLines.map((cropped) => ({
        base64: cropped.base64,
        originalText: cropped.region.text,
      }));

      const geminiResults =
        await geminiClient.batchExtractTextFromRegions(geminiInputs);

      croppedLines.forEach((cropped, i) => {
        const geminiText = geminiResults[i].text;
        geminiCorrectedTexts.set(cropped.region.index, geminiText);
      });

      geminiCost = geminiClient.estimateCost(lowConfidenceLines.length, true);
      if (isDevelopment) {
        console.log(`  Gemini corrected ${geminiCorrectedTexts.size} lines`);
      }
    } else {
      if (isDevelopment) {
        console.log(
          `  All lines have high confidence - no Gemini correction needed!`
        );
      }
    }

    const allLines = azureResult.lines.map(
      (line, index): CropRegion => ({
        bounds: line.bounds,
        text: line.text,
        confidence: line.confidence,
        index,
      })
    );

    const finalText = mergeRegionTexts(allLines, geminiCorrectedTexts);

    const processingTime = Date.now() - startTime;

    const azureCost = azureDocumentClient.estimateCost(
      azureResult.pages.length,
      'layout'
    );
    const estimatedCost = azureCost + geminiCost;

    const confidenceRanges = {
      excellent: azureResult.lines.filter(
        (l) => l.confidence !== undefined && l.confidence >= 0.95
      ).length,
      good: azureResult.lines.filter(
        (l) => l.confidence !== undefined && l.confidence >= 0.85 && l.confidence < 0.95
      ).length,
      medium: azureResult.lines.filter(
        (l) => l.confidence !== undefined && l.confidence >= 0.75 && l.confidence < 0.85
      ).length,
      low: azureResult.lines.filter(
        (l) => l.confidence !== undefined && l.confidence >= 0.6 && l.confidence < 0.75
      ).length,
      veryLow: azureResult.lines.filter((l) => l.confidence !== undefined && l.confidence < 0.6)
        .length,
      noConfidence: azureResult.lines.filter((l) => l.confidence === undefined).length,
    };

    const [dbResult] = await db
      .insert(extractionResults)
      .values({
        drawingId,
        tool: 'azure-layout-gemini-hybrid',
        rawText: finalText,
        boundingBoxes: azureResult.lines.map((line, index) => {
          const wasGeminiUpdated = geminiCorrectedTexts.has(index);
          const originalText = line.text;
          const finalLineText = geminiCorrectedTexts.get(index) || line.text;

          return {
            text: finalLineText,
            bounds: line.bounds,
            confidence: line.confidence,
            page: line.page,
            metadata: {
              isLowConfidence:
                line.confidence !== undefined && line.confidence < LOW_CONFIDENCE_THRESHOLD,
              geminiUpdated: wasGeminiUpdated,
              originalText: wasGeminiUpdated ? originalText : undefined,
              updateReason: wasGeminiUpdated && line.confidence !== undefined
                ? `Low confidence (${(line.confidence * 100).toFixed(1)}%) - corrected by Gemini`
                : wasGeminiUpdated
                ? 'Corrected by Gemini (no confidence available)'
                : undefined,
              source: wasGeminiUpdated ? 'gemini' : 'azure-layout',
              granularity: 'line',
            },
          };
        }),
        processingTimeMs: processingTime,
        apiCost: estimatedCost,
        metadata: {
          strategy: 'line-level-fusion',
          granularity: 'line',
          model: 'prebuilt-layout',
          azureCharCount: azureText.length,
          azureLineCount: azureResult.lines.length,
          finalCharCount: finalText.length,
          avgConfidence,
          lowConfidenceLinesCount: lowConfidenceLines.length,
          highConfidenceLinesCount: highConfidenceLines.length,
          lowConfidencePercentage,
          geminiCorrectedCount: geminiCorrectedTexts.size,
          confidenceDistribution: confidenceRanges,
          confidenceDistributionPercent: {
            excellent:
              (
                (confidenceRanges.excellent / azureResult.lines.length) *
                100
              ).toFixed(1) + '%',
            good:
              (
                (confidenceRanges.good / azureResult.lines.length) *
                100
              ).toFixed(1) + '%',
            medium:
              (
                (confidenceRanges.medium / azureResult.lines.length) *
                100
              ).toFixed(1) + '%',
            low:
              ((confidenceRanges.low / azureResult.lines.length) * 100).toFixed(
                1
              ) + '%',
            veryLow:
              (
                (confidenceRanges.veryLow / azureResult.lines.length) *
                100
              ).toFixed(1) + '%',
          },
          confidenceThreshold: LOW_CONFIDENCE_THRESHOLD,
          azureCost,
          geminiCost,
          costSavings:
            (geminiClient.estimateCost(1, false) - geminiCost).toFixed(2) +
            ' yen (vs full-image Gemini)',
        },
      })
      .returning();

    if (isDevelopment) {
      console.log(
        `  Azure Layout + Gemini Hybrid completed in ${(processingTime / 1000).toFixed(2)}s`
      );
      console.log(`     Final text: ${finalText.length} chars`);
      console.log(
        `     Azure Layout: ${azureResult.lines.length} lines (avg confidence: ${avgConfidence !== undefined ? (avgConfidence * 100).toFixed(1) + '%' : 'N/A'})`
      );
      console.log(
        `     Distribution: ${confidenceRanges.excellent} excellent, ${confidenceRanges.good} good, ${confidenceRanges.medium} medium, ${confidenceRanges.low + confidenceRanges.veryLow} low`
      );
      console.log(
        `     Gemini corrections: ${geminiCorrectedTexts.size}/${lowConfidenceLines.length} low-confidence lines`
      );
      console.log(
        `     Cost: ${estimatedCost.toFixed(2)} yen (saved ${(geminiClient.estimateCost(1, false) - geminiCost).toFixed(2)} yen vs full Gemini)`
      );
    }

    return {
      success: true,
      extractionResultId: dbResult.id,
      tool: 'azure-layout-gemini-hybrid',
      rawText: finalText,
      confidence: avgConfidence,
      processingTime,
      cost: estimatedCost,
      metadata: {
        strategy: 'line-level-fusion',
        azureLines: azureResult.lines.length,
        geminiCorrected: geminiCorrectedTexts.size,
        lowConfidencePercentage,
        confidenceDistribution: confidenceRanges,
      },
    };
  } catch (error) {
    console.error(`  Azure Layout + Gemini Hybrid failed:`, error);
    throw error;
  }
}
