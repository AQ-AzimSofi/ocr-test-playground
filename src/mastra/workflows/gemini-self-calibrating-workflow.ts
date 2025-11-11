import type { BoundingBox } from '../../types/processor-types.js';
import { matchTexts, fallbackTextMatching } from '../agents/text-matcher-agent.js';
import { calculatePreciseCoordinates } from '../agents/spatial-coordinator-agent.js';
import {
  calculateCalibrationOffset,
  type CalibrationOffset,
} from '../tools/coordinate-calculator-tool.js';

/**
 * Gemini Self-Calibrating Workflow
 *
 * Intelligent workflow that combines Cloud Vision's precise coordinates with
 * Gemini's superior text detection using AI-powered matching and spatial reasoning.
 *
 * Architecture:
 * 1. Parallel Extraction (Gemini + Cloud Vision)
 * 2. Text Matching (AI-powered)
 * 3. Self-Calibration (learn systematic offset)
 * 4. Coordinate Correction:
 *    - Matched texts → Use Cloud Vision coordinates (ground truth)
 *    - Unmatched Gemini texts → Use spatial reasoning with CV as anchors
 * 5. Merge Results
 */

export interface WorkflowInput {
  geminiResults: BoundingBox[];
  cloudVisionResults: BoundingBox[];
  imagePath: string;
  imageWidth: number;
  imageHeight: number;
}

export interface WorkflowOutput {
  boundingBoxes: BoundingBox[];
  metadata: {
    total_texts: number;
    cloud_vision_count: number;
    gemini_only_count: number;
    matched_count: number;
    calibration: CalibrationOffset;
    matching_confidence: number;
    processing_notes: string[];
  };
}

/**
 * Execute the self-calibrating workflow
 */
