import type { BoundingBox } from '../../types/processor-types.js';
import {
  matchTexts,
  fallbackTextMatching,
  verifyTextOCRBatch,
  type TextVerificationInput,
} from '../agents/text-matcher-agent.js';
import {
  calculatePreciseCoordinates,
  calculatePreciseCoordinatesForBatch,
  type BatchTextInput,
} from '../agents/spatial-coordinator-agent.js';
import {
  calculateCalibrationOffset,
  type CalibrationOffset,
} from '../tools/coordinate-calculator-tool.js';

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

  processingNotes.push('Step 1: Matching Gemini texts to Cloud Vision bboxes...');

  let matchingResult;
  try {
    matchingResult = await matchTexts(geminiResults, cloudVisionResults);
    processingNotes.push(
      `Matched ${matchingResult.matched_pairs.length}/${geminiResults.length} texts (avg confidence: ${(matchingResult.matching_stats.avg_match_confidence * 100).toFixed(1)}%)`
    );
  } catch (error) {
    console.warn('Text matching failed, using fallback algorithm:', error);
    matchingResult = fallbackTextMatching(geminiResults, cloudVisionResults);
    processingNotes.push('Used fallback matching algorithm');
  }

  const matchedPairs = matchingResult.matched_pairs.map((match) => ({
    gemini: geminiResults[match.gemini_index],
    cloudVision: cloudVisionResults[match.cloud_vision_index],
  }));

  processingNotes.push('Step 2: Calculating calibration offset from matched pairs...');
  const calibration = calculateCalibrationOffset(matchedPairs);
  processingNotes.push(
    `Learned calibration: top offset=${calibration.topOffset.toFixed(1)}px, left offset=${calibration.leftOffset.toFixed(1)}px (confidence: ${(calibration.confidence * 100).toFixed(0)}%)`
  );

  const finalBoundingBoxes: BoundingBox[] = [];

  processingNotes.push('Step 3: Processing matched texts...');
  for (const match of matchingResult.matched_pairs) {
    const cvBBox = cloudVisionResults[match.cloud_vision_index];
    const geminiBBox = geminiResults[match.gemini_index];

    const finalText =
      match.match_confidence > 0.8 ? geminiBBox.text : cvBBox.text;

    finalBoundingBoxes.push({
      text: finalText,
      bounds: cvBBox.bounds,
      confidence: cvBBox.confidence,
      metadata: {
        source: 'cloud-vision-coords',
        textSource: match.match_confidence > 0.8 ? 'gemini' : 'cloud-vision',
        matchConfidence: match.match_confidence,
      },
    });
  }

  processingNotes.push(
    `Processed ${matchingResult.matched_pairs.length} matched texts`
  );

  const unmatchedCount = matchingResult.unmatched_gemini_texts.length;
  if (unmatchedCount > 0) {
    processingNotes.push(
      `Step 4: Processing ${unmatchedCount} Gemini-only texts using spatial reasoning (BATCH MODE)...`
    );

    const batchInput: BatchTextInput[] =
      matchingResult.unmatched_gemini_texts.map((unmatchedText) => {
        const geminiBBox = geminiResults[unmatchedText.gemini_index];
        const geminiX = geminiBBox.bounds[0].x;
        const geminiY = geminiBBox.bounds[0].y;
        const geminiWidth = geminiBBox.bounds[1].x - geminiBBox.bounds[0].x;
        const geminiHeight = geminiBBox.bounds[2].y - geminiBBox.bounds[0].y;

        return {
          text: unmatchedText.text,
          gemini_index: unmatchedText.gemini_index,
          approximate_x: geminiX,
          approximate_y: geminiY,
          approximate_width: geminiWidth,
          approximate_height: geminiHeight,
        };
      });

    try {
      const batchResults = await calculatePreciseCoordinatesForBatch(
        imagePath,
        batchInput,
        cloudVisionResults,
        calibration,
        imageWidth,
        imageHeight
      );

      for (const calibratedCoords of batchResults) {
        finalBoundingBoxes.push({
          text: calibratedCoords.text,
          bounds: [
            { x: calibratedCoords.x, y: calibratedCoords.y },
            {
              x: calibratedCoords.x + calibratedCoords.width,
              y: calibratedCoords.y,
            },
            {
              x: calibratedCoords.x + calibratedCoords.width,
              y: calibratedCoords.y + calibratedCoords.height,
            },
            {
              x: calibratedCoords.x,
              y: calibratedCoords.y + calibratedCoords.height,
            },
          ],
          confidence: calibratedCoords.confidence,
          metadata: {
            source: 'gemini-calibrated-batch',
            calibrationMethod: calibratedCoords.method,
            nearestReference: calibratedCoords.nearest_reference,
            reasoning: calibratedCoords.reasoning,
          },
        });

        processingNotes.push(
          `  Calibrated "${calibratedCoords.text}" (confidence: ${(calibratedCoords.confidence * 100).toFixed(0)}%)`
        );
      }

      processingNotes.push(
        `  Batch processed ${batchResults.length} texts in single API call`
      );
    } catch (error) {
      console.warn('Batch processing failed, falling back to individual processing:', error);
      processingNotes.push('  Batch mode failed, using individual processing...');

      for (const unmatchedText of matchingResult.unmatched_gemini_texts) {
        const geminiBBox = geminiResults[unmatchedText.gemini_index];

        const geminiX = geminiBBox.bounds[0].x;
        const geminiY = geminiBBox.bounds[0].y;
        const geminiWidth = geminiBBox.bounds[1].x - geminiBBox.bounds[0].x;
        const geminiHeight = geminiBBox.bounds[2].y - geminiBBox.bounds[0].y;

        try {
          const calibratedCoords = await calculatePreciseCoordinates(
            imagePath,
            unmatchedText.text,
            geminiX,
            geminiY,
            geminiWidth,
            geminiHeight,
            cloudVisionResults,
            calibration,
            imageWidth,
            imageHeight
          );

          finalBoundingBoxes.push({
            text: unmatchedText.text,
            bounds: [
              { x: calibratedCoords.x, y: calibratedCoords.y },
              {
                x: calibratedCoords.x + calibratedCoords.width,
                y: calibratedCoords.y,
              },
              {
                x: calibratedCoords.x + calibratedCoords.width,
                y: calibratedCoords.y + calibratedCoords.height,
              },
              {
                x: calibratedCoords.x,
                y: calibratedCoords.y + calibratedCoords.height,
              },
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
            `  Calibrated "${unmatchedText.text}" (confidence: ${(calibratedCoords.confidence * 100).toFixed(0)}%)`
          );
        } catch (error) {
          console.warn(
            `Failed to calibrate coordinates for "${unmatchedText.text}":`,
            error
          );

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
            `  Used fallback calibration for "${unmatchedText.text}"`
          );
        }
      }
    }
  }

  const CONFIDENCE_THRESHOLD = 0.85;
  const lowConfidenceTexts = finalBoundingBoxes
    .map((bbox, index) => ({ bbox, index }))
    .filter(({ bbox }) => bbox.confidence < CONFIDENCE_THRESHOLD);

  if (lowConfidenceTexts.length > 0) {
    processingNotes.push(
      `Step 5: Verifying ${lowConfidenceTexts.length} low-confidence texts (<${(CONFIDENCE_THRESHOLD * 100).toFixed(0)}%) with Gemini Vision...`
    );

    const verificationInput: TextVerificationInput[] = lowConfidenceTexts.map(
      ({ bbox, index }) => ({
        original_text: bbox.text,
        bbox_index: index,
        x: bbox.bounds[0].x,
        y: bbox.bounds[0].y,
        width: bbox.bounds[1].x - bbox.bounds[0].x,
        height: bbox.bounds[2].y - bbox.bounds[0].y,
        confidence: bbox.confidence,
      })
    );

    try {
      const verificationResults = await verifyTextOCRBatch(
        imagePath,
        verificationInput,
        imageWidth,
        imageHeight
      );

      let confirmedCount = 0;
      let correctedCount = 0;

      for (const verification of verificationResults) {
        const bboxIndex = verification.bbox_index;
        const originalText = finalBoundingBoxes[bboxIndex].text;
        const verifiedText = verification.verified_text;

        finalBoundingBoxes[bboxIndex].text = verifiedText;
        finalBoundingBoxes[bboxIndex].confidence = verification.confidence;

        if (finalBoundingBoxes[bboxIndex].metadata) {
          finalBoundingBoxes[bboxIndex].metadata = {
            ...finalBoundingBoxes[bboxIndex].metadata,
            verified: true,
            verificationReasoning: verification.reasoning,
          };
        }

        if (verification.changed) {
          correctedCount++;
          processingNotes.push(
            `  Corrected "${originalText}" → "${verifiedText}" (confidence: ${(verification.confidence * 100).toFixed(0)}%)`
          );
        } else {
          confirmedCount++;
          processingNotes.push(
            `  Confirmed "${verifiedText}" (confidence: ${(verification.confidence * 100).toFixed(0)}%)`
          );
        }
      }

      processingNotes.push(
        `  Batch verified ${verificationResults.length} texts: ${confirmedCount} confirmed, ${correctedCount} corrected`
      );
    } catch (error) {
      console.warn('Batch verification failed:', error);
      processingNotes.push('  Verification failed, keeping original texts');
    }
  }

  processingNotes.push(
    `Workflow complete: ${finalBoundingBoxes.length} total bounding boxes`
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
