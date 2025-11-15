import { DocumentAIProcessor } from './document-ai-processor';
import { GeminiTextProcessor } from './gemini-text-processor';
import sharp from 'sharp';
import { parseGeminiValidation } from '../utils/gemini-parser';
import {
  synthesizeBboxForText,
  descriptionToApproximatePosition,
  type BoundingBox,
  fuzzyMatchTextToBbox,
} from '../utils/bbox-estimator';
import { cropImageRegion, type CropRegion } from '../utils/image-cropper';
import type { ProcessorResult } from './types';
import { QueueConfig } from '../utils/gemini-queue';

const isDevelopment = process.env.NODE_ENV !== 'production';

/**
 * Document AI + Gemini Hybrid Processor (Validation-Based)
 *
 * Uses Document AI for baseline word-level extraction, then asks Gemini to validate
 * results and identify missing text. Synthesizes bounding boxes for additional text
 * found by Gemini and merges results.
 */

export interface DocumentAIGeminiHybridResult extends ProcessorResult {
  metadata: ProcessorResult['metadata'] & {
    strategy: string;
    docAIWordCount: number;
    geminiValidationIssues: number;
    missingTextCount: number;
    incorrectTextCount: number;
    synthesizedBboxCount: number;
    additionalGeminiCalls: number;
    documentAICost: number;
    geminiCost: number;
    costSavings: string;
  };
}

export class DocumentAIGeminiHybridProcessor {
  private documentAI: DocumentAIProcessor;
  private gemini: GeminiTextProcessor;

