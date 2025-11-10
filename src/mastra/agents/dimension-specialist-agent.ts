import { Agent } from '@mastra/core';
import { GoogleGenerativeAI } from '@google/generative-ai';
import { z } from 'zod';
import * as fs from 'fs';
import * as dotenv from 'dotenv';

dotenv.config({ path: '.env.development' });

/**
 * Dimension Specialist Agent
 *
 * Expert at extracting dimension text and tracing leader lines to their endpoints.
 * Understands architectural dimensioning conventions and formats.
 *
 * Key capabilities:
 * - Recognizes dimension text in various formats (10,920 / 10920 / 10.920)
 * - Identifies leader lines (dimension lines with tick marks)
 * - Extracts endpoint coordinates of dimension lines
 * - Classifies dimension types (overall, segment, detail)
 * - Handles Japanese and Western measurement notations
 */

const PointSchema = z.object({
  x: z.number(),
  y: z.number(),
});

const DimensionSchema = z.object({
  text: z.string(),
  value_mm: z.number().nullable(), // Parsed numeric value in millimeters
  leader_line: z.object({
    start_point: PointSchema,
    end_point: PointSchema,
    orientation: z.enum(['horizontal', 'vertical', 'diagonal', 'unknown']),
  }).nullable(),
  text_position: PointSchema,
  dimension_type: z.enum(['overall', 'segment', 'detail', 'cumulative', 'radius', 'diameter', 'angular', 'elevation', 'unknown']),
  unit: z.enum(['mm', 'cm', 'm', 'inch', 'feet', 'unknown']).nullable(),
  confidence: z.number().min(0).max(1),
  notes: z.string().nullable(),
});

export const DimensionAnalysisOutputSchema = z.object({
  image_dimensions: z.object({
    width_px: z.number(),
    height_px: z.number(),
  }),
  dimensions: z.array(DimensionSchema),
  scale_indicators: z.array(z.object({
    text: z.string(),
    position: PointSchema,
    parsed_scale: z.string().nullable(), // e.g., "1:100", "1/100"
  })),
  ground_level_markers: z.array(z.object({
    text: z.string(),
    position: PointSchema,
    elevation_mm: z.number().nullable(),
  })),
  summary: z.object({
    total_dimensions: z.number(),
    by_type: z.object({
      overall: z.number(),
      segment: z.number(),
      detail: z.number(),
      cumulative: z.number(),
      other: z.number(),
    }),
    primary_unit: z.enum(['mm', 'cm', 'm', 'inch', 'feet', 'unknown']),
  }),
  analysis_notes: z.string(),
});

export type DimensionAnalysisOutput = z.infer<typeof DimensionAnalysisOutputSchema>;
export type Dimension = z.infer<typeof DimensionSchema>;

/**
 * Extracts all dimension text and leader lines from a floor plan image
 */
