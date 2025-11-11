import { GoogleGenerativeAI, Part } from '@google/generative-ai';
import { z } from 'zod';
import * as dotenv from 'dotenv';
import * as fs from 'fs';
import type { BoundingBox } from '../../types/processor-types.js';
import type { CalibrationOffset } from '../tools/coordinate-calculator-tool.js';

dotenv.config({ path: '.env.development' });

/**
 * Spatial Coordinator Agent
 *
 * Uses Gemini's vision and spatial reasoning capabilities to calculate precise
 * coordinates for Gemini-only texts by using Cloud Vision bboxes as reference anchors.
 *
 * This agent receives:
 * 1. The image
 * 2. Cloud Vision bboxes with accurate coordinates (ground truth anchors)
 * 3. An unmatched Gemini text with approximate coordinates
 * 4. Learned calibration offset from matched pairs
 *
 * It returns precise pixel coordinates for the Gemini text.
 */

const CalibratedCoordinateSchema = z.object({
  x: z.number(),
  y: z.number(),
  width: z.number(),
  height: z.number(),
  confidence: z.number().min(0).max(1),
  reasoning: z.string(),
  nearest_reference: z.string().nullable(),
  method: z.string(),
});

export type CalibratedCoordinate = z.infer<typeof CalibratedCoordinateSchema>;

/**
 * Calculate precise coordinates for an unmatched Gemini text
 * using Cloud Vision reference points and spatial reasoning
 */
export async function calculatePreciseCoordinates(
  imagePath: string,
  geminiText: string,
  geminiApproxX: number,
  geminiApproxY: number,
  geminiApproxWidth: number,
  geminiApproxHeight: number,
  referenceBBoxes: BoundingBox[],
  calibrationOffset: CalibrationOffset,
  imageWidth: number,
  imageHeight: number
): Promise<CalibratedCoordinate> {
  const apiKey = process.env.GOOGLE_GEMINI_API_KEY;
  if (!apiKey) {
    throw new Error('GOOGLE_GEMINI_API_KEY environment variable not set');
  }

  const genAI = new GoogleGenerativeAI(apiKey);
  const model = genAI.getGenerativeModel({
    model: 'gemini-2.5-flash',
    generationConfig: {
      responseMimeType: 'application/json',
    },
  });

  // Read and encode the image
  const imageBuffer = fs.readFileSync(imagePath);
  const base64Image = imageBuffer.toString('base64');
  const imagePart: Part = {
    inlineData: {
      data: base64Image,
      mimeType: 'image/png',
    },
  };

  // Find nearest reference bboxes for context
  const nearestRefs = findNearestReferences(
    geminiApproxX,
    geminiApproxY,
    referenceBBoxes,
    5 // Get 5 nearest references
  );

  const prompt = `You are a spatial reasoning expert analyzing a Japanese architectural floor plan drawing.

IMAGE PROPERTIES:
- Width: ${imageWidth}px
- Height: ${imageHeight}px

TASK: Calculate precise pixel coordinates for a text element that was detected by one OCR system but missed by another.

TARGET TEXT TO LOCATE:
- Text: "${geminiText}"
- Approximate position (from initial OCR): x=${geminiApproxX}px, y=${geminiApproxY}px
- Approximate size: ${geminiApproxWidth}px × ${geminiApproxHeight}px

REFERENCE BOUNDING BOXES (Cloud Vision - ACCURATE coordinates):
These are texts with PRECISE coordinates that you should use as anchor points:

${nearestRefs
  .map(
    (ref, idx) => `
${idx + 1}. Text: "${ref.text}"
   - Top-Left: (${ref.bounds[0].x.toFixed(0)}px, ${ref.bounds[0].y.toFixed(0)}px)
   - Top-Right: (${ref.bounds[1].x.toFixed(0)}px, ${ref.bounds[1].y.toFixed(0)}px)
   - Bottom-Right: (${ref.bounds[2].x.toFixed(0)}px, ${ref.bounds[2].y.toFixed(0)}px)
   - Bottom-Left: (${ref.bounds[3].x.toFixed(0)}px, ${ref.bounds[3].y.toFixed(0)}px)
   - Width: ${(ref.bounds[1].x - ref.bounds[0].x).toFixed(0)}px
   - Height: ${(ref.bounds[2].y - ref.bounds[0].y).toFixed(0)}px
   - Spatial relation: ${calculateSpatialRelation(geminiApproxX, geminiApproxY, ref)}`
  )
  .join('\n')}

LEARNED CALIBRATION DATA:
Based on ${calibrationOffset.sampleCount} matched text pairs, we learned that the initial OCR typically:
- Offsets vertically by: ${calibrationOffset.topOffset.toFixed(1)}px ${calibrationOffset.topOffset > 0 ? 'too low' : 'too high'}
- Offsets horizontally by: ${calibrationOffset.leftOffset.toFixed(1)}px ${calibrationOffset.leftOffset > 0 ? 'too far right' : 'too far left'}
- Width scaling factor: ${calibrationOffset.widthScale.toFixed(3)}x
- Height scaling factor: ${calibrationOffset.heightScale.toFixed(3)}x
- Calibration confidence: ${(calibrationOffset.confidence * 100).toFixed(0)}%

INSTRUCTIONS:

1. **Locate the text** "${geminiText}" in the image using visual inspection
2. **Identify nearby reference texts** from the list above to use as spatial anchors
3. **Calculate precise pixel coordinates** using this multi-step approach:

   **Step A: Apply Calibration Offset**
   - Start with approximate position (${geminiApproxX}, ${geminiApproxY})
   - Apply learned offset correction:
     - x_corrected = ${geminiApproxX} - ${calibrationOffset.leftOffset.toFixed(1)} = ${(geminiApproxX - calibrationOffset.leftOffset).toFixed(0)}px
     - y_corrected = ${geminiApproxY} - ${calibrationOffset.topOffset.toFixed(1)} = ${(geminiApproxY - calibrationOffset.topOffset).toFixed(0)}px

   **Step B: Use Reference Anchors**
   - If a reference text is very close (within ~200px), use it to refine the position
   - Calculate relative position from the anchor: "Text is X pixels right/left and Y pixels above/below the anchor"
   - Apply the same relative offset from the accurate anchor coordinates

   **Step C: Visual Verification**
   - Look at the actual image to verify the calculated position makes sense
   - Adjust if the text is clearly not at the calculated position
   - Ensure the bbox fully contains the text with minimal extra space

4. **Return precise coordinates** in pixels from the top-left corner of the image

OUTPUT REQUIREMENTS:
{
  "x": <number> // Left edge pixel position (0 to ${imageWidth})
  "y": <number> // Top edge pixel position (0 to ${imageHeight})
  "width": <number> // Width in pixels
  "height": <number> // Height in pixels
  "confidence": <number> // 0-1 (how confident you are in these coordinates)
  "reasoning": "<string>" // Brief explanation of how you calculated the position
  "nearest_reference": "<string>" // Text of the nearest reference bbox used (or null)
  "method": "<string>" // e.g., "calibration + anchor-based refinement", "visual + calibration"
}

IMPORTANT:
- Coordinates must be within image bounds: 0 ≤ x ≤ ${imageWidth}, 0 ≤ y ≤ ${imageHeight}
- Width and height must be positive and reasonable (typically 20-500px for text)
- Higher confidence (0.8+) when you can clearly see the text and have close references
- Medium confidence (0.6-0.8) when text is visible but references are far
- Lower confidence (<0.6) when text is hard to locate or calibration is uncertain

RESPONSE FORMAT:
Return a JSON object with the precise coordinates.`;

  const result = await model.generateContent([imagePart, prompt]);

  const response = result.response;
  const jsonText = response.text();

  try {
    const parsedOutput = JSON.parse(jsonText);

    // Validate coordinates are within bounds
    if (parsedOutput.x < 0 || parsedOutput.x > imageWidth) {
      parsedOutput.x = Math.max(0, Math.min(parsedOutput.x, imageWidth - 50));
    }
    if (parsedOutput.y < 0 || parsedOutput.y > imageHeight) {
      parsedOutput.y = Math.max(0, Math.min(parsedOutput.y, imageHeight - 20));
    }

    return CalibratedCoordinateSchema.parse(parsedOutput);
  } catch (error) {
    console.error('Failed to parse spatial coordinator output:', error);
    console.error('Raw response:', jsonText);

    // Fallback: use calibration-only approach
    return fallbackCalibration(
      geminiApproxX,
      geminiApproxY,
      geminiApproxWidth,
      geminiApproxHeight,
      calibrationOffset,
      imageWidth,
      imageHeight
    );
  }
}

