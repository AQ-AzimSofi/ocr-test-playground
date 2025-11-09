import { GoogleGenerativeAI } from '@google/generative-ai';
import * as fs from 'fs';
import * as dotenv from 'dotenv';
import { db, extractionResults, geometricObjects } from '../db/index.js';

dotenv.config({ path: '.env.development' });

/**
 * Gemini-based geometric object detector for architectural drawings
 * Detects walls, doors, windows, and other structural elements using AI
 */

interface GeometricObject {
  type: 'wall' | 'door' | 'window' | 'line' | 'symbol' | 'room' | 'other';
  subType?: string;
  coordinates: Array<{ x: number; y: number }>;
  properties: {
    length?: number;
    width?: number;
    thickness?: number;
    height?: number;
    dimension_text?: string;
    label?: string;
    [key: string]: any;
  };
  confidence: number;
}

interface GeometricDetectionResult {
  objects: GeometricObject[];
  metadata: {
    image_width: number;
    image_height: number;
    scale?: string;
    units?: string;
  };
}

export class GeminiGeometricDetector {
  private genAI: GoogleGenerativeAI;
  private model: string;

  constructor(model: string = 'gemini-2.5-flash') {
    const apiKey = process.env.GOOGLE_GEMINI_API_KEY;
    if (!apiKey) {
      throw new Error('GOOGLE_GEMINI_API_KEY environment variable not set');
    }

    this.genAI = new GoogleGenerativeAI(apiKey);
    this.model = model;
  }

  /**
   * Detect geometric objects (walls, doors, windows) from architectural drawing
   */
  async detectGeometricObjects(
    imagePath: string
  ): Promise<GeometricDetectionResult> {
    const model = this.genAI.getGenerativeModel({ model: this.model });

    const prompt = `You are an expert architectural drawing analyzer. Analyze this construction/architectural drawing and identify geometric objects.

TASK: Identify and extract structural elements with their coordinates and properties.

OUTPUT FORMAT: Return ONLY valid JSON, no explanations. Use this exact structure:
{
  "metadata": {
    "image_width": <number>,
    "image_height": <number>,
    "scale": "<scale notation if visible, e.g., '1:100'>",
    "units": "<units if visible, e.g., 'mm', 'm'>"
  },
  "objects": [
    {
      "type": "wall|door|window|line|symbol|room|other",
      "subType": "<optional: e.g., 'exterior-wall', 'sliding-door', 'casement-window'>",
      "coordinates": [
        {"x": <number>, "y": <number>},
        {"x": <number>, "y": <number>}
      ],
      "properties": {
        "length": <number or null>,
        "width": <number or null>,
        "thickness": <number or null>,
        "dimension_text": "<any dimension text nearby>",
        "label": "<any label text like '浴室', 'living room'>"
      },
      "confidence": <0-1>
    }
  ]
}

DETECTION RULES:
1. **Walls**: Long continuous lines, typically thick lines. Look for parallel lines indicating wall thickness.
   - Extract start and end coordinates
   - Try to determine thickness from parallel lines
   - Associate nearby dimension text (e.g., "10,920", "3,500")

2. **Doors**: Door symbols (arcs, rectangles with swing indicators)
   - Mark location and opening width
   - Identify door type if visible (sliding, hinged, double)

3. **Windows**: Window symbols (rectangles with cross-hatching or glass indication)
   - Mark location and dimensions
   - Identify window type if visible

4. **Rooms**: Enclosed spaces with labels
   - Identify boundary coordinates (polygon)
   - Extract room label text (e.g., "浴室", "寝室")
   - Calculate approximate area if possible

5. **Dimension Text Association**:
   - Find dimension text near each object (numbers with units like "10,920mm", "3,500")
   - Store in "dimension_text" property

6. **Coordinate System**:
   - Use pixel coordinates (top-left = 0,0)
   - For lines/walls: provide [start_point, end_point]
   - For rooms/polygons: provide all vertices
   - For symbols: provide center point or bounding box corners

IMPORTANT:
- Return ONLY the JSON object, no markdown code blocks, no explanations
- Confidence should reflect your certainty (0.0-1.0)
- If you can't determine a property, use null
- Coordinates must be numbers (pixel positions)
- Focus on major structural elements first (walls, doors, windows)

Example minimal output:
{"metadata":{"image_width":1920,"image_height":1080,"scale":"1:100","units":"mm"},"objects":[{"type":"wall","coordinates":[{"x":100,"y":500},{"x":1200,"y":500}],"properties":{"length":11000,"thickness":150,"dimension_text":"10,920"},"confidence":0.9}]}`;

    const imageData = fs.readFileSync(imagePath);
    const base64Image = imageData.toString('base64');
    const mimeType = imagePath.endsWith('.png') ? 'image/png' : 'image/jpeg';

    const result = await model.generateContent([
      prompt,
      {
        inlineData: {
          data: base64Image,
          mimeType,
        },
      },
    ]);

    const response = result.response;
    const rawText = response.text();

    // Clean potential markdown code blocks
    let jsonText = rawText.trim();
    if (jsonText.startsWith('```json')) {
      jsonText = jsonText.replace(/^```json\n/, '').replace(/\n```$/, '');
    } else if (jsonText.startsWith('```')) {
      jsonText = jsonText.replace(/^```\n/, '').replace(/\n```$/, '');
    }

    try {
      const parsed = JSON.parse(jsonText) as GeometricDetectionResult;
      return parsed;
    } catch (error) {
      console.error(
        'Failed to parse Gemini geometric detection response:',
        rawText
      );
      throw new Error(
        `Gemini returned invalid JSON: ${error instanceof Error ? error.message : 'Unknown error'}`
      );
    }
  }

