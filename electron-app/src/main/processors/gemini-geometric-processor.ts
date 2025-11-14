import { GoogleGenerativeAI } from '@google/generative-ai';
import * as fs from 'fs';

/**
 * Gemini-based geometric object detector for architectural drawings
 * Detects walls, doors, windows, and other structural elements using AI
 *
 * Simplified version for Electron (no database dependencies)
 */

export interface GeometricObject {
  type: 'wall' | 'door' | 'window' | 'room';
  subType?: string;
  coordinates: Array<{ x: number; y: number }>;
  properties: {
    length?: number;
    thickness?: number;
    orientation?: 'horizontal' | 'vertical' | 'diagonal';
    dimension_text?: string;
    label?: string;
    area?: number;
    [key: string]: any;
  };
  confidence: number;
}

export interface GeometricDetectionResult {
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

  constructor(apiKey: string, model: string = 'gemini-2.0-flash-exp') {
    if (!apiKey) {
      throw new Error('Gemini API key is required');
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

    const prompt = `You are an expert architectural drawing analyzer specializing in floor plan wall and room detection. Analyze this floor plan and identify WALLS and ROOMS with precision.

TASK: Detect individual wall segments and enclosed room spaces. Be thorough and precise.

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
      "type": "wall|door|window|room",
      "subType": "<e.g., 'exterior-wall', 'interior-wall', 'partition', 'sliding-door', 'bedroom', 'bathroom'>",
      "coordinates": [
        {"x": <number>, "y": <number>},
        {"x": <number>, "y": <number>}
      ],
      "properties": {
        "length": <number or null>,
        "thickness": <number or null>,
        "orientation": "horizontal|vertical|diagonal",
        "dimension_text": "<any dimension text nearby>",
        "label": "<room name if applicable>",
        "area": <number or null for rooms>
      },
      "confidence": <0-1>
    }
  ]
}

CRITICAL DETECTION RULES:

1. **WALLS - Highest Priority**:
   DEFINITION: Walls are continuous straight lines that form the structure of the floor plan.

   HOW TO DETECT:
   - Look for PARALLEL LINE PAIRS that are close together (this is wall thickness)
   - The outer edges of the parallel lines represent the wall boundaries
   - Identify EACH CONTINUOUS WALL SEGMENT separately (don't combine walls)
   - Walls typically form rectangles and connect at corners

   WHAT TO EXTRACT:
   - coordinates: [start_point, end_point] of the wall centerline
   - thickness: Distance between the parallel lines in pixels
   - orientation: "horizontal", "vertical", or "diagonal"
   - confidence: Higher if parallel lines are clearly visible

   EXAMPLE: A horizontal wall segment from left to right would be:
   {"type":"wall","subType":"interior-wall","coordinates":[{"x":100,"y":200},{"x":500,"y":200}],"properties":{"length":400,"thickness":10,"orientation":"horizontal"},"confidence":0.95}

2. **ROOMS - Second Priority**:
   DEFINITION: Enclosed spaces formed by walls, labeled or unlabeled.

   HOW TO DETECT:
   - Identify closed polygons formed by walls
   - Look for room labels like "浴室" (bathroom), "寝室" (bedroom), "LDK", etc.
   - Even unlabeled enclosed spaces are rooms

   WHAT TO EXTRACT:
   - coordinates: ALL corner points of the room polygon (clockwise or counter-clockwise)
   - label: Room name/label if visible
   - area: Approximate area if calculable
   - subType: Room function if identifiable from label

   EXAMPLE: A rectangular room with 4 corners:
   {"type":"room","subType":"bedroom","coordinates":[{"x":100,"y":100},{"x":400,"y":100},{"x":400,"y":300},{"x":100,"y":300}],"properties":{"label":"寝室","area":60000},"confidence":0.9}

3. **DOORS** (Optional but helpful):
   - Door symbols: arcs, swing indicators, gaps in walls
   - Mark location where wall has an opening
   - Include door type if identifiable

4. **WINDOWS** (Optional but helpful):
   - Window symbols in walls
   - Usually shown as breaks in walls with special symbols

STRATEGY FOR ANALYSIS:
Step 1: Scan the entire floor plan for PARALLEL LINE PAIRS (these are walls)
Step 2: Trace each wall segment individually from start to end
Step 3: Identify ENCLOSED SPACES (rooms) formed by walls
Step 4: Look for text labels inside rooms
Step 5: Mark doors and windows as openings in walls

COORDINATE SYSTEM:
- Top-left corner = (0, 0)
- X increases to the right
- Y increases downward
- Provide PRECISE pixel coordinates for all points

IMPORTANT RULES:
- Return ONLY the JSON object, no markdown code blocks
- Detect EVERY individual wall segment (don't skip any)
- Be precise with coordinates - measure carefully
- Use confidence to indicate detection certainty
- Prioritize walls and rooms over other elements
- If unsure about thickness, estimate from visible parallel lines

Example output for a simple room:
{"metadata":{"image_width":800,"image_height":600,"scale":"1:100","units":"mm"},"objects":[{"type":"wall","subType":"exterior-wall","coordinates":[{"x":50,"y":50},{"x":750,"y":50}],"properties":{"length":700,"thickness":15,"orientation":"horizontal"},"confidence":0.95},{"type":"wall","subType":"exterior-wall","coordinates":[{"x":750,"y":50},{"x":750,"y":550}],"properties":{"length":500,"thickness":15,"orientation":"vertical"},"confidence":0.95},{"type":"wall","subType":"exterior-wall","coordinates":[{"x":750,"y":550},{"x":50,"y":550}],"properties":{"length":700,"thickness":15,"orientation":"horizontal"},"confidence":0.95},{"type":"wall","subType":"exterior-wall","coordinates":[{"x":50,"y":550},{"x":50,"y":50}],"properties":{"length":500,"thickness":15,"orientation":"vertical"},"confidence":0.95},{"type":"room","coordinates":[{"x":50,"y":50},{"x":750,"y":50},{"x":750,"y":550},{"x":50,"y":550}],"properties":{"area":350000,"label":null},"confidence":0.9}]}`;

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
   * Estimate API cost
   */
  estimateCost(imageCount: number): number {
    // Gemini 2.0 Flash: ~¥1.50 per image for full analysis
    return imageCount * 1.5;
  }
}
