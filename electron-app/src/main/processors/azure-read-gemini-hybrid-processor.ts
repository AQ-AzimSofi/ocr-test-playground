import {
  AzureDocumentProcessor,
  AzureResult,
} from './azure-processors';
import { GeminiTextProcessor } from './gemini-text-processor';
import {
  batchCropRegions,
  mergeRegionTexts,
  type CropRegion,
} from '../utils/image-cropper';
import { QueueConfig } from '../utils/gemini-queue';

const isDevelopment = process.env.NODE_ENV !== 'production';

/**
 * Azure Read + Gemini Hybrid Processor (Word-Level Fusion)
 *
 * Combines Azure Read's word-level confidence scores with Gemini's text correction.
 * High-confidence words (≥0.85) are kept as-is; low-confidence words are cropped
 * and re-extracted by Gemini, then merged into the final result.
 */

export interface AzureGeminiHybridResult extends AzureResult {
  rateLimitWaitTime?: number;
  metadata: AzureResult['metadata'] & {
    strategy: string;
    lowConfidenceWordsCount: number;
    highConfidenceWordsCount: number;
    lowConfidencePercentage: number;
    geminiCorrectedCount: number;
    confidenceThreshold: number;
    azureCost: number;
    geminiCost: number;
    costSavings: string;
    confidenceDistribution: {
      excellent: number;
      good: number;
      medium: number;
      low: number;
      veryLow: number;
    };
  };
}

export class AzureReadGeminiHybridProcessor {
  private azureProcessor: AzureDocumentProcessor;
  private gemini: GeminiTextProcessor;
  private lowConfidenceThreshold: number;

  constructor(
    azureEndpoint: string,
    azureApiKey: string,
    geminiApiKey: string,
    lowConfidenceThreshold: number = 0.85,
    queueConfig?: Partial<QueueConfig>
  ) {
    this.azureProcessor = new AzureDocumentProcessor(azureEndpoint, azureApiKey);
    this.gemini = new GeminiTextProcessor(geminiApiKey, 'gemini-2.5-flash', queueConfig);
    this.lowConfidenceThreshold = lowConfidenceThreshold;
  }

  /**
   * Update Gemini queue configuration
   */
  updateQueueConfig(config: Partial<QueueConfig>): void {
    this.gemini.updateQueueConfig(config);
  }

  /**
   * Get Gemini processor instance (for accessing queue stats)
   */
  getGeminiProcessor(): GeminiTextProcessor {
    return this.gemini;
  }

