// External imports
import sharp from 'sharp';

// Internal imports
import { cloudVisionClient } from '../lib/cloud-vision-client.js';
import { geminiClient } from '../lib/gemini-client.js';
import { db, extractionResults } from '../db/index.js';
import { executeSelfCalibratingWorkflow } from '../mastra/workflows/gemini-self-calibrating-workflow.js';

// Type imports
import type { BoundingBox } from '../types/processor-types.js';

const isDevelopment = process.env.NODE_ENV !== 'production';

/**
 * Gemini Self-Calibrating Processor
 *
 * Combines Cloud Vision's precise coordinates with Gemini's superior text detection.
 * Runs both systems in parallel, matches corresponding texts, learns Gemini's coordinate
 * offset, and uses that calibration to position Gemini-only texts relative to Cloud Vision
 * coordinates for production-ready results.
 */

export async function processWithGeminiSelfCalibrating(
  imagePath: string,
  drawingId: string
) {
  if (isDevelopment) console.log(`  Processing with Gemini Self-Calibrating Workflow...`);
  const startTime = Date.now();

  try {
    // Get image dimensions
    const metadata = await sharp(imagePath).metadata();
    const imageWidth = metadata.width || 0;
    const imageHeight = metadata.height || 0;

    if (isDevelopment) console.log(`  Image size: ${imageWidth}x${imageHeight}px`);

    if (isDevelopment) console.log(`  Running Gemini + Cloud Vision in parallel...`);
    const [geminiResults, cloudVisionResults] = await Promise.all([
      extractGeminiCoordinates(imagePath),
      cloudVisionClient.extractTextWithBoundingBoxes(imagePath),
    ]);

    if (isDevelopment) {
      console.log(`  Gemini detected: ${geminiResults.length} texts`);
      console.log(`  Cloud Vision detected: ${cloudVisionResults.length} texts`);
    }

    if (isDevelopment) console.log(`  Executing self-calibrating workflow...`);
    const workflowResult = await executeSelfCalibratingWorkflow({
      geminiResults,
      cloudVisionResults,
      imagePath,
      imageWidth,
      imageHeight,
    });

    const endTime = Date.now();
    const processingTime = endTime - startTime;

    if (isDevelopment) {
      console.log(`\n  Workflow Summary:`);
      workflowResult.metadata.processing_notes.forEach((note) =>
        console.log(`    ${note}`)
      );
      console.log(`  Total processing time: ${processingTime}ms\n`);
    }
    const geminiCost = estimateGeminiCost(
      geminiResults.length,
      workflowResult.metadata.gemini_only_count
    );
    const cloudVisionCost = estimateCloudVisionCost(cloudVisionResults.length);
    const totalCost = geminiCost + cloudVisionCost;

    const finalText = workflowResult.boundingBoxes.map((b) => b.text).join('\n');

    const result = {
      tool: 'gemini-self-calibrating',
      text: finalText,
      boundingBoxes: workflowResult.boundingBoxes,
      processingTime,
      apiCost: totalCost,
      metadata: {
        workflow_metadata: workflowResult.metadata,
        gemini_cost: geminiCost,
        cloud_vision_cost: cloudVisionCost,
        calibration: {
          topOffset: workflowResult.metadata.calibration.topOffset,
          leftOffset: workflowResult.metadata.calibration.leftOffset,
          widthScale: workflowResult.metadata.calibration.widthScale,
          heightScale: workflowResult.metadata.calibration.heightScale,
          confidence: workflowResult.metadata.calibration.confidence,
          sampleCount: workflowResult.metadata.calibration.sampleCount,
        },
      },
    };

    await db.insert(extractionResults).values({
      drawingId,
      tool: 'gemini-self-calibrating',
      rawText: result.text,
      boundingBoxes: result.boundingBoxes,
      processingTimeMs: result.processingTime,
      apiCost: result.apiCost,
      metadata: result.metadata,
      createdAt: new Date(),
    });

    return result;
  } catch (error) {
    if (isDevelopment) {
      console.error(
        `  ERROR in Gemini Self-Calibrating Processor: ${error instanceof Error ? error.message : error}`
      );
    }
    throw error;
  }
}

/**
 * Extract texts with coordinates from Gemini (percentage-based approach)
 */
async function extractGeminiCoordinates(imagePath: string): Promise<BoundingBox[]> {
  const metadata = await sharp(imagePath).metadata();
  const imageWidth = metadata.width || 0;
  const imageHeight = metadata.height || 0;

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

  const geminiResponse = await geminiClient.extractWithCustomPrompt(
    imagePath,
    prompt
  );

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

    const x = (left / 100) * imageWidth;
    const y = (top / 100) * imageHeight;
    const w = (width / 100) * imageWidth;
    const h = (height / 100) * imageHeight;

    boundingBoxes.push({
      text: text.trim(),
      bounds: [
        { x, y },
        { x: x + w, y },
        { x: x + w, y: y + h },
        { x, y: y + h },
      ],
      confidence: 0.7,
      metadata: {
        source: 'gemini-percentages',
        originalPercentages: { top, left, width, height },
      },
    });
  }

  return boundingBoxes;
}

/**
 * Estimate Gemini API cost including extraction, matching, and spatial reasoning
 */
function estimateGeminiCost(
  totalTexts: number,
  unmatchedCount: number
): number {
  const extractionCost = 0.05;
  const matchingCost = 0.01;
  const spatialReasoningCost = unmatchedCount * 0.02;

  return extractionCost + matchingCost + spatialReasoningCost;
}

/**
 * Estimate Cloud Vision API cost (approximately 0.15 yen per request)
 */
function estimateCloudVisionCost(textCount: number): number {
  return 0.15;
}