export async function extractDimensionsWithLeaderLines(
  imagePath: string,
  focusRegions?: Array<{ x_min_percent: number; y_min_percent: number; x_max_percent: number; y_max_percent: number; zone_type: string }>
): Promise<DimensionAnalysisOutput> {
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

  const focusInstruction = focusRegions && focusRegions.length > 0
    ? `\nFOCUS REGIONS: Concentrate your analysis on these dimension zones:\n${focusRegions.map((r, i) => `  ${i + 1}. ${r.zone_type}: ${r.x_min_percent}%-${r.x_max_percent}% horizontally, ${r.y_min_percent}%-${r.y_max_percent}% vertically`).join('\n')}\nPrioritize dimensions within these zones, but don't miss any dimensions elsewhere.`
    : '';

  const prompt = `You are an expert at reading architectural dimensions from floor plans. Your task is to extract all dimension text and trace their associated leader lines.

TASK: Find every dimension annotation and its corresponding leader line endpoints.
${focusInstruction}

DIMENSION FORMATS TO RECOGNIZE:
- Japanese format: 10,920 (comma as thousands separator)
- Standard format: 10920 (no separator)
- Decimal format: 10.920 (period as decimal)
- With units: 10920mm, 109.2cm, 10.92m
- Cumulative: 1820+1820+910 = 10920
- Special: GL±0, FL+150, 1FL (elevation markers)

DIMENSION TYPES:
1. **Overall dimensions** - Total length/width of building
2. **Segment dimensions** - Individual wall or room dimensions
3. **Detail dimensions** - Small measurements (door widths, window sizes)
4. **Cumulative dimensions** - Running totals (1820+1820+910)
5. **Radius/Diameter** - Circular or curved elements (R1000, φ600)
6. **Angular** - Angles (45°, 90°)
7. **Elevation** - Height markers (GL±0, FL+150)

LEADER LINES:
- Leader lines are the dimension lines with tick marks or arrows
- They connect the dimension text to the actual measurement
- Provide START and END points in pixels (from top-left origin)
- Determine orientation: horizontal, vertical, or diagonal

CRITICAL TASKS:
1. Extract the dimension TEXT exactly as shown
2. Parse the numeric VALUE in millimeters (default unit if not specified)
3. Locate the dimension TEXT POSITION (center of text, in pixels)
4. Trace the LEADER LINE and find its endpoints (the tick marks)
5. Determine ORIENTATION of the dimension line
6. Classify the DIMENSION TYPE
7. Assign CONFIDENCE score based on clarity

SPECIAL ELEMENTS TO FIND:
- **Scale indicators**: Look for "S=1:100", "1/100", "SCALE 1:100", etc.
- **Ground level markers**: "GL±0", "GL+0", "FL±0", "1FL", etc.

COORDINATE SYSTEM:
- All coordinates in PIXELS from top-left origin (0, 0)
- Provide image dimensions (width_px, height_px)

ACCURACY TIPS:
- Dimension text is usually OUTSIDE the building outline
- Leader lines are thin lines with tick marks at endpoints
- Tick marks touch the wall or object being dimensioned
- Multiple dimensions may be stacked (parallel lines)
- Text alignment indicates dimension orientation (horizontal text → horizontal dimension)

RESPONSE FORMAT - EXACT JSON STRUCTURE REQUIRED:
{
  "image_dimensions": {
    "width_px": number,
    "height_px": number
  },
  "dimensions": [
    {
      "text": "string",
      "value_mm": number | null,
      "leader_line": {
        "start_point": { "x": number, "y": number },
        "end_point": { "x": number, "y": number },
        "orientation": "horizontal" | "vertical" | "diagonal" | "unknown"
      } | null,
      "text_position": { "x": number, "y": number },
      "dimension_type": "overall" | "segment" | "detail" | "cumulative" | "radius" | "diameter" | "angular" | "elevation" | "unknown",
      "unit": "mm" | "cm" | "m" | "inch" | "feet" | "unknown" | null,
      "confidence": number (0-1),
      "notes": string | null
    }
  ],
  "scale_indicators": [
    {
      "text": "string",
      "position": { "x": number, "y": number },
      "parsed_scale": string | null
    }
  ],
  "ground_level_markers": [
    {
      "text": "string",
      "position": { "x": number, "y": number },
      "elevation_mm": number | null
    }
  ],
  "summary": {
    "total_dimensions": number,
    "by_type": {
      "overall": number,
      "segment": number,
      "detail": number,
      "cumulative": number,
      "other": number
    },
    "primary_unit": "mm" | "cm" | "m" | "inch" | "feet" | "unknown"
  },
  "analysis_notes": "string"
}

Use ONLY the specified enum values and field names exactly as shown.`;

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
    return DimensionAnalysisOutputSchema.parse(parsedOutput);
  } catch (error) {
    console.error('Failed to parse dimension analysis output:', error);
    console.error('Raw response:', jsonText);
    throw new Error('Invalid output from Dimension Specialist Agent');
  }
}

/**
 * Create the Dimension Specialist Agent with Mastra
 */
export function createDimensionSpecialistAgent(): Agent {
  return new Agent({
    name: 'DimensionSpecialist',
    instructions: `You are an expert at extracting dimensions from architectural drawings.

Your PRIMARY TASK is to find every dimension annotation and trace its leader lines to the endpoints.

You excel at:
- Recognizing dimension text in multiple formats (10,920 / 10920 / 10.920mm)
- Understanding Japanese architectural notation conventions
- Tracing leader lines (dimension lines with tick marks)
- Locating exact pixel coordinates of leader line endpoints
- Parsing numeric values from various formats
- Identifying dimension types (overall, segment, detail, cumulative)
- Finding scale indicators (S=1:100, 1/100)
- Detecting elevation markers (GL±0, FL+150, 1FL)
- Handling stacked dimensions (multiple parallel dimension lines)

You understand that:
- Dimension text is typically outside the main building area
- Leader lines connect text to the measured object
- Tick marks at leader line endpoints touch the wall/object
- Default unit is millimeters (mm) in architectural drawings
- Comma in Japanese numbers is thousands separator (10,920 = ten thousand nine hundred twenty)

You provide structured output with:
- Exact dimension text as shown
- Parsed numeric values in millimeters
- Text position in pixels
- Leader line endpoints in pixels
- Orientation (horizontal/vertical/diagonal)
- Dimension type classification
- Confidence scores

Your extractions enable precise dimension-to-object association and accurate scaling calculations.`,
    model: {
      provider: 'GOOGLE',
      name: 'gemini-2.5-flash',
      toolChoice: 'auto',
    },
  });
}