  constructor(
    documentAIProjectId: string,
    documentAICredentials: string,
    documentAIProcessorId: string,
    documentAILocation: string,
    geminiApiKey: string,
    queueConfig?: Partial<QueueConfig>
  ) {
    this.documentAI = new DocumentAIProcessor(
      documentAIProjectId,
      documentAICredentials,
      documentAIProcessorId,
      documentAILocation
    );
    this.gemini = new GeminiTextProcessor(geminiApiKey, 'gemini-2.5-flash', queueConfig);
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
   * Process an image with hybrid Document AI + Gemini approach
   */
  async processImage(
    imagePath: string,
    pageNumber: number = 1
  ): Promise<DocumentAIGeminiHybridResult> {
    if (isDevelopment) console.log(
      `  Processing with Document AI + Gemini Hybrid (Validation)...`
    );
    const startTime = Date.now();

    try {
      // Get image dimensions
      const metadata = await sharp(imagePath).metadata();
      const imageWidth = metadata.width || 1000;
      const imageHeight = metadata.height || 1000;

      if (isDevelopment) console.log(`  Running Document AI (baseline)...`);
      const docAIResult = await this.documentAI.process(imagePath);

      if (!docAIResult.success) {
        return {
          ...docAIResult,
          tool: 'document-ai-gemini-hybrid',
          metadata: {
            ...docAIResult.metadata,
            strategy: 'validation-based',
            docAIWordCount: 0,
            geminiValidationIssues: 0,
            missingTextCount: 0,
            incorrectTextCount: 0,
            synthesizedBboxCount: 0,
            additionalGeminiCalls: 0,
            documentAICost: 0,
            geminiCost: 0,
            costSavings: '0.00 yen',
          },
        } as DocumentAIGeminiHybridResult;
      }

      if (isDevelopment) console.log(
        `  Document AI extracted: ${docAIResult.rawText.length} chars, ${docAIResult.boundingBoxes.length} words`
      );

      // Convert Document AI bboxes to our format
      const docAIBboxes: BoundingBox[] = docAIResult.boundingBoxes.map((bbox) => ({
        bounds: bbox.bounds,
        text: bbox.text,
        confidence: bbox.confidence,
      }));

      if (isDevelopment) console.log(`  Asking Gemini to validate Document AI results...`);

      const validationPrompt = `You are a quality assurance system for OCR.

Compare the OCR text below with what you see in the image.
Identify any missing text or incorrect text.

OCR TEXT:
${docAIResult.rawText}

TASK:
1. List any text visible in the image that is MISSING from the OCR above
2. List any text that is INCORRECT in the OCR

FORMAT YOUR RESPONSE AS:

Missing Text:
- "text1" (location description: e.g. top-left corner)
- "text2" (location: center-right)

Incorrect Text:
- Found "wrong" but should be "correct" (location: bottom)

IMPORTANT:
- Only report text that is clearly visible in the image
- Provide location descriptions (top/bottom/left/right/center)
- Be concise and specific
- If everything is correct, say "No issues found"`;

      const validationResponse = await this.gemini.extractWithCustomPrompt(
        imagePath,
        validationPrompt
      );

      if (isDevelopment) console.log(
        `  Gemini validation response preview: ${validationResponse.substring(0, 300)}...`
      );

      const validation = parseGeminiValidation(validationResponse);

      if (isDevelopment) console.log(
        `  Gemini found: ${validation.missingText.length} missing, ${validation.incorrectText.length} incorrect`
      );

      // If no issues found, return Document AI results as-is
      if (
        validation.missingText.length === 0 &&
        validation.incorrectText.length === 0
      ) {
        if (isDevelopment) console.log(`  No issues found - using Document AI results as-is`);

        const processingTime = Date.now() - startTime;
        const docAICost = this.documentAI.estimateCost(1);
        const geminiCost = this.gemini.estimateCost(1); // One validation call
        const totalCost = docAICost + geminiCost;

        if (isDevelopment) console.log(
          `  Document AI + Gemini completed in ${(processingTime / 1000).toFixed(2)}s`
        );
        if (isDevelopment) console.log(`     No issues found - Document AI results validated`);
        if (isDevelopment) console.log(
          `     Cost: DocAI=${docAICost.toFixed(2)} yen + Gemini=${geminiCost.toFixed(2)} yen = ${totalCost.toFixed(2)} yen`
        );

        // Get rate limit wait time from queue stats
        const queueStats = this.gemini.getQueueStats();
        const rateLimitWaitTime = queueStats.rateLimitWaitTime || 0;

        return {
          success: true,
          tool: 'document-ai-gemini-hybrid',
          rawText: docAIResult.rawText,
          boundingBoxes: docAIResult.boundingBoxes.map((bbox) => ({
            ...bbox,
            metadata: { source: 'document-ai', validated: true },
          })),
          confidence: docAIResult.confidence,
          processingTime,
          cost: totalCost,
          rateLimitWaitTime,
          metadata: {
            pageCount: 1,
            avgConfidence: docAIResult.confidence,
            granularity: 'word',
            strategy: 'validation-based',
            docAIWordCount: docAIResult.boundingBoxes.length,
            geminiValidationIssues: 0,
            missingTextCount: 0,
            incorrectTextCount: 0,
            synthesizedBboxCount: 0,
            additionalGeminiCalls: 0,
            documentAICost: docAICost,
            geminiCost: geminiCost,
            costSavings: `Validated ${docAIResult.boundingBoxes.length} words with no corrections needed`,
          },
        };
      }

      const synthesizedBboxes: Array<{
        text: string;
        bounds: Array<{ x: number; y: number }>;
        confidence: number;
        page: number;
        metadata?: any;
      }> = [];

      let additionalGeminiCalls = 0;

      for (const missing of validation.missingText) {
        if (isDevelopment) console.log(`  Processing missing text: "${missing.text}"`);

        let estimatedPosition = undefined;
        if (missing.locationDescription) {
          estimatedPosition = descriptionToApproximatePosition(
            missing.locationDescription,
            imageWidth,
            imageHeight
          );
        }

        if (estimatedPosition) {
          if (isDevelopment) console.log(
            `  Estimated position from description: (${estimatedPosition.x.toFixed(0)}, ${estimatedPosition.y.toFixed(0)})`
          );

          const cropSize = 200;
          const cropRegion: CropRegion = {
            bounds: [
              {
                x: Math.max(0, estimatedPosition.x - cropSize / 2),
                y: Math.max(0, estimatedPosition.y - cropSize / 2),
              },
              {
                x: Math.min(imageWidth, estimatedPosition.x + cropSize / 2),
                y: Math.max(0, estimatedPosition.y - cropSize / 2),
              },
              {
                x: Math.min(imageWidth, estimatedPosition.x + cropSize / 2),
                y: Math.min(imageHeight, estimatedPosition.y + cropSize / 2),
              },
              {
                x: Math.max(0, estimatedPosition.x - cropSize / 2),
                y: Math.min(imageHeight, estimatedPosition.y + cropSize / 2),
              },
            ],
            text: '',
            confidence: 0,
            index: synthesizedBboxes.length,
            page: pageNumber,
          };

          try {
            const cropped = await cropImageRegion(imagePath, cropRegion, 20);
            const geminiResult = await this.gemini.extractTextFromRegion(
              cropped.base64
            );

            additionalGeminiCalls++;

            // Synthesize bbox for the found text
            const synthesizedBbox = synthesizeBboxForText(
              geminiResult.text,
              docAIBboxes,
              estimatedPosition,
              imageWidth,
              imageHeight
            );

            synthesizedBboxes.push({
              text: geminiResult.text,
              bounds: synthesizedBbox.bounds,
              confidence: 0.7,
              page: pageNumber,
              metadata: {
                fromValidation: true,
                locationDescription: missing.locationDescription,
                estimatedPosition,
                geminiExtracted: true,
                source: 'gemini',
              },
            });

            if (isDevelopment) console.log(
              `  Extracted missing text from region: "${geminiResult.text.substring(0, 50)}..."`
            );
          } catch (error) {
            console.warn(`  Failed to extract missing text region:`, error);
            const fallbackBbox = synthesizeBboxForText(
              missing.text,
              docAIBboxes,
              estimatedPosition,
              imageWidth,
              imageHeight
            );

            synthesizedBboxes.push({
              text: missing.text,
              bounds: fallbackBbox.bounds,
              confidence: 0.5,
              page: pageNumber,
              metadata: {
                fromValidation: true,
                locationDescription: missing.locationDescription,
                estimatedPosition,
                croppingFailed: true,
                source: 'synthesized',
              },
            });
          }
        } else {
          if (isDevelopment) console.log(`  No location description, using context-based synthesis`);

          const synthesizedBbox = synthesizeBboxForText(
            missing.text,
            docAIBboxes,
            undefined,
            imageWidth,
            imageHeight
          );

          synthesizedBboxes.push({
            text: missing.text,
            bounds: synthesizedBbox.bounds,
            confidence: 0.4,
            page: pageNumber,
            metadata: {
              fromValidation: true,
              noLocationDescription: true,
              source: 'synthesized',
            },
          });
        }
      }

      for (const incorrect of validation.incorrectText) {
        if (isDevelopment) console.log(
          `  Correcting: "${incorrect.found}" -> "${incorrect.shouldBe}"`
        );

        const match = fuzzyMatchTextToBbox(incorrect.found, docAIBboxes, 0.5);

        if (match) {
          synthesizedBboxes.push({
            text: incorrect.shouldBe,
            bounds: match.bbox.bounds,
            confidence: 0.8,
            page: pageNumber,
            metadata: {
              corrected: true,
              originalText: incorrect.found,
              geminiCorrected: true,
              source: 'gemini',
            },
          });
        } else {
          console.warn(
            `  Could not find bbox for incorrect text: "${incorrect.found}"`
          );
        }
      }

      const allBboxes = [
        ...docAIResult.boundingBoxes.map((bbox) => ({
          ...bbox,
          metadata: { source: 'document-ai', validated: true },
        })),
        ...synthesizedBboxes,
      ];

      const finalText =
        docAIResult.rawText +
        '\n' +
        synthesizedBboxes.map((b) => b.text).join('\n');

      const processingTime = Date.now() - startTime;
      const docAICost = this.documentAI.estimateCost(1);
      const geminiCost = this.gemini.estimateCost(1 + additionalGeminiCalls, false);
      const totalCost = docAICost + geminiCost;

      if (isDevelopment) {
        console.log(`  Document AI + Gemini completed in ${(processingTime / 1000).toFixed(2)}s`);
        console.log(`     Fixed ${validation.missingText.length} missing + ${validation.incorrectText.length} incorrect`);
        console.log(`     Total bboxes: ${allBboxes.length} (${docAIResult.boundingBoxes.length} Document AI + ${synthesizedBboxes.length} synthesized)`);
        console.log(`     Cost: DocAI=${docAICost.toFixed(2)} yen + Gemini=${geminiCost.toFixed(2)} yen = ${totalCost.toFixed(2)} yen`);
      }

      const queueStats = this.gemini.getQueueStats();
      const rateLimitWaitTime = queueStats.rateLimitWaitTime || 0;

      return {
        success: true,
        tool: 'document-ai-gemini-hybrid',
        rawText: finalText,
        boundingBoxes: allBboxes,
        confidence: docAIResult.confidence,
        processingTime,
        cost: totalCost,
        rateLimitWaitTime,
        metadata: {
          pageCount: 1,
          avgConfidence: docAIResult.confidence,
          granularity: 'word',
          strategy: 'validation-based',
          docAIWordCount: docAIResult.boundingBoxes.length,
          geminiValidationIssues:
            validation.missingText.length + validation.incorrectText.length,
          missingTextCount: validation.missingText.length,
          incorrectTextCount: validation.incorrectText.length,
          synthesizedBboxCount: synthesizedBboxes.length,
          additionalGeminiCalls,
          documentAICost: docAICost,
          geminiCost: geminiCost,
          costSavings: `Found ${synthesizedBboxes.length} additional text elements`,
        },
      };
    } catch (error) {
      return {
        success: false,
        tool: 'document-ai-gemini-hybrid',
        rawText: '',
        boundingBoxes: [],
        confidence: 0,
        processingTime: Date.now() - startTime,
        cost: 0,
        metadata: {
          pageCount: 1,
          avgConfidence: 0,
          granularity: 'word',
          strategy: 'validation-based',
          docAIWordCount: 0,
          geminiValidationIssues: 0,
          missingTextCount: 0,
          incorrectTextCount: 0,
          synthesizedBboxCount: 0,
          additionalGeminiCalls: 0,
          documentAICost: 0,
          geminiCost: 0,
          costSavings: '0.00 yen',
        },
        error: error instanceof Error ? error.message : String(error),
      };
    }
  }
}
