// External imports
import sharp from 'sharp';

// Internal imports
import { CloudVisionProcessor, type CloudVisionCredentials } from './cloud-vision-processor';
import { GeminiTextProcessor } from './gemini-text-processor';
import { executeSelfCalibratingWorkflow } from '../workflows/gemini-self-calibrating-workflow';

// Type imports
import type { ProcessorResult, BoundingBox } from './types';

const isDevelopment = process.env.NODE_ENV !== 'production';

/**
 * Hybrid processor combining Cloud Vision (accurate coordinates) with Gemini (comprehensive text detection).
 * Uses self-calibration to correct Gemini's coordinate offsets based on Cloud Vision ground truth.
 */

export interface GeminiSelfCalibratingResult extends ProcessorResult {
  metadata: ProcessorResult['metadata'] & {
    strategy: string;
    workflow_metadata: {
      total_texts: number;
      cloud_vision_count: number;
      gemini_only_count: number;
      matched_count: number;
      calibration: {
        topOffset: number;
        leftOffset: number;
        widthScale: number;
        heightScale: number;
        confidence: number;
        sampleCount: number;
      };
      matching_confidence: number;
      processing_notes: string[];
    };
    geminiCost: number;
    cloudVisionCost: number;
  };
}

export class GeminiSelfCalibratingProcessor {
  private cloudVision: CloudVisionProcessor;
  private gemini: GeminiTextProcessor;
  private geminiApiKey: string;

  constructor(
    cloudVisionCredentials: CloudVisionCredentials,
    geminiApiKey: string
  ) {
    this.cloudVision = new CloudVisionProcessor(cloudVisionCredentials);
    this.gemini = new GeminiTextProcessor(geminiApiKey);
    this.geminiApiKey = geminiApiKey;
  }

  /**
   * Process an image with the self-calibrating workflow
   */
  async processImage(
    imagePath: string,
    pageNumber: number = 1
  ): Promise<GeminiSelfCalibratingResult> {
    if (isDevelopment) console.log(`  Processing with Gemini Self-Calibrating Workflow...`);
    const startTime = Date.now();

    try {
      // Get image dimensions
      const metadata = await sharp(imagePath).metadata();
      const imageWidth = metadata.width || 0;
      const imageHeight = metadata.height || 0;

      if (isDevelopment) console.log(`  Image size: ${imageWidth}x${imageHeight}px`);

      // Step 1: Run both OCR systems in parallel
      if (isDevelopment) console.log(`  Step 1: Running Gemini + Cloud Vision in parallel...`);
      const [geminiResults, cloudVisionResult] = await Promise.all([
        this.extractGeminiCoordinates(imagePath, imageWidth, imageHeight),
        this.cloudVision.processImage(imagePath, pageNumber),
      ]);

      if (!cloudVisionResult.success) {
        return {
          ...cloudVisionResult,
          tool: 'gemini-self-calibrating',
          metadata: {
            ...cloudVisionResult.metadata,
            strategy: 'self-calibrating',
            workflow_metadata: {
              total_texts: 0,
              cloud_vision_count: 0,
              gemini_only_count: 0,
              matched_count: 0,
              calibration: {
                topOffset: 0,
                leftOffset: 0,
                widthScale: 1,
                heightScale: 1,
                confidence: 0,
                sampleCount: 0,
              },
              matching_confidence: 0,
              processing_notes: ['Cloud Vision failed'],
            },
            geminiCost: 0,
            cloudVisionCost: 0,
          },
        } as GeminiSelfCalibratingResult;
      }

      const cloudVisionResults = cloudVisionResult.boundingBoxes.map((bbox) => ({
        text: bbox.text,
        bounds: bbox.bounds,
        confidence: bbox.confidence,
        page: bbox.page,
      }));

      if (isDevelopment) console.log(`  Gemini detected: ${geminiResults.length} texts`);
      if (isDevelopment) console.log(`  Cloud Vision detected: ${cloudVisionResults.length} texts`);

      // Step 2: Execute self-calibrating workflow
      if (isDevelopment) console.log(`  Step 2: Executing self-calibrating workflow...`);
      const workflowResult = await executeSelfCalibratingWorkflow({
        geminiResults,
        cloudVisionResults,
        imagePath,
        imageWidth,
        imageHeight,
        geminiApiKey: this.geminiApiKey,
      });

      const processingTime = Date.now() - startTime;

      // Log workflow summary
      if (isDevelopment) console.log(`\n  Workflow Summary:`);
      if (isDevelopment) workflowResult.metadata.processing_notes.forEach((note) =>
        console.log(`    ${note}`)
      );
      if (isDevelopment) console.log(`  Total processing time: ${processingTime}ms\n`);

      // Calculate costs
      const geminiCost = this.estimateGeminiCost(
        geminiResults.length,
        workflowResult.metadata.gemini_only_count
      );
      const cloudVisionCost = this.cloudVision.estimateCost(1);
      const totalCost = geminiCost + cloudVisionCost;

      // Prepare final result
      const finalText = workflowResult.boundingBoxes.map((b) => b.text).join('\n');

      const avgConfidence =
        workflowResult.boundingBoxes.length > 0
          ? workflowResult.boundingBoxes.reduce((sum, b) => sum + b.confidence, 0) /
            workflowResult.boundingBoxes.length
          : 0;

      // Get rate limit wait time from queue stats
      const queueStats = this.gemini.getQueueStats();
      const rateLimitWaitTime = queueStats.rateLimitWaitTime || 0;

      return {
        success: true,
        tool: 'gemini-self-calibrating',
        rawText: finalText,
        boundingBoxes: workflowResult.boundingBoxes,
        confidence: avgConfidence,
        processingTime,
        cost: totalCost,
        rateLimitWaitTime,
        metadata: {
          pageCount: 1,
          avgConfidence,
          granularity: 'word',
          strategy: 'self-calibrating',
          workflow_metadata: workflowResult.metadata,
          geminiCost,
          cloudVisionCost,
        },
      };
    } catch (error) {
      return {
        success: false,
        tool: 'gemini-self-calibrating',
        rawText: '',
        boundingBoxes: [],
        confidence: 0,
        processingTime: Date.now() - startTime,
        cost: 0,
        metadata: {
          pageCount: 1,
          avgConfidence: 0,
          granularity: 'word',
          strategy: 'self-calibrating',
          workflow_metadata: {
            total_texts: 0,
            cloud_vision_count: 0,
            gemini_only_count: 0,
            matched_count: 0,
            calibration: {
              topOffset: 0,
              leftOffset: 0,
              widthScale: 1,
              heightScale: 1,
              confidence: 0,
              sampleCount: 0,
            },
            matching_confidence: 0,
            processing_notes: ['Error occurred'],
          },
          geminiCost: 0,
          cloudVisionCost: 0,
        },
        error: error instanceof Error ? error.message : String(error),
      };
    }
  }

