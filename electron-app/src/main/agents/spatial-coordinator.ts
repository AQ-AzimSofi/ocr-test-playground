import { GoogleGenerativeAI } from '@google/generative-ai';
import fs from 'fs';
import type { BoundingBox } from '../processors/types';
import type { CalibrationOffset } from '../utils/coordinate-calculator';

export interface CalibratedCoordinate {
  x: number;
  y: number;
  width: number;
  height: number;
  confidence: number;
  reasoning: string;
  nearest_reference: string | null;
  method: string;
}

export interface BatchTextInput {
  text: string;
  gemini_index: number;
  approximate_x: number;
  approximate_y: number;
  approximate_width: number;
  approximate_height: number;
}

export interface BatchCalibratedCoordinate extends CalibratedCoordinate {
  text: string;
  gemini_index: number;
}

export async function calculatePreciseCoordinatesForBatch(
  imagePath: string,
  unmatchedTexts: BatchTextInput[],
  referenceBBoxes: BoundingBox[],
  calibrationOffset: CalibrationOffset,
  imageWidth: number,
  imageHeight: number,
  apiKey: string
): Promise<BatchCalibratedCoordinate[]> {
  const genAI = new GoogleGenerativeAI(apiKey);
  const model = genAI.getGenerativeModel({
    model: 'gemini-2.5-flash',
    generationConfig: {
      responseMimeType: 'application/json',
    },
  });

  const imageBuffer = fs.readFileSync(imagePath);
  const base64Image = imageBuffer.toString('base64');
  const imagePart = {
    inlineData: {
      data: base64Image,
      mimeType: 'image/png',
    },
  };

  const referencesText = referenceBBoxes
    .slice(0, 10)
    .map(
      (ref, idx) => `
${idx + 1}. Text: "${ref.text}"
   - Top-Left: (${ref.bounds[0].x.toFixed(0)}px, ${ref.bounds[0].y.toFixed(0)}px)
   - Width: ${(ref.bounds[1].x - ref.bounds[0].x).toFixed(0)}px
   - Height: ${(ref.bounds[2].y - ref.bounds[0].y).toFixed(0)}px`
    )
    .join('\n');

  const textsToLocate = unmatchedTexts
    .map(
      (text, idx) => `
${idx + 1}. Text: "${text.text}"
   - Gemini Index: ${text.gemini_index}
   - Approximate position: (${text.approximate_x}px, ${text.approximate_y}px)
   - Approximate size: ${text.approximate_width}px × ${text.approximate_height}px
   - Calibration-corrected estimate: (${(text.approximate_x - calibrationOffset.leftOffset).toFixed(0)}px, ${(text.approximate_y - calibrationOffset.topOffset).toFixed(0)}px)`
    )
    .join('\n');

  const prompt = `You are a spatial reasoning expert analyzing a Japanese architectural floor plan drawing.

IMAGE PROPERTIES:
- Width: ${imageWidth}px
- Height: ${imageHeight}px

TASK: Calculate precise pixel coordinates for ${unmatchedTexts.length} text elements that were detected by one OCR system but missed by another.

REFERENCE BOUNDING BOXES (Cloud Vision - ACCURATE coordinates):
These are texts with PRECISE coordinates that you should use as anchor points:
${referencesText}

LEARNED CALIBRATION DATA:
Based on ${calibrationOffset.sampleCount} matched text pairs, we learned that the initial OCR typically:
- Offsets vertically by: ${calibrationOffset.topOffset.toFixed(1)}px
- Offsets horizontally by: ${calibrationOffset.leftOffset.toFixed(1)}px
- Width scaling factor: ${calibrationOffset.widthScale.toFixed(3)}x
- Height scaling factor: ${calibrationOffset.heightScale.toFixed(3)}x
- Calibration confidence: ${(calibrationOffset.confidence * 100).toFixed(0)}%

TEXTS TO LOCATE (${unmatchedTexts.length} texts):
${textsToLocate}

INSTRUCTIONS:

For EACH text in the list above:

1. **Locate the text** in the image using visual inspection
2. **Identify nearby reference texts** from the reference list to use as spatial anchors
3. **Calculate precise pixel coordinates** using this approach:

   **Step A: Apply Calibration Offset**
   - Start with the approximate position
   - Apply the learned offset correction (already shown as "Calibration-corrected estimate")

   **Step B: Use Reference Anchors**
   - If a reference text is nearby (within ~200px), use it to refine the position
   - Calculate relative position from the anchor

   **Step C: Visual Verification**
   - Look at the actual image to verify the calculated position makes sense
   - Adjust if the text is clearly not at the calculated position
   - Ensure the bbox fully contains the text with minimal extra space

4. **Return precise coordinates** in pixels from the top-left corner of the image

OUTPUT REQUIREMENTS:

Return a JSON object with this structure:
{
  "coordinates": [
    {
      "text": "<string>",           // The text (must match input)
      "gemini_index": <number>,     // The gemini_index from input (IMPORTANT!)
      "x": <number>,                // Left edge pixel position (0 to ${imageWidth})
      "y": <number>,                // Top edge pixel position (0 to ${imageHeight})
      "width": <number>,            // Width in pixels
      "height": <number>,           // Height in pixels
      "confidence": <number>,       // 0-1 (how confident you are)
      "reasoning": "<string>",      // Brief explanation
      "nearest_reference": "<string or null>",  // Text of nearest reference bbox
      "method": "<string>"          // e.g., "calibration + anchor-based refinement"
    },
    ... (one entry for each text)
  ]
}

IMPORTANT:
- Return coordinates for ALL ${unmatchedTexts.length} texts in the same order as the input
- Each entry MUST include the "gemini_index" field matching the input
- Coordinates must be within image bounds: 0 ≤ x ≤ ${imageWidth}, 0 ≤ y ≤ ${imageHeight}
- Width and height must be positive and reasonable (typically 20-500px for text)
- Higher confidence (0.8+) when you can clearly see the text and have close references
- Medium confidence (0.6-0.8) when text is visible but references are far
- Lower confidence (<0.6) when text is hard to locate

RESPONSE FORMAT:
Return a valid JSON object with the "coordinates" array containing all results.`;

  const result = await model.generateContent([imagePart, prompt]);

  const response = result.response;
  const jsonText = response.text();

  try {
    const parsedOutput = JSON.parse(jsonText);

    const processedCoordinates = parsedOutput.coordinates.map((coord: any) => {
      const clampedX = Math.max(
        0,
        Math.min(coord.x, imageWidth - (coord.width || 50))
      );
      const clampedY = Math.max(
        0,
        Math.min(coord.y, imageHeight - (coord.height || 20))
      );
      const clampedWidth = Math.max(
        10,
        Math.min(coord.width, imageWidth - clampedX)
      );
      const clampedHeight = Math.max(
        10,
        Math.min(coord.height, imageHeight - clampedY)
      );

      return {
        ...coord,
        x: Math.round(clampedX),
        y: Math.round(clampedY),
        width: Math.round(clampedWidth),
        height: Math.round(clampedHeight),
      };
    });

    return processedCoordinates as BatchCalibratedCoordinate[];
  } catch (error) {
    console.error('Failed to parse batch spatial coordinator output:', error);
    console.error('Raw response:', jsonText);
    throw new Error(
      'Batch coordinate calculation failed - will fall back to individual processing'
    );
  }
}

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
  imageHeight: number,
  apiKey: string
): Promise<CalibratedCoordinate> {
  const genAI = new GoogleGenerativeAI(apiKey);
  const model = genAI.getGenerativeModel({
    model: 'gemini-2.5-flash',
    generationConfig: {
      responseMimeType: 'application/json',
    },
  });

  const imageBuffer = fs.readFileSync(imagePath);
  const base64Image = imageBuffer.toString('base64');
  const imagePart = {
    inlineData: {
      data: base64Image,
      mimeType: 'image/png',
    },
  };

  const nearestRefs = findNearestReferences(
    geminiApproxX,
    geminiApproxY,
    referenceBBoxes,
    5
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
- Lower confidence (<0.6) when text is hard to locate

RESPONSE FORMAT:
Return a valid JSON object with the coordinates.`;

  const result = await model.generateContent([imagePart, prompt]);

  const response = result.response;
  const jsonText = response.text();

  try {
    const parsedOutput = JSON.parse(jsonText);

    const clampedX = Math.max(
      0,
      Math.min(parsedOutput.x, imageWidth - (parsedOutput.width || 50))
    );
    const clampedY = Math.max(
      0,
      Math.min(parsedOutput.y, imageHeight - (parsedOutput.height || 20))
    );
    const clampedWidth = Math.max(
      10,
      Math.min(parsedOutput.width, imageWidth - clampedX)
    );
    const clampedHeight = Math.max(
      10,
      Math.min(parsedOutput.height, imageHeight - clampedY)
    );

    return {
      x: Math.round(clampedX),
      y: Math.round(clampedY),
      width: Math.round(clampedWidth),
      height: Math.round(clampedHeight),
      confidence: parsedOutput.confidence,
      reasoning: parsedOutput.reasoning,
      nearest_reference: parsedOutput.nearest_reference,
      method: parsedOutput.method,
    };
  } catch (error) {
    console.error('Failed to parse spatial coordinator output:', error);
    console.error('Raw response:', jsonText);
    throw new Error('Invalid output from Spatial Coordinator Agent');
  }
}

function findNearestReferences(
  x: number,
  y: number,
  bboxes: BoundingBox[],
  count: number = 5
): BoundingBox[] {
  const distances = bboxes.map((bbox) => {
    const bboxCenterX = (bbox.bounds[0].x + bbox.bounds[1].x) / 2;
    const bboxCenterY = (bbox.bounds[0].y + bbox.bounds[2].y) / 2;
    const distance = Math.sqrt(
      Math.pow(x - bboxCenterX, 2) + Math.pow(y - bboxCenterY, 2)
    );
    return { bbox, distance };
  });

  distances.sort((a, b) => a.distance - b.distance);

  return distances.slice(0, count).map((d) => d.bbox);
}

function calculateSpatialRelation(
  targetX: number,
  targetY: number,
  refBBox: BoundingBox
): string {
  const refX = refBBox.bounds[0].x;
  const refY = refBBox.bounds[0].y;

  const dx = targetX - refX;
  const dy = targetY - refY;

  const horizontal = dx > 0 ? 'right' : 'left';
  const vertical = dy > 0 ? 'below' : 'above';

  return `${Math.abs(dy).toFixed(0)}px ${vertical}, ${Math.abs(dx).toFixed(0)}px ${horizontal}`;
}
