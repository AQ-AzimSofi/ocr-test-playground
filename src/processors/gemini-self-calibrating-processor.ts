import { cloudVisionClient } from '../lib/cloud-vision-client.js';
import { geminiClient } from '../lib/gemini-client.js';
import { db, extractionResults } from '../db/index.js';
import { executeSelfCalibratingWorkflow } from '../mastra/workflows/gemini-self-calibrating-workflow.js';
import type { BoundingBox } from '../types/processor-types.js';
import sharp from 'sharp';

/**
 * Gemini Self-Calibrating Processor
 *
 * Advanced hybrid processor that combines:
 * - Cloud Vision: Precise pixel-perfect coordinates (ground truth)
 * - Gemini: Superior text detection (finds texts Cloud Vision misses)
 *
 * INTELLIGENT WORKFLOW:
 * 1. Run both OCR systems in parallel
 * 2. AI-powered text matching (finds corresponding texts)
 * 3. Self-calibration (learns Gemini's systematic coordinate offset)
 * 4. Spatial reasoning (uses Cloud Vision coords as anchors to calibrate Gemini-only texts)
 * 5. Merge: Cloud Vision coords + ALL detected texts = Production-ready result
 *
 * KEY INNOVATION: This processor achieves production-accurate coordinates for ALL texts,
 * including those that only Gemini could detect. It does this by using Gemini's AI to
 * reason about spatial placement relative to Cloud Vision's accurate reference points.
 */

export async function processWithGeminiSelfCalibrating(
  imagePath: string,
  drawingId: string
) {
  console.log(`  Processing with Gemini Self-Calibrating Workflow...`);
  const startTime = Date.now();

  try {
    // Get image dimensions
    const metadata = await sharp(imagePath).metadata();
    const imageWidth = metadata.width || 0;
    const imageHeight = metadata.height || 0;

    console.log(`  Image size: ${imageWidth}x${imageHeight}px`);

    // Step 1: Run both OCR systems in parallel
    console.log(`  Step 1: Running Gemini + Cloud Vision in parallel...`);
    const [geminiResults, cloudVisionResults] = await Promise.all([
      extractGeminiCoordinates(imagePath),
      cloudVisionClient.extractTextWithBoundingBoxes(imagePath),
    ]);

    console.log(`  Gemini detected: ${geminiResults.length} texts`);
    console.log(`  Cloud Vision detected: ${cloudVisionResults.length} texts`);

    // Step 2: Execute self-calibrating workflow
    console.log(`  Step 2: Executing self-calibrating workflow...`);
    const workflowResult = await executeSelfCalibratingWorkflow({
      geminiResults,
      cloudVisionResults,
      imagePath,
      imageWidth,
      imageHeight,
    });

    const endTime = Date.now();
    const processingTime = endTime - startTime;

    // Log workflow summary
    console.log(`\n  Workflow Summary:`);
    workflowResult.metadata.processing_notes.forEach((note) =>
      console.log(`    ${note}`)
    );
    console.log(`  Total processing time: ${processingTime}ms\n`);

    // Calculate costs (approximate)
    const geminiCost = estimateGeminiCost(
      geminiResults.length,
      workflowResult.metadata.gemini_only_count
    );
    const cloudVisionCost = estimateCloudVisionCost(cloudVisionResults.length);
    const totalCost = geminiCost + cloudVisionCost;

    // Prepare result data
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

    // Save to database
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
    console.error(
      `  ERROR in Gemini Self-Calibrating Processor: ${error instanceof Error ? error.message : error}`
    );
    throw error;
  }
}

/**
 * Extract texts with coordinates from Gemini
 * This uses the gemini-coordinates approach (percentage-based)
 */
async function extractGeminiCoordinates(imagePath: string): Promise<BoundingBox[]> {
  const metadata = await sharp(imagePath).metadata();
  const imageWidth = metadata.width || 0;
  const imageHeight = metadata.height || 0;

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

  const geminiResponse = await geminiClient.extractWithCustomPrompt(
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
function estimateGeminiCost(
  totalTexts: number,
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
 * Estimate Cloud Vision API cost
 * Approximately 0.15 yen per request
 */
function estimateCloudVisionCost(textCount: number): number {
  return 0.15;
}