/**
 * Find nearest reference bboxes to use as spatial anchors
 */
function findNearestReferences(
  targetX: number,
  targetY: number,
  referenceBBoxes: BoundingBox[],
  count: number
): BoundingBox[] {
  const distances = referenceBBoxes.map((bbox) => {
    const bboxX = bbox.bounds[0].x;
    const bboxY = bbox.bounds[0].y;
    const distance = Math.sqrt(
      Math.pow(targetX - bboxX, 2) + Math.pow(targetY - bboxY, 2)
    );
    return { bbox, distance };
  });

  distances.sort((a, b) => a.distance - b.distance);

  return distances.slice(0, count).map((d) => d.bbox);
}

/**
 * Calculate spatial relationship description
 */
function calculateSpatialRelation(
  targetX: number,
  targetY: number,
  refBBox: BoundingBox
): string {
  const refX = refBBox.bounds[0].x;
  const refY = refBBox.bounds[0].y;

  const deltaX = targetX - refX;
  const deltaY = targetY - refY;
  const distance = Math.sqrt(deltaX * deltaX + deltaY * deltaY);

  const direction =
    Math.abs(deltaX) > Math.abs(deltaY)
      ? deltaX > 0
        ? 'right'
        : 'left'
      : deltaY > 0
        ? 'below'
        : 'above';

  return `${distance.toFixed(0)}px ${direction}`;
}

/**
 * Fallback calibration when AI fails
 */
function fallbackCalibration(
  geminiApproxX: number,
  geminiApproxY: number,
  geminiApproxWidth: number,
  geminiApproxHeight: number,
  calibrationOffset: CalibrationOffset,
  imageWidth: number,
  imageHeight: number
): CalibratedCoordinate {
  const x = Math.max(
    0,
    Math.min(geminiApproxX - calibrationOffset.leftOffset, imageWidth - 50)
  );
  const y = Math.max(
    0,
    Math.min(geminiApproxY - calibrationOffset.topOffset, imageHeight - 20)
  );
  const width = Math.max(20, geminiApproxWidth * calibrationOffset.widthScale);
  const height = Math.max(10, geminiApproxHeight * calibrationOffset.heightScale);

  return {
    x: Math.round(x),
    y: Math.round(y),
    width: Math.round(width),
    height: Math.round(height),
    confidence: calibrationOffset.confidence * 0.7, // Lower confidence for fallback
    reasoning: 'Fallback calibration-only approach (AI reasoning failed)',
    nearest_reference: null,
    method: 'fallback-calibration',
  };
}