  /**
   * Process an image with hybrid Azure Read + Gemini approach
   */
  async processImage(
    imagePath: string,
    _pageNumber: number = 1
  ): Promise<AzureGeminiHybridResult> {
    if (isDevelopment) console.log(
      `  Processing with Azure Read + Gemini Hybrid (Word-Level Fusion)...`
    );
    const startTime = Date.now();

    try {
      const azureResult = await this.azureProcessor.processRead(imagePath);

      if (!azureResult.success) {
        return {
          ...azureResult,
          tool: 'azure-read-gemini-hybrid',
          metadata: {
            ...azureResult.metadata,
            strategy: 'word-level-fusion',
            lowConfidenceWordsCount: 0,
            highConfidenceWordsCount: 0,
            lowConfidencePercentage: 0,
            geminiCorrectedCount: 0,
            confidenceThreshold: this.lowConfidenceThreshold,
            azureCost: 0,
            geminiCost: 0,
            costSavings: '0.00 yen',
            confidenceDistribution: {
              excellent: 0,
              good: 0,
              medium: 0,
              low: 0,
              veryLow: 0,
            },
          },
        } as AzureGeminiHybridResult;
      }

      const azureWords = azureResult.boundingBoxes;
      const azureText = azureResult.rawText;

      if (isDevelopment) console.log(
        `  Azure Read: ${azureWords.length} words, ${azureText.length} chars`
      );

      const highConfidenceWords: CropRegion[] = [];
      const lowConfidenceWords: CropRegion[] = [];

      azureWords.forEach((word, index) => {
        const region: CropRegion = {
          bounds: word.bounds,
          text: word.text,
          confidence: word.confidence || 1.0,
          index,
          page: word.page,
        };

        if (region.confidence! < this.lowConfidenceThreshold) {
          lowConfidenceWords.push(region);
        } else {
          highConfidenceWords.push(region);
        }
      });

      const lowConfidencePercentage =
        azureWords.length > 0
          ? (lowConfidenceWords.length / azureWords.length) * 100
          : 0;

      // Calculate confidence distribution
      const confidenceDistribution = {
        excellent: azureWords.filter((w) => w.confidence >= 0.95).length,
        good: azureWords.filter(
          (w) => w.confidence >= 0.85 && w.confidence < 0.95
        ).length,
        medium: azureWords.filter(
          (w) => w.confidence >= 0.75 && w.confidence < 0.85
        ).length,
        low: azureWords.filter(
          (w) => w.confidence >= 0.6 && w.confidence < 0.75
        ).length,
        veryLow: azureWords.filter((w) => w.confidence < 0.6).length,
      };

      if (isDevelopment) console.log(
        `  High confidence: ${highConfidenceWords.length} words (>=${this.lowConfidenceThreshold * 100}%)`
      );
      if (isDevelopment) console.log(
        `  Low confidence: ${lowConfidenceWords.length} words (${lowConfidencePercentage.toFixed(1)}%)`
      );
      if (isDevelopment) console.log(
        `  Distribution: ${confidenceDistribution.excellent} excellent, ${confidenceDistribution.good} good, ${confidenceDistribution.medium} medium, ${confidenceDistribution.low + confidenceDistribution.veryLow} low`
      );

      let geminiCorrectedTexts = new Map<number, string>();
      let geminiCost = 0;

      if (lowConfidenceWords.length > 0) {
        if (isDevelopment) console.log(
          `  Cropping ${lowConfidenceWords.length} low-confidence words...`
        );

        const croppedWords = await batchCropRegions(imagePath, lowConfidenceWords, 5);

        if (isDevelopment) console.log(`  Sending ${croppedWords.length} words to Gemini...`);

        const geminiInputs = croppedWords.map((cropped) => ({
          base64: cropped.base64,
          originalText: cropped.region.text,
        }));

        try {
          const geminiResults =
            await this.gemini.batchExtractTextFromRegions(geminiInputs);

          croppedWords.forEach((cropped, i) => {
            const geminiText = geminiResults[i].text;
            geminiCorrectedTexts.set(cropped.region.index, geminiText);
          });

          geminiCost = this.gemini.estimateCost(lowConfidenceWords.length, true);
          if (isDevelopment) console.log(`  Gemini corrected ${geminiCorrectedTexts.size} words`);
        } catch (error) {
          console.error('[DEBUG] Gemini API call FAILED:', error);
          throw error;
        }
      } else {
        if (isDevelopment) console.log(
          `  All words have high confidence - no Gemini correction needed`
        );
      }

      const allWords = azureWords.map(
        (word, index): CropRegion => ({
          bounds: word.bounds,
          text: word.text,
          confidence: word.confidence || 1.0,
          index,
          page: word.page,
        })
      );

      const finalText = mergeRegionTexts(allWords, geminiCorrectedTexts);

      const updatedBoundingBoxes = azureWords.map((word, index) => {
        const wasGeminiUpdated = geminiCorrectedTexts.has(index);
        const originalText = word.text;
        const finalWordText = geminiCorrectedTexts.get(index) || word.text;

        return {
          ...word,
          text: finalWordText,
          metadata: {
            isLowConfidence:
              (word.confidence || 1.0) < this.lowConfidenceThreshold,
            geminiUpdated: wasGeminiUpdated,
            originalText: wasGeminiUpdated ? originalText : undefined,
            updateReason: wasGeminiUpdated
              ? `Low confidence (${((word.confidence || 1.0) * 100).toFixed(1)}%) - corrected by Gemini`
              : undefined,
            source: wasGeminiUpdated ? 'gemini' : 'azure-read',
            granularity: 'word',
          },
        };
      });

      const processingTime = Date.now() - startTime;
      const azureCost = this.azureProcessor.estimateCost(1, 'read');
      const estimatedCost = azureCost + geminiCost;

      const fullImageGeminiCost = this.gemini.estimateCost(1, false);
      const costSavings = `${(fullImageGeminiCost - geminiCost).toFixed(2)} yen (vs full-image Gemini)`;

      if (isDevelopment) {
        console.log(`  Azure Read + Gemini Hybrid completed in ${(processingTime / 1000).toFixed(2)}s`);
        console.log(`     Final text: ${finalText.length} chars`);
        console.log(`     Azure Read: ${azureWords.length} words (avg confidence: ${(azureResult.confidence * 100).toFixed(1)}%)`);
        console.log(`     Gemini corrections: ${geminiCorrectedTexts.size}/${lowConfidenceWords.length} low-confidence words`);
        console.log(`     Cost: ${estimatedCost.toFixed(2)} yen (saved ${costSavings})`);
      }

      const queueStats = this.gemini.getQueueStats();
      const rateLimitWaitTime = queueStats.rateLimitWaitTime || 0;

      return {
        success: true,
        tool: 'azure-read-gemini-hybrid',
        rawText: finalText,
        boundingBoxes: updatedBoundingBoxes,
        confidence: azureResult.confidence,
        processingTime,
        cost: estimatedCost,
        rateLimitWaitTime,
        metadata: {
          ...azureResult.metadata,
          strategy: 'word-level-fusion',
          lowConfidenceWordsCount: lowConfidenceWords.length,
          highConfidenceWordsCount: highConfidenceWords.length,
          lowConfidencePercentage,
          geminiCorrectedCount: geminiCorrectedTexts.size,
          confidenceThreshold: this.lowConfidenceThreshold,
          azureCost,
          geminiCost,
          costSavings,
          confidenceDistribution,
        },
      };
    } catch (error) {
      return {
        success: false,
        tool: 'azure-read-gemini-hybrid',
        rawText: '',
        boundingBoxes: [],
        confidence: 0,
        processingTime: Date.now() - startTime,
        cost: 0,
        metadata: {
          granularity: 'word',
          model: 'prebuilt-read',
          wordCount: 0,
          pageCount: 1,
          avgConfidence: 0,
          strategy: 'word-level-fusion',
          lowConfidenceWordsCount: 0,
          highConfidenceWordsCount: 0,
          lowConfidencePercentage: 0,
          geminiCorrectedCount: 0,
          confidenceThreshold: this.lowConfidenceThreshold,
          azureCost: 0,
          geminiCost: 0,
          costSavings: '0.00 yen',
          confidenceDistribution: {
            excellent: 0,
            good: 0,
            medium: 0,
            low: 0,
            veryLow: 0,
          },
        },
        error: error instanceof Error ? error.message : String(error),
      };
    }
  }
}
