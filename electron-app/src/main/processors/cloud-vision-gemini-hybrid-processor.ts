// Internal imports
import {
  CloudVisionProcessor,
  CloudVisionCredentials,
  CloudVisionResult,
} from './cloud-vision-processor';
import { GeminiTextProcessor } from './gemini-text-processor';
import {
  batchCropRegions,
  mergeRegionTexts,
  type CropRegion,
} from '../utils/image-cropper';

// Type imports
import { QueueConfig } from '../utils/gemini-queue';

const isDevelopment = process.env.NODE_ENV !== 'production';

/**
 * Cloud Vision + Gemini Hybrid Processor (Region-Level Fusion)
 *
 * Combines Cloud Vision's region detection with Gemini's text correction.
 * High-confidence regions (≥0.85) are kept as-is; low-confidence regions are
 * cropped and re-extracted by Gemini, then merged into the final result.
 */

export interface HybridProcessorResult extends CloudVisionResult {
  rateLimitWaitTime?: number;
  metadata: CloudVisionResult['metadata'] & {
    strategy: string;
    lowConfidenceRegionsCount: number;
    highConfidenceRegionsCount: number;
    lowConfidencePercentage: number;
    geminiCorrectedCount: number;
    confidenceThreshold: number;
    cloudVisionCost: number;
    geminiCost: number;
    costSavings: string;
  };
}

export class CloudVisionGeminiHybridProcessor {
  private cloudVision: CloudVisionProcessor;
  private gemini: GeminiTextProcessor;
  private lowConfidenceThreshold: number;