  /**
   * Estimate API cost (similar to text extraction)
   */
  estimateCost(imageCount: number): number {
    // Gemini 2.5 Flash: ~¥1.50 per image for full analysis
    // Higher than text extraction due to complex reasoning
    return imageCount * 1.5;
  }
}

// Singleton instance
export const geminiGeometricDetector = new GeminiGeometricDetector();

/**
 * Process drawing with Gemini for geometric object detection
 */
export async function processWithGeminiGeometric(
  imagePath: string,
  drawingId: string
) {
  console.log(`  Processing with Gemini Geometric Detector...`);
  const startTime = Date.now();

  try {
    // Detect geometric objects
    const result =
      await geminiGeometricDetector.detectGeometricObjects(imagePath);

    const processingTime = Date.now() - startTime;
    const estimatedCost = geminiGeometricDetector.estimateCost(1);

    // Generate a text summary for the extraction_results table
    const textSummary = result.objects
      .map((obj) => {
        const coords = obj.coordinates
          .map((c) => `(${c.x},${c.y})`)
          .join(' -> ');
        const props = Object.entries(obj.properties)
          .filter(([_, v]) => v !== null)
          .map(([k, v]) => `${k}:${v}`)
          .join(', ');
        return `${obj.type} [${coords}] {${props}}`;
      })
      .join('\n');

    // Save extraction result to database
    const [dbResult] = await db
      .insert(extractionResults)
      .values({
        drawingId,
        tool: 'gemini-geometric',
        rawText: textSummary,
        boundingBoxes: result.objects.map((obj) => ({
          text: `${obj.type}${obj.subType ? ` (${obj.subType})` : ''}`,
          bounds: obj.coordinates,
          confidence: obj.confidence,
          bboxSource: 'ocr' as const, // AI-detected
          metadata: obj.properties,
        })),
        processingTimeMs: processingTime,
        apiCost: estimatedCost,
        metadata: {
          imageMetadata: result.metadata,
          objectCount: result.objects.length,
          objectTypes: result.objects.reduce(
            (acc, obj) => {
              acc[obj.type] = (acc[obj.type] || 0) + 1;
              return acc;
            },
            {} as Record<string, number>
          ),
        },
      })
      .returning();

    console.log(
      `  Gemini Geometric completed in ${(processingTime / 1000).toFixed(2)}s`
    );
    console.log(`     Detected ${result.objects.length} objects:`);

    // Count objects by type
    const typeCounts: Record<string, number> = {};
    result.objects.forEach((obj) => {
      typeCounts[obj.type] = (typeCounts[obj.type] || 0) + 1;
    });
    Object.entries(typeCounts).forEach(([type, count]) => {
      console.log(`       - ${count} ${type}(s)`);
    });

    // Save each geometric object to the geometric_objects table
    const geometricObjectIds: string[] = [];

    for (const obj of result.objects) {
      const [geometricObj] = await db
        .insert(geometricObjects)
        .values({
          extractionResultId: dbResult.id,
          drawingId,
          objectType: obj.type,
          subType: obj.subType || null,
          geometry: {
            type:
              obj.coordinates.length === 1
                ? 'point'
                : obj.coordinates.length === 2
                  ? 'line'
                  : 'polygon',
            coordinates: obj.coordinates,
          },
          properties: obj.properties,
          confidence: obj.confidence,
          detectionMethod: 'ai-detection',
          metadata: {
            model: 'gemini-2.5-flash',
            processingTime: processingTime,
          },
        })
        .returning();

      geometricObjectIds.push(geometricObj.id);
    }

    return {
      success: true,
      extractionResultId: dbResult.id,
      tool: 'gemini-geometric',
      objectCount: result.objects.length,
      geometricObjectIds,
      processingTime,
      cost: estimatedCost,
      metadata: result.metadata,
    };
  } catch (error) {
    console.error(`  Gemini Geometric failed:`, error);
    throw error;
  }
}
