import { azureDocumentClient } from '../lib/azure-document-client.js';
import { geminiClient } from '../lib/gemini-client.js';
import { db, extractionResults } from '../db/index.js';
import {
  batchCropRegions,
  mergeRegionTexts,
  type CropRegion,
} from '../utils/image-cropper.js';

/**
 * Azure Read + Gemini Hybrid Processor (Word-Level Fusion)
 *
 * STRATEGY (Word-Level Fusion):
 * 1. Run Azure Read → Get word-level bounding boxes with confidence
 * 2. Keep high-confidence words as-is (≥0.85)
 * 3. Crop low-confidence word regions from image
 * 4. Send crops to Gemini for re-extraction
 * 5. Replace low-confidence words with Gemini results
 * 6. Combine: High-conf words + Gemini-corrected words = Final result
 *
 * Benefits: Word-level precision, fewer crops than paragraph-level
 */

export async function processWithAzureReadGeminiHybrid(
  imagePath: string,
  drawingId: string
) {
  console.log(
    `  Processing with Azure Read + Gemini Hybrid (Word-Level Fusion)...`
  );
  const startTime = Date.now();

  try {
    const azureResult = await azureDocumentClient.analyzeRead(imagePath);
    const azureText = azureResult.content;

    console.log(
      `  Azure Read: ${azureResult.words.length} words, ${azureText.length} chars`
    );

    const LOW_CONFIDENCE_THRESHOLD = 0.85;

    const highConfidenceWords: CropRegion[] = [];
    const lowConfidenceWords: CropRegion[] = [];

    azureResult.words.forEach((word, index) => {
      const region: CropRegion = {
        bounds: word.bounds,
        text: word.text,
        confidence: word.confidence,
        index,
      };

      if (region.confidence < LOW_CONFIDENCE_THRESHOLD) {
        lowConfidenceWords.push(region);
      } else {
        highConfidenceWords.push(region);
      }
    });

    const lowConfidencePercentage =
      (lowConfidenceWords.length / azureResult.words.length) * 100;
    const avgConfidence =
      azureResult.words.length > 0
        ? azureResult.words.reduce((sum, w) => sum + w.confidence, 0) /
          azureResult.words.length
        : 0;

    console.log(
      `  High confidence: ${highConfidenceWords.length} words (>=${LOW_CONFIDENCE_THRESHOLD * 100}%)`
    );
    console.log(
      `  Low confidence: ${lowConfidenceWords.length} words (${lowConfidencePercentage.toFixed(1)}%)`
    );
    console.log(`  Average confidence: ${(avgConfidence * 100).toFixed(1)}%`);

    let croppedWords = [];
    let geminiCorrectedTexts = new Map<number, string>();
    let geminiCost = 0;

    if (lowConfidenceWords.length > 0) {
      console.log(
        `  Cropping ${lowConfidenceWords.length} low-confidence words...`
      );
      croppedWords = await batchCropRegions(imagePath, lowConfidenceWords, 5);

      console.log(`  Sending ${croppedWords.length} words to Gemini...`);

      const geminiInputs = croppedWords.map((cropped) => ({
        base64: cropped.base64,
        originalText: cropped.region.text,
      }));

      const geminiResults =
        await geminiClient.batchExtractTextFromRegions(geminiInputs);

      croppedWords.forEach((cropped, i) => {
        const geminiText = geminiResults[i].text;
        geminiCorrectedTexts.set(cropped.region.index, geminiText);
      });

      geminiCost = geminiClient.estimateCost(lowConfidenceWords.length, true);
      console.log(`  Gemini corrected ${geminiCorrectedTexts.size} words`);
    } else {
      console.log(
        `  All words have high confidence - no Gemini correction needed!`
      );
    }

    const allWords = azureResult.words.map(
      (word, index): CropRegion => ({
        bounds: word.bounds,
        text: word.text,
        confidence: word.confidence,
        index,
      })
    );

    const finalText = mergeRegionTexts(allWords, geminiCorrectedTexts);

    const processingTime = Date.now() - startTime;

    const azureCost = azureDocumentClient.estimateCost(
      azureResult.pages.length,
      'read'
    );
    const estimatedCost = azureCost + geminiCost;

    const confidenceRanges = {
      excellent: azureResult.words.filter((w) => w.confidence >= 0.95).length,
      good: azureResult.words.filter(
        (w) => w.confidence >= 0.85 && w.confidence < 0.95
      ).length,
      medium: azureResult.words.filter(
        (w) => w.confidence >= 0.75 && w.confidence < 0.85
      ).length,
      low: azureResult.words.filter(
        (w) => w.confidence >= 0.6 && w.confidence < 0.75
      ).length,
      veryLow: azureResult.words.filter((w) => w.confidence < 0.6).length,
    };

    // Save to database with enhanced metadata
    const [dbResult] = await db
      .insert(extractionResults)
      .values({
        drawingId,
        tool: 'azure-read-gemini-hybrid',
        rawText: finalText,
        boundingBoxes: azureResult.words.map((word, index) => {
          const wasGeminiUpdated = geminiCorrectedTexts.has(index);
          const originalText = word.text;
          const finalWordText = geminiCorrectedTexts.get(index) || word.text;

          return {
            text: finalWordText,
            bounds: word.bounds,
            confidence: word.confidence,
            page: word.page,
            metadata: {
              isLowConfidence: word.confidence < LOW_CONFIDENCE_THRESHOLD,
              geminiUpdated: wasGeminiUpdated,
              originalText: wasGeminiUpdated ? originalText : undefined,
              updateReason: wasGeminiUpdated
                ? `Low confidence (${(word.confidence * 100).toFixed(1)}%) - corrected by Gemini`
                : undefined,
              source: wasGeminiUpdated ? 'gemini' : 'azure-read',
              granularity: 'word',
            },
          };
        }),
        processingTimeMs: processingTime,
        apiCost: estimatedCost,
        metadata: {
          strategy: 'word-level-fusion',
          granularity: 'word',
          model: 'prebuilt-read',
          azureCharCount: azureText.length,
          azureWordCount: azureResult.words.length,
          finalCharCount: finalText.length,
          avgConfidence,
          lowConfidenceWordsCount: lowConfidenceWords.length,
          highConfidenceWordsCount: highConfidenceWords.length,
          lowConfidencePercentage,
          geminiCorrectedCount: geminiCorrectedTexts.size,
          confidenceDistribution: confidenceRanges,
          confidenceDistributionPercent: {
            excellent:
              (
                (confidenceRanges.excellent / azureResult.words.length) *
                100
              ).toFixed(1) + '%',
            good:
              (
                (confidenceRanges.good / azureResult.words.length) *
                100
              ).toFixed(1) + '%',
            medium:
              (
                (confidenceRanges.medium / azureResult.words.length) *
                100
              ).toFixed(1) + '%',
            low:
              ((confidenceRanges.low / azureResult.words.length) * 100).toFixed(
                1
              ) + '%',
            veryLow:
              (
                (confidenceRanges.veryLow / azureResult.words.length) *
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

    console.log(
      `  Azure Read + Gemini Hybrid completed in ${(processingTime / 1000).toFixed(2)}s`
    );
    console.log(`     Final text: ${finalText.length} chars`);
    console.log(
      `     Azure Read: ${azureResult.words.length} words (avg confidence: ${(avgConfidence * 100).toFixed(1)}%)`
    );
    console.log(
      `     Distribution: ${confidenceRanges.excellent} excellent, ${confidenceRanges.good} good, ${confidenceRanges.medium} medium, ${confidenceRanges.low + confidenceRanges.veryLow} low`
    );
    console.log(
      `     Gemini corrections: ${geminiCorrectedTexts.size}/${lowConfidenceWords.length} low-confidence words`
    );
    console.log(
      `     Cost: ${estimatedCost.toFixed(2)} yen (saved ${(geminiClient.estimateCost(1, false) - geminiCost).toFixed(2)} yen vs full Gemini)`
    );

    return {
      success: true,
      extractionResultId: dbResult.id,
      tool: 'azure-read-gemini-hybrid',
      rawText: finalText,
      confidence: avgConfidence,
      processingTime,
      cost: estimatedCost,
      metadata: {
        strategy: 'word-level-fusion',
        azureWords: azureResult.words.length,
        geminiCorrected: geminiCorrectedTexts.size,
        lowConfidencePercentage,
        confidenceDistribution: confidenceRanges,
      },
    };
  } catch (error) {
    console.error(`  Azure Read + Gemini Hybrid failed:`, error);
    throw error;
  }
}