  constructor(
    cloudVisionCredentials: CloudVisionCredentials,
    geminiApiKey: string,
    lowConfidenceThreshold: number = 0.85,
    queueConfig?: Partial<QueueConfig>
  ) {
    if (isDevelopment) console.log('[DEBUG] CloudVisionGeminiHybrid constructor - Gemini key:', {
      received: !!geminiApiKey,
      length: geminiApiKey?.length,
      type: typeof geminiApiKey,
      preview: geminiApiKey?.substring(0, 15) + '...'
    });

    this.cloudVision = new CloudVisionProcessor(cloudVisionCredentials);
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
   * Process an image with hybrid Cloud Vision + Gemini approach
   */
  async processImage(
    imagePath: string,
    pageNumber: number = 1
  ): Promise<HybridProcessorResult> {
    if (isDevelopment) console.log(
      `  Processing with Cloud Vision + Gemini Hybrid (Region-Level Fusion)...`
    );
    const startTime = Date.now();

    try {
      const cloudVisionResult = await this.cloudVision.processImage(imagePath, pageNumber);

      if (!cloudVisionResult.success) {
        return {
          ...cloudVisionResult,
          tool: 'cloud-vision-gemini-hybrid',
          metadata: {
            ...cloudVisionResult.metadata,
            strategy: 'region-level-fusion',
            lowConfidenceRegionsCount: 0,
            highConfidenceRegionsCount: 0,
            lowConfidencePercentage: 0,
            geminiCorrectedCount: 0,
            confidenceThreshold: this.lowConfidenceThreshold,
            cloudVisionCost: 0,
            geminiCost: 0,
            costSavings: '0.00 yen',
          },
        } as HybridProcessorResult;
      }

      const cloudVisionBBoxes = cloudVisionResult.boundingBoxes;
      const cloudVisionText = cloudVisionResult.rawText;

      if (isDevelopment) console.log(
        `  Cloud Vision: ${cloudVisionBBoxes.length} regions, ${cloudVisionText.length} chars`
      );

      const highConfidenceRegions: CropRegion[] = [];
      const lowConfidenceRegions: CropRegion[] = [];

      cloudVisionBBoxes.forEach((bbox, index) => {
        const region: CropRegion = {
          bounds: bbox.bounds,
          text: bbox.text,
          confidence: bbox.confidence || 1.0,
          index,
          page: bbox.page,
        };

        if (region.confidence! < this.lowConfidenceThreshold) {
          lowConfidenceRegions.push(region);
        } else {
          highConfidenceRegions.push(region);
        }
      });

      const lowConfidencePercentage =
        cloudVisionBBoxes.length > 0
          ? (lowConfidenceRegions.length / cloudVisionBBoxes.length) * 100
          : 0;

      if (isDevelopment) console.log(
        `  High confidence: ${highConfidenceRegions.length} regions (>=${this.lowConfidenceThreshold * 100}%)`
      );
      if (isDevelopment) console.log(
        `  Low confidence: ${lowConfidenceRegions.length} regions (${lowConfidencePercentage.toFixed(1)}%)`
      );

      let geminiCorrectedTexts = new Map<number, string>();
      let geminiCost = 0;

      if (lowConfidenceRegions.length > 0) {
        if (isDevelopment) console.log(
          `  Cropping ${lowConfidenceRegions.length} low-confidence regions...`
        );

        const croppedRegions = await batchCropRegions(imagePath, lowConfidenceRegions, 10);

        if (isDevelopment) console.log(`  Sending ${croppedRegions.length} regions to Gemini...`);

        const geminiInputs = croppedRegions.map((cropped) => ({
          base64: cropped.base64,
          originalText: cropped.region.text,
        }));

        try {
          const geminiResults =
            await this.gemini.batchExtractTextFromRegions(geminiInputs);

          croppedRegions.forEach((cropped, i) => {
            const geminiText = geminiResults[i].text;
            geminiCorrectedTexts.set(cropped.region.index, geminiText);
          });

          geminiCost = this.gemini.estimateCost(lowConfidenceRegions.length, true);
          if (isDevelopment) console.log(`  Gemini corrected ${geminiCorrectedTexts.size} regions`);
        } catch (error) {
          console.error('Gemini API call failed:', error);
          throw error;
        }
      } else {
        if (isDevelopment) console.log(
          `  All regions have high confidence - no Gemini correction needed`
        );
      }

      const allRegions = cloudVisionBBoxes.map(
        (bbox, index): CropRegion => ({
          bounds: bbox.bounds,
          text: bbox.text,
          confidence: bbox.confidence || 1.0,
          index,
          page: bbox.page,
        })
      );

      const finalText = mergeRegionTexts(allRegions, geminiCorrectedTexts);

      const updatedBoundingBoxes = cloudVisionBBoxes.map((bbox, index) => {
        const wasGeminiUpdated = geminiCorrectedTexts.has(index);
        const originalText = bbox.text;
        const finalBboxText = geminiCorrectedTexts.get(index) || bbox.text;

        return {
          ...bbox,
          text: finalBboxText,
          metadata: {
            isLowConfidence: (bbox.confidence || 1.0) < this.lowConfidenceThreshold,
            geminiUpdated: wasGeminiUpdated,
            originalText: wasGeminiUpdated ? originalText : undefined,
            updateReason: wasGeminiUpdated
              ? `Low confidence (${((bbox.confidence || 1.0) * 100).toFixed(1)}%) - corrected by Gemini`
              : undefined,
            source: wasGeminiUpdated ? 'gemini' : 'cloud-vision',
          },
        };
      });

      const processingTime = Date.now() - startTime;
      const cloudVisionCost = this.cloudVision.estimateCost(1);
      const estimatedCost = cloudVisionCost + geminiCost;

      const fullImageGeminiCost = this.gemini.estimateCost(1, false);
      const costSavings = `${(fullImageGeminiCost - geminiCost).toFixed(2)} yen (vs full-image Gemini)`;

      if (isDevelopment) {
        console.log(`  Cloud Vision + Gemini Hybrid completed in ${(processingTime / 1000).toFixed(2)}s`);
        console.log(`     Final text: ${finalText.length} chars`);
        console.log(`     Cloud Vision: ${cloudVisionBBoxes.length} regions (avg confidence: ${(cloudVisionResult.confidence * 100).toFixed(1)}%)`);
        console.log(`     Gemini corrections: ${geminiCorrectedTexts.size}/${lowConfidenceRegions.length} low-confidence regions`);
        console.log(`     Cost: ${estimatedCost.toFixed(2)} yen (saved ${costSavings})`);
      }

      const queueStats = this.gemini.getQueueStats();
      const rateLimitWaitTime = queueStats.rateLimitWaitTime || 0;

      return {
        success: true,
        tool: 'cloud-vision-gemini-hybrid',
        rawText: finalText,
        boundingBoxes: updatedBoundingBoxes,
        confidence: cloudVisionResult.confidence,
        processingTime,
        cost: estimatedCost,
        rateLimitWaitTime,
        metadata: {
          ...cloudVisionResult.metadata,
          strategy: 'region-level-fusion',
          lowConfidenceRegionsCount: lowConfidenceRegions.length,
          highConfidenceRegionsCount: highConfidenceRegions.length,
          lowConfidencePercentage,
          geminiCorrectedCount: geminiCorrectedTexts.size,
          confidenceThreshold: this.lowConfidenceThreshold,
          cloudVisionCost,
          geminiCost,
          costSavings,
        },
      };
    } catch (error) {
      return {
        success: false,
        tool: 'cloud-vision-gemini-hybrid',
        rawText: '',
        boundingBoxes: [],
        confidence: 0,
        processingTime: Date.now() - startTime,
        cost: 0,
        metadata: {
          granularity: 'paragraph',
          avgConfidence: 0,
          regionCount: 0,
          pageCount: 1,
          strategy: 'region-level-fusion',
          lowConfidenceRegionsCount: 0,
          highConfidenceRegionsCount: 0,
          lowConfidencePercentage: 0,
          geminiCorrectedCount: 0,
          confidenceThreshold: this.lowConfidenceThreshold,
          cloudVisionCost: 0,
          geminiCost: 0,
          costSavings: '0.00 yen',
        },
        error: error instanceof Error ? error.message : String(error),
      };
    }
  }

  /**
   * Process multiple images from PDF pages
   */
  async processImages(
    imagePaths: string[]
  ): Promise<HybridProcessorResult> {
    const startTime = Date.now();

    try {
      const allResults: HybridProcessorResult[] = [];
      let totalCost = 0;

      for (let i = 0; i < imagePaths.length; i++) {
        const pageNum = i + 1;
        const result = await this.processImage(imagePaths[i], pageNum);

        if (result.success) {
          allResults.push(result);
          totalCost += result.cost;
        } else {
          return {
            ...result,
            processingTime: Date.now() - startTime,
            error: `Failed on page ${pageNum}: ${result.error}`,
          };
        }
      }

      const allBboxes = allResults.flatMap((r) => r.boundingBoxes);
      const rawText = allResults.map((r) => r.rawText).join('\n');

      const avgConfidence =
        allBboxes.length > 0
          ? allBboxes.reduce((sum, b) => sum + b.confidence, 0) /
            allBboxes.length
          : 0;

      const totalLowConf = allResults.reduce(
        (sum, r) => sum + r.metadata.lowConfidenceRegionsCount,
        0
      );
      const totalHighConf = allResults.reduce(
        (sum, r) => sum + r.metadata.highConfidenceRegionsCount,
        0
      );
      const totalGeminiCorrected = allResults.reduce(
        (sum, r) => sum + r.metadata.geminiCorrectedCount,
        0
      );

      return {
        success: true,
        tool: 'cloud-vision-gemini-hybrid',
        rawText,
        boundingBoxes: allBboxes,
        confidence: avgConfidence,
        processingTime: Date.now() - startTime,
        cost: totalCost,
        metadata: {
          granularity: 'paragraph',
          avgConfidence,
          regionCount: allBboxes.length,
          pageCount: imagePaths.length,
          strategy: 'region-level-fusion',
          lowConfidenceRegionsCount: totalLowConf,
          highConfidenceRegionsCount: totalHighConf,
          lowConfidencePercentage:
            allBboxes.length > 0 ? (totalLowConf / allBboxes.length) * 100 : 0,
          geminiCorrectedCount: totalGeminiCorrected,
          confidenceThreshold: this.lowConfidenceThreshold,
          cloudVisionCost: allResults.reduce(
            (sum, r) => sum + r.metadata.cloudVisionCost,
            0
          ),
          geminiCost: allResults.reduce(
            (sum, r) => sum + r.metadata.geminiCost,
            0
          ),
          costSavings: `Multi-page hybrid processing`,
        },
      };
    } catch (error) {
      return {
        success: false,
        tool: 'cloud-vision-gemini-hybrid',
        rawText: '',
        boundingBoxes: [],
        confidence: 0,
        processingTime: Date.now() - startTime,
        cost: 0,
        metadata: {
          granularity: 'paragraph',
          avgConfidence: 0,
          regionCount: 0,
          pageCount: imagePaths.length,
          strategy: 'region-level-fusion',
          lowConfidenceRegionsCount: 0,
          highConfidenceRegionsCount: 0,
          lowConfidencePercentage: 0,
          geminiCorrectedCount: 0,
          confidenceThreshold: this.lowConfidenceThreshold,
          cloudVisionCost: 0,
          geminiCost: 0,
          costSavings: '0.00 yen',
        },
        error: error instanceof Error ? error.message : String(error),
      };
    }
  }

  /**
   * Clean up resources
   */
  cleanup() {
    this.cloudVision.cleanup();
  }
}
