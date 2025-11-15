import type { BoundingBox } from '../processors/types';

/**
 * Calibration offset learned from matched text pairs
 */
export interface CalibrationOffset {
  topOffset: number; // pixels
  leftOffset: number; // pixels
  widthScale: number; // ratio
  heightScale: number; // ratio
  sampleCount: number;
  confidence: number; // 0-1
}

/**
 * Reference bbox with accurate coordinates (from Cloud Vision)
 */
interface ReferenceBBox {
  text: string;
  x: number;
  y: number;
  width: number;
  height: number;
}

/**
 * Helper function to calculate calibration offset from matched pairs
 */
export function calculateCalibrationOffset(
  matchedPairs: Array<{
    gemini: BoundingBox;
    cloudVision: BoundingBox;
  }>
): CalibrationOffset {
  if (matchedPairs.length === 0) {
    return {
      topOffset: 0,
      leftOffset: 0,
      widthScale: 1.0,
      heightScale: 1.0,
      sampleCount: 0,
      confidence: 0,
    };
  }

  let sumTopOffset = 0;
  let sumLeftOffset = 0;
  let sumWidthScale = 0;
  let sumHeightScale = 0;

  for (const pair of matchedPairs) {
    // Extract coordinates from bounds array
    const geminiX = pair.gemini.bounds[0].x;
    const geminiY = pair.gemini.bounds[0].y;
    const geminiWidth = pair.gemini.bounds[1].x - pair.gemini.bounds[0].x;
    const geminiHeight = pair.gemini.bounds[2].y - pair.gemini.bounds[0].y;

    const cvX = pair.cloudVision.bounds[0].x;
    const cvY = pair.cloudVision.bounds[0].y;
    const cvWidth = pair.cloudVision.bounds[1].x - pair.cloudVision.bounds[0].x;
    const cvHeight = pair.cloudVision.bounds[2].y - pair.cloudVision.bounds[0].y;

    // Calculate offsets (Gemini - CloudVision)
    sumTopOffset += geminiY - cvY;
    sumLeftOffset += geminiX - cvX;

    // Calculate scale ratios (CloudVision / Gemini)
    if (geminiWidth > 0) sumWidthScale += cvWidth / geminiWidth;
    if (geminiHeight > 0) sumHeightScale += cvHeight / geminiHeight;
  }

  const count = matchedPairs.length;
  const avgTopOffset = sumTopOffset / count;
  const avgLeftOffset = sumLeftOffset / count;
  const avgWidthScale = sumWidthScale / count;
  const avgHeightScale = sumHeightScale / count;

  // Calculate confidence based on consistency of offsets
  let varianceSum = 0;
  for (const pair of matchedPairs) {
    const geminiY = pair.gemini.bounds[0].y;
    const cvY = pair.cloudVision.bounds[0].y;
    const offset = geminiY - cvY;
    varianceSum += Math.pow(offset - avgTopOffset, 2);
  }
  const variance = varianceSum / count;
  const stdDev = Math.sqrt(variance);

  // Lower standard deviation = higher confidence
  // If stdDev < 10px, confidence is high; if > 50px, confidence is low
  const confidence = Math.max(0.3, Math.min(0.9, 1 - stdDev / 100));

  return {
    topOffset: avgTopOffset,
    leftOffset: avgLeftOffset,
    widthScale: avgWidthScale,
    heightScale: avgHeightScale,
    sampleCount: count,
    confidence,
  };
}

/**
 * Calculate calibrated coordinates using offset and optional anchor refinement
 */
export function calculateCalibratedCoordinates(
  geminiX: number,
  geminiY: number,
  geminiWidth: number,
  geminiHeight: number,
  calibrationOffset: CalibrationOffset,
  referenceBBoxes: ReferenceBBox[],
  imageWidth: number,
  imageHeight: number
): {
  x: number;
  y: number;
  width: number;
  height: number;
  confidence: number;
  method: string;
  nearestAnchor?: string;
} {
  // Step 1: Apply basic calibration offset
  let calibratedX = geminiX - calibrationOffset.leftOffset;
  let calibratedY = geminiY - calibrationOffset.topOffset;
  let calibratedWidth = geminiWidth * calibrationOffset.widthScale;
  let calibratedHeight = geminiHeight * calibrationOffset.heightScale;

  let method = 'offset-only';
  let confidence = calibrationOffset.confidence;
  let nearestAnchor: string | undefined;

  // Step 2: If we have reference bboxes, refine using anchor-based correction
  if (referenceBBoxes.length > 0) {
    const geminiCenterX = geminiX + geminiWidth / 2;
    const geminiCenterY = geminiY + geminiHeight / 2;

    // Find nearest reference bbox
    let minDistance = Infinity;
    let nearestRef: ReferenceBBox | null = null;

    for (const ref of referenceBBoxes) {
      const refCenterX = ref.x + ref.width / 2;
      const refCenterY = ref.y + ref.height / 2;
      const distance = Math.sqrt(
        Math.pow(geminiCenterX - refCenterX, 2) +
          Math.pow(geminiCenterY - refCenterY, 2)
      );

      if (distance < minDistance) {
        minDistance = distance;
        nearestRef = ref;
      }
    }

    // If nearest anchor is very close (within 500px), use it to refine
    if (nearestRef && minDistance < 500) {
      method = 'anchor-refined';
      nearestAnchor = nearestRef.text;

      // Calculate relative position to anchor
      const relativeX = geminiX - (nearestRef.x + calibrationOffset.leftOffset);
      const relativeY = geminiY - (nearestRef.y + calibrationOffset.topOffset);

      // Apply relative position from the accurate anchor
      calibratedX = nearestRef.x + relativeX;
      calibratedY = nearestRef.y + relativeY;

      // Boost confidence when using anchor refinement
      confidence = Math.min(0.95, confidence + 0.1);
    }
  }

  // Step 3: Validate bounds (ensure within image)
  calibratedX = Math.max(0, Math.min(calibratedX, imageWidth - calibratedWidth));
  calibratedY = Math.max(0, Math.min(calibratedY, imageHeight - calibratedHeight));
  calibratedWidth = Math.max(10, Math.min(calibratedWidth, imageWidth - calibratedX));
  calibratedHeight = Math.max(
    10,
    Math.min(calibratedHeight, imageHeight - calibratedY)
  );

  return {
    x: Math.round(calibratedX),
    y: Math.round(calibratedY),
    width: Math.round(calibratedWidth),
    height: Math.round(calibratedHeight),
    confidence,
    method,
    nearestAnchor,
  };
}