export async function executeSelfCalibratingWorkflow(
  input: WorkflowInput
): Promise<WorkflowOutput> {
  const {
    geminiResults,
    cloudVisionResults,
    imagePath,
    imageWidth,
    imageHeight,
  } = input;

  const processingNotes: string[] = [];

  // Step 1: Text Matching (AI-powered)
  processingNotes.push('Step 1: Matching Gemini texts to Cloud Vision bboxes...');

  let matchingResult;
  try {
    matchingResult = await matchTexts(geminiResults, cloudVisionResults);
    processingNotes.push(
      `✓ Matched ${matchingResult.matched_pairs.length}/${geminiResults.length} texts (avg confidence: ${(matchingResult.matching_stats.avg_match_confidence * 100).toFixed(1)}%)`
    );
  } catch (error) {
    console.warn('Text matching failed, using fallback algorithm:', error);
    matchingResult = fallbackTextMatching(geminiResults, cloudVisionResults);
    processingNotes.push('⚠ Used fallback matching algorithm');
  }

  // Step 2: Build matched pairs for calibration
  const matchedPairs = matchingResult.matched_pairs.map((match) => ({
    gemini: geminiResults[match.gemini_index],
    cloudVision: cloudVisionResults[match.cloud_vision_index],
  }));

  // Step 3: Calculate Calibration Offset
  processingNotes.push('Step 2: Calculating calibration offset from matched pairs...');
  const calibration = calculateCalibrationOffset(matchedPairs);
  processingNotes.push(
    `✓ Learned calibration: top offset=${calibration.topOffset.toFixed(1)}px, left offset=${calibration.leftOffset.toFixed(1)}px (confidence: ${(calibration.confidence * 100).toFixed(0)}%)`
  );

  // Step 4: Build final bounding boxes
  const finalBoundingBoxes: BoundingBox[] = [];

  // 4a: Add Cloud Vision bboxes with Gemini text (if better)
  processingNotes.push('Step 3: Processing matched texts...');
  for (const match of matchingResult.matched_pairs) {
    const cvBBox = cloudVisionResults[match.cloud_vision_index];
    const geminiBBox = geminiResults[match.gemini_index];

    // Use Cloud Vision coordinates (precise) but potentially Gemini text (if detected better)
    const finalText =
      match.match_confidence > 0.8 ? geminiBBox.text : cvBBox.text;

    finalBoundingBoxes.push({
      text: finalText,
      bounds: cvBBox.bounds, // ALWAYS use Cloud Vision coordinates for matched texts
      confidence: cvBBox.confidence,
      metadata: {
        source: 'cloud-vision-coords',
        textSource: match.match_confidence > 0.8 ? 'gemini' : 'cloud-vision',
        matchConfidence: match.match_confidence,
      },
    });
  }

  processingNotes.push(
    `✓ Processed ${matchingResult.matched_pairs.length} matched texts`
  );

  // 4b: Process unmatched Gemini texts (spatial reasoning)
  const unmatchedCount = matchingResult.unmatched_gemini_texts.length;
  if (unmatchedCount > 0) {
    processingNotes.push(
      `Step 4: Processing ${unmatchedCount} Gemini-only texts using spatial reasoning...`
    );

    for (const unmatchedText of matchingResult.unmatched_gemini_texts) {
      const geminiBBox = geminiResults[unmatchedText.gemini_index];

      // Extract approximate coordinates from Gemini bbox
      const geminiX = geminiBBox.bounds[0].x;
      const geminiY = geminiBBox.bounds[0].y;
      const geminiWidth = geminiBBox.bounds[1].x - geminiBBox.bounds[0].x;
      const geminiHeight = geminiBBox.bounds[2].y - geminiBBox.bounds[0].y;

      try {
        // Use spatial coordinator to get precise coordinates
        const calibratedCoords = await calculatePreciseCoordinates(
          imagePath,
          unmatchedText.text,
          geminiX,
          geminiY,
          geminiWidth,
          geminiHeight,
          cloudVisionResults, // Use as reference anchors
          calibration,
          imageWidth,
          imageHeight
        );

        // Build bbox with calibrated coordinates
        finalBoundingBoxes.push({
          text: unmatchedText.text,
          bounds: [
            { x: calibratedCoords.x, y: calibratedCoords.y },
            { x: calibratedCoords.x + calibratedCoords.width, y: calibratedCoords.y },
            {
              x: calibratedCoords.x + calibratedCoords.width,
              y: calibratedCoords.y + calibratedCoords.height,
            },
            { x: calibratedCoords.x, y: calibratedCoords.y + calibratedCoords.height },
          ],
          confidence: calibratedCoords.confidence,
          metadata: {
            source: 'gemini-calibrated',
            calibrationMethod: calibratedCoords.method,
            nearestReference: calibratedCoords.nearest_reference,
            reasoning: calibratedCoords.reasoning,
          },
        });

        processingNotes.push(
          `  ✓ Calibrated "${unmatchedText.text}" (confidence: ${(calibratedCoords.confidence * 100).toFixed(0)}%)`
        );
      } catch (error) {
        console.warn(
          `Failed to calibrate coordinates for "${unmatchedText.text}":`,
          error
        );

        // Fallback: Use Gemini coordinates with basic calibration offset
        const calibratedX = geminiX - calibration.leftOffset;
        const calibratedY = geminiY - calibration.topOffset;
        const calibratedWidth = geminiWidth * calibration.widthScale;
        const calibratedHeight = geminiHeight * calibration.heightScale;

        finalBoundingBoxes.push({
          text: unmatchedText.text,
          bounds: [
            { x: calibratedX, y: calibratedY },
            { x: calibratedX + calibratedWidth, y: calibratedY },
            {
              x: calibratedX + calibratedWidth,
              y: calibratedY + calibratedHeight,
            },
            { x: calibratedX, y: calibratedY + calibratedHeight },
          ],
          confidence: calibration.confidence * 0.6,
          metadata: {
            source: 'gemini-fallback-calibrated',
            calibrationMethod: 'basic-offset',
          },
        });

        processingNotes.push(
          `  ⚠ Used fallback calibration for "${unmatchedText.text}"`
        );
      }
    }
  }

  processingNotes.push(
    `✓ Workflow complete: ${finalBoundingBoxes.length} total bounding boxes`
  );

  return {
    boundingBoxes: finalBoundingBoxes,
    metadata: {
      total_texts: finalBoundingBoxes.length,
      cloud_vision_count: cloudVisionResults.length,
      gemini_only_count: unmatchedCount,
      matched_count: matchingResult.matched_pairs.length,
      calibration,
      matching_confidence: matchingResult.matching_stats.avg_match_confidence,
      processing_notes: processingNotes,
    },
  };
}