  /**
   * Extract texts with coordinates from Gemini
   * Uses percentage-based coordinates
   */
  private async extractGeminiCoordinates(
    imagePath: string,
    imageWidth: number,
    imageHeight: number
  ): Promise<BoundingBox[]> {
    // Use Gemini to extract text with percentage coordinates
    const prompt = `Extract all visible text from this Japanese architectural floor plan drawing with position coordinates.

For each text element, provide the text and its approximate position as percentages of image dimensions.

FORMAT EACH LINE AS:
TEXT|top|left|width|height

Where:
- TEXT: The actual text you see (preserve Japanese characters)
- top: Percentage from top edge (0-100)
- left: Percentage from left edge (0-100)
- width: Width as percentage (0-100)
- height: Height as percentage (0-100)

Example:
ホール|35.5|42.0|8.5|3.2
1,820|10.2|50.0|6.0|2.5

IMPORTANT:
- Extract ALL visible text including dimensions, labels, and annotations
- Be precise with coordinates
- Include room names, dimensions, scale indicators, everything
- One line per text element`;

    const geminiResponse = await this.gemini.extractWithCustomPrompt(
      imagePath,
      prompt
    );

    // Parse Gemini response
    const lines = geminiResponse.split('\n').filter((line) => line.trim().length > 0);
    const boundingBoxes: BoundingBox[] = [];

    for (const line of lines) {
      const parts = line.split('|');
      if (parts.length !== 5) continue;

      const [text, topStr, leftStr, widthStr, heightStr] = parts;
      const top = parseFloat(topStr);
      const left = parseFloat(leftStr);
      const width = parseFloat(widthStr);
      const height = parseFloat(heightStr);

      // Skip invalid coordinates
      if (
        isNaN(top) ||
        isNaN(left) ||
        isNaN(width) ||
        isNaN(height) ||
        top < 0 ||
        top > 100 ||
        left < 0 ||
        left > 100
      ) {
        continue;
      }

      // Convert percentages to pixels
      const x = (left / 100) * imageWidth;
      const y = (top / 100) * imageHeight;
      const w = (width / 100) * imageWidth;
      const h = (height / 100) * imageHeight;

      boundingBoxes.push({
        text: text.trim(),
        bounds: [
          { x, y }, // top-left
          { x: x + w, y }, // top-right
          { x: x + w, y: y + h }, // bottom-right
          { x, y: y + h }, // bottom-left
        ],
        confidence: 0.7, // Medium confidence for Gemini percentages
        page: 1,
        metadata: {
          source: 'gemini-percentages',
          originalPercentages: { top, left, width, height },
        },
      });
    }

    return boundingBoxes;
  }

  /**
   * Estimate Gemini API cost
   * Based on usage:
   * - Initial coordinate extraction
   * - Matching (text only, cheap)
   * - Spatial reasoning for unmatched texts (with image)
   */
  private estimateGeminiCost(
    _totalTexts: number,
    unmatchedCount: number
  ): number {
    // Initial extraction: ~0.05 yen
    const extractionCost = 0.05;

    // Text matching: minimal cost (text only, no image)
    const matchingCost = 0.01;

    // Spatial reasoning: ~0.02 yen per unmatched text (includes image)
    const spatialReasoningCost = unmatchedCount * 0.02;

    return extractionCost + matchingCost + spatialReasoningCost;
  }

  /**
   * Clean up resources
   */
  cleanup() {
    this.cloudVision.cleanup();
  }
}
