import { Agent } from '@mastra/core';
import { GoogleGenerativeAI } from '@google/generative-ai';
import { z } from 'zod';
import * as fs from 'fs';
import * as dotenv from 'dotenv';

dotenv.config({ path: '.env.development' });

/**
 * Global Analyzer Agent
 *
 * First-pass understanding of the floor plan.
 * Identifies and classifies major regions of the drawing:
 * - Main building area (where walls/rooms are)
 * - Dimension zones (areas with measurement text)
 * - Text annotation areas (labels, room names, notes)
 * - Site boundaries (external plot lines)
 *
 * This agent provides a strategic overview that guides subsequent specialized agents.
 */

// Output schema for region detection
export const GlobalAnalysisOutputSchema = z.object({
  main_building_area: z.object({
    description: z.string(),
    bounding_box: z.object({
      x_min_percent: z.number().min(0).max(100),
      y_min_percent: z.number().min(0).max(100),
      x_max_percent: z.number().min(0).max(100),
      y_max_percent: z.number().min(0).max(100),
    }),
    confidence: z.number().min(0).max(1),
  }),
  dimension_zones: z.array(z.object({
    description: z.string(),
    zone_type: z.enum(['horizontal_dimensions', 'vertical_dimensions', 'detail_dimensions', 'mixed']),
    bounding_box: z.object({
      x_min_percent: z.number().min(0).max(100),
      y_min_percent: z.number().min(0).max(100),
      x_max_percent: z.number().min(0).max(100),
      y_max_percent: z.number().min(0).max(100),
    }),
    confidence: z.number().min(0).max(1),
  })),
  text_annotation_areas: z.array(z.object({
    description: z.string(),
    annotation_type: z.enum(['room_labels', 'technical_notes', 'legend', 'title_block', 'general_labels']),
    bounding_box: z.object({
      x_min_percent: z.number().min(0).max(100),
      y_min_percent: z.number().min(0).max(100),
      x_max_percent: z.number().min(0).max(100),
      y_max_percent: z.number().min(0).max(100),
    }),
    confidence: z.number().min(0).max(1),
  })),
  drawing_metadata: z.object({
    drawing_type: z.enum(['floor_plan', 'elevation', 'section', 'site_plan', 'detail', 'unknown']),
    scale_indicator: z.string().nullable(),
    orientation: z.enum(['horizontal', 'vertical', 'unknown']),
    quality: z.enum(['high', 'medium', 'low']),
    complexity: z.enum(['simple', 'moderate', 'complex']),
  }),
  analysis_summary: z.string(),
});

export type GlobalAnalysisOutput = z.infer<typeof GlobalAnalysisOutputSchema>;

/**
 * Analyzes a floor plan image and identifies major regions
 */
export async function analyzeFloorPlanGlobally(imagePath: string): Promise<GlobalAnalysisOutput> {
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

  const prompt = `You are an expert architectural drawing analyzer. Your task is to analyze this floor plan and identify the major regions.

TASK: Perform a high-level analysis to identify distinct zones in this drawing.

REGIONS TO IDENTIFY:

1. **Main Building Area**
   - The primary floor plan showing walls, rooms, and interior spaces
   - This is typically the central, most prominent area
   - Exclude dimension lines, notes, and site boundaries
   - Return bounding box as percentages of image width/height

2. **Dimension Zones** (areas containing measurement text)
   - Horizontal dimension lines (typically top/bottom)
   - Vertical dimension lines (typically left/right sides)
   - Detail dimensions (within or around the building)
   - Include the dimension text AND the leader lines
   - Can have multiple zones

3. **Text Annotation Areas**
   - Room labels (e.g., "浴室", "LDK", "寝室")
   - Technical notes and specifications
   - Legend or key
   - Title block (drawing title, scale, date)
   - General labels

4. **Drawing Metadata**
   - Type of drawing (floor plan, elevation, etc.)
   - Scale indicator if visible (e.g., "1:100", "S=1/100")
   - Orientation of the drawing
   - Quality assessment (clarity, resolution)
   - Complexity (how detailed/complex is this drawing?)

IMPORTANT:
- Use PERCENTAGE coordinates (0-100) relative to image width/height
- Each bounding box should be: {x_min_percent, y_min_percent, x_max_percent, y_max_percent}
- Provide confidence scores (0-1) for each region
- In analysis_summary, briefly describe the overall layout and what you found

RESPONSE FORMAT - EXACT JSON STRUCTURE REQUIRED:
{
  "main_building_area": {
    "description": "Brief description",
    "bounding_box": { "x_min_percent": number, "y_min_percent": number, "x_max_percent": number, "y_max_percent": number },
    "confidence": number (0-1)
  },
  "dimension_zones": [
    {
      "description": "Brief description",
      "zone_type": "horizontal_dimensions" | "vertical_dimensions" | "detail_dimensions" | "mixed",
      "bounding_box": { "x_min_percent": number, "y_min_percent": number, "x_max_percent": number, "y_max_percent": number },
      "confidence": number (0-1)
    }
  ],
  "text_annotation_areas": [
    {
      "description": "Brief description",
      "annotation_type": "room_labels" | "technical_notes" | "legend" | "title_block" | "general_labels",
      "bounding_box": { "x_min_percent": number, "y_min_percent": number, "x_max_percent": number, "y_max_percent": number },
      "confidence": number (0-1)
    }
  ],
  "drawing_metadata": {
    "drawing_type": "floor_plan" | "elevation" | "section" | "site_plan" | "detail" | "unknown",
    "scale_indicator": "string or null",
    "orientation": "horizontal" | "vertical" | "unknown",
    "quality": "high" | "medium" | "low",
    "complexity": "simple" | "moderate" | "complex"
  },
  "analysis_summary": "string"
}

Use ONLY the specified enum values. Do not add descriptive text to enum fields.`;

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
  const jsonText = response.text();

  try {
    const parsedOutput = JSON.parse(jsonText);
    return GlobalAnalysisOutputSchema.parse(parsedOutput);
  } catch (error) {
    console.error('Failed to parse global analysis output:', error);
    console.error('Raw response:', jsonText);
    throw new Error('Invalid output from Global Analyzer Agent');
  }
}

/**
 * Create the Global Analyzer Agent with Mastra
 * This agent can be used in workflows for the first-pass analysis
 */
export function createGlobalAnalyzerAgent(): Agent {
  return new Agent({
    name: 'GlobalAnalyzer',
    instructions: `You are an expert architectural drawing analyzer specializing in floor plans and construction documents.

Your PRIMARY TASK is to perform initial reconnaissance of architectural drawings to identify major regions and zones.

You excel at:
- Distinguishing the main building area from dimensions, annotations, and borders
- Identifying where dimension text is located (top, bottom, sides, or within the drawing)
- Recognizing different types of text annotations (room labels, technical notes, legends)
- Assessing drawing quality, scale, and complexity
- Providing strategic guidance for subsequent detailed analysis

You provide structured output with bounding boxes in percentage coordinates, making your analysis resolution-independent and easy to use for cropping and region-specific processing.

Your analysis enables subsequent agents to focus on specific regions without confusion or wasted effort.`,
    model: {
      provider: 'GOOGLE',
      name: 'gemini-2.5-flash',
      toolChoice: 'auto',
    },
  });
}
