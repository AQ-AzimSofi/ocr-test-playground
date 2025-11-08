import { geminiClient } from '../lib/gemini-client.js';
import { db, extractionResults } from '../db/index.js';
import sharp from 'sharp';
import { parseGeminiCoordinates, hasCoordinateFormat } from '../utils/gemini-parser.js';
import { percentageToBbox } from '../utils/bbox-estimator.js';

/**
 * Process drawing with Gemini using coordinate-based prompting
 * Attempts to get both text AND approximate bounding boxes from Gemini
 */
export async function processWithGeminiCoordinates(imagePath: string, drawingId: string) {
  console.log(`  Processing with Gemini Coordinates...`);
  const startTime = Date.now();

  try {
    // Get image dimensions
    const metadata = await sharp(imagePath).metadata();
    const imageWidth = metadata.width || 1000;
    const imageHeight = metadata.height || 1000;

    // Craft prompt asking for coordinates
    const prompt = `Extract all visible text from this image with position coordinates.

For each text element, provide the text and its approximate position as percentages of image dimensions.

FORMAT EACH LINE AS:
TEXT|top|left|width|height

Where:
- TEXT: The actual text you see
- top: Percentage from top edge (0-100)
- left: Percentage from left edge (0-100)
- width: Width as percentage (0-100)
- height: Height as percentage (0-100)

EXAMPLE OUTPUT:
配筋図|5|10|15|3
RC造|8|10|8|2
1F平面図|12|45|20|4

CRITICAL RULES:
- Use pipe | to separate fields
- Provide percentages as numbers only (no % symbol)
- Extract ALL visible text
- One text element per line
- NO explanations, NO comments, JUST the formatted data
- If you cannot estimate coordinates, still provide the text with best guess percentages

Include all:
- Numbers and digits
- Japanese, English, symbols
- Special characters (×, ㎡, m², etc.)`;

    // Extract with custom prompt
    const response = await geminiClient.extractWithCustomPrompt(imagePath, prompt);

    console.log(`  Gemini response preview: ${response.substring(0, 200)}...`);

    // Try to parse coordinates from response
    const coordinates = parseGeminiCoordinates(response);

    console.log(`  Parsed ${coordinates.length} text elements with coordinates`);

    let boundingBoxes = [];
    let rawText = '';

    if (coordinates.length > 0) {
      // Successfully parsed coordinate format
      boundingBoxes = coordinates.map(coord => {
        const bbox = percentageToBbox(
          coord.top,
          coord.left,
          coord.width,
          coord.height,
          imageWidth,
          imageHeight
        );

        return {
          text: coord.text,
          bounds: bbox.bounds,
          confidence: bbox.confidence,
          bboxSource: 'gemini-percentage' as const,
        };
      });

      // Reconstruct text from coordinates (preserving order)
      rawText = coordinates.map(c => c.text).join('\n');
    } else {
      // Fallback: treat as plain text extraction
      console.warn('  Failed to parse coordinates, using raw text only');
      rawText = response;
      // No bounding boxes in this case
    }

    const processingTime = Date.now() - startTime;
    const estimatedCost = geminiClient.estimateCost(1);

    // Save to database
    const [dbResult] = await db
      .insert(extractionResults)
      .values({
        drawingId,
        tool: 'gemini-coordinates',
        rawText,
        boundingBoxes: boundingBoxes.length > 0 ? boundingBoxes : undefined,
        processingTimeMs: processingTime,
        apiCost: estimatedCost,
        metadata: {
          hasCoordinates: coordinates.length > 0,
          coordinateCount: coordinates.length,
          fallbackToPlainText: coordinates.length === 0,
        },
      })
      .returning();

    console.log(`  Gemini Coordinates completed in ${(processingTime / 1000).toFixed(2)}s`);
    console.log(`     Extracted ${rawText.length} characters`);
    console.log(`     Generated ${boundingBoxes.length} bounding boxes`);

    return {
      success: true,
      extractionResultId: dbResult.id,
      tool: 'gemini-coordinates',
      rawText,
      boundingBoxes,
      processingTime,
      cost: estimatedCost,
      metadata: {
        hasCoordinates: coordinates.length > 0,
        coordinateCount: coordinates.length,
      },
    };
  } catch (error) {
    console.error(`  Gemini Coordinates failed:`, error);
    throw error;
  }
}
