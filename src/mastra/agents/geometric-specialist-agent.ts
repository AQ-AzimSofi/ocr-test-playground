import { Agent } from '@mastra/core';
import { GoogleGenerativeAI } from '@google/generative-ai';
import { z } from 'zod';
import * as fs from 'fs';
import * as dotenv from 'dotenv';

dotenv.config({ path: '.env.development' });

/**
 * Geometric Specialist Agent
 *
 * Focused expert on detecting structural and architectural elements in floor plans:
 * - Walls (exterior and interior)
 * - Doors (hinged, sliding, folding)
 * - Windows
 * - Rooms (boundaries and labels)
 * - Stairs
 * - Columns
 *
 * Returns precise pixel coordinates and inferred properties for each element.
 * Works best when given a focused region (from Global Analyzer) to reduce noise.
 */

// Element schemas
const PointSchema = z.object({
  x: z.number(),
  y: z.number(),
});

const WallSchema = z.object({
  element_type: z.literal('wall'),
  wall_type: z.enum(['exterior', 'interior', 'structural', 'partition', 'unknown']),
  start_point: PointSchema,
  end_point: PointSchema,
  thickness_px: z.number().nullable(),
  height_mm: z.number().nullable(),
  material: z.string().nullable(),
  confidence: z.number().min(0).max(1),
});

const DoorSchema = z.object({
  element_type: z.literal('door'),
  door_type: z.enum(['hinged', 'sliding', 'folding', 'double', 'revolving', 'unknown']),
  center_point: PointSchema,
  width_px: z.number(),
  swing_direction: z.enum(['left', 'right', 'both', 'none', 'unknown']).nullable(),
  opening_angle_degrees: z.number().nullable(),
  associated_wall_hint: z.string().nullable(),
  confidence: z.number().min(0).max(1),
});

const WindowSchema = z.object({
  element_type: z.literal('window'),
  window_type: z.enum(['fixed', 'casement', 'sliding', 'bay', 'picture', 'unknown']),
  center_point: PointSchema,
  width_px: z.number(),
  height_px: z.number().nullable(),
  sill_height_mm: z.number().nullable(),
  associated_wall_hint: z.string().nullable(),
  confidence: z.number().min(0).max(1),
});

const RoomSchema = z.object({
  element_type: z.literal('room'),
  room_label: z.string().nullable(),
  boundary_polygon: z.array(PointSchema),
  approximate_center: PointSchema,
  room_type: z.enum(['bedroom', 'bathroom', 'kitchen', 'living', 'dining', 'hallway', 'storage', 'utility', 'unknown']).nullable(),
  confidence: z.number().min(0).max(1),
});

const StairSchema = z.object({
  element_type: z.literal('stair'),
  start_point: PointSchema,
  end_point: PointSchema,
  direction: z.enum(['up', 'down', 'unknown']),
  step_count: z.number().nullable(),
  width_px: z.number().nullable(),
  confidence: z.number().min(0).max(1),
});

const ColumnSchema = z.object({
  element_type: z.literal('column'),
  center_point: PointSchema,
  shape: z.enum(['rectangular', 'circular', 'irregular', 'unknown']),
  width_px: z.number().nullable(),
  depth_px: z.number().nullable(),
  confidence: z.number().min(0).max(1),
});

const GeometricElementSchema = z.discriminatedUnion('element_type', [
  WallSchema,
  DoorSchema,
  WindowSchema,
  RoomSchema,
  StairSchema,
  ColumnSchema,
]);

export const GeometricAnalysisOutputSchema = z.object({
  image_dimensions: z.object({
    width_px: z.number(),
    height_px: z.number(),
  }),
  elements: z.array(GeometricElementSchema),
  detection_summary: z.object({
    total_elements: z.number(),
    walls_count: z.number(),
    doors_count: z.number(),
    windows_count: z.number(),
    rooms_count: z.number(),
    stairs_count: z.number(),
    columns_count: z.number(),
  }),
  analysis_notes: z.string(),
});

export type GeometricAnalysisOutput = z.infer<typeof GeometricAnalysisOutputSchema>;
export type GeometricElement = z.infer<typeof GeometricElementSchema>;

/**
 * Analyzes a floor plan image and detects all geometric elements with precise coordinates
 */
export async function detectGeometricElements(
  imagePath: string,
  focusRegion?: { x_min_percent: number; y_min_percent: number; x_max_percent: number; y_max_percent: number }
): Promise<GeometricAnalysisOutput> {
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

  const focusInstruction = focusRegion
    ? `\nFOCUS REGION: Concentrate your analysis on the region between ${focusRegion.x_min_percent}%-${focusRegion.x_max_percent}% horizontally and ${focusRegion.y_min_percent}%-${focusRegion.y_max_percent}% vertically. This is the main building area. Ignore elements outside this region.`
    : '';

  const prompt = `You are an expert architectural element detector specializing in floor plans. Your task is to identify and precisely locate all structural and architectural elements in this drawing.

TASK: Detect all geometric elements and provide their exact pixel coordinates.
${focusInstruction}

ELEMENTS TO DETECT:

1. **WALLS**
   - Identify all wall lines (exterior and interior)
   - Provide start_point (x, y) and end_point (x, y) in pixels
   - Classify as: exterior, interior, structural, partition, or unknown
   - Estimate thickness in pixels if visible
   - Default height: 2700mm for interior, 3000mm for exterior (unless you see indication otherwise)

2. **DOORS**
   - Detect door symbols (arc for hinged, straight lines for sliding)
   - Provide center_point (x, y) in pixels where the door is located
   - Measure width in pixels
   - Identify door type and swing direction if visible
   - Opening angle (usually 90 degrees for hinged doors)

3. **WINDOWS**
   - Detect window symbols (typically shown as openings with glazing lines)
   - Provide center_point (x, y) in pixels
   - Measure width and height in pixels
   - Identify window type if clear
   - Default sill height: 900mm (unless indicated otherwise)

4. **ROOMS**
   - Identify enclosed spaces
   - Provide boundary_polygon as array of points (clockwise from top-left)
   - Calculate approximate_center point
   - Extract room_label if visible (e.g., "浴室", "LDK", "寝室")
   - Classify room type based on label or characteristics

5. **STAIRS**
   - Detect staircase symbols (parallel lines indicating steps)
   - Provide start_point and end_point
   - Determine direction (up/down) based on arrow or convention
   - Count steps if clearly visible

6. **COLUMNS**
   - Identify structural columns (shown as filled rectangles or circles)
   - Provide center_point
   - Determine shape (rectangular, circular, irregular)
   - Measure dimensions in pixels

CRITICAL REQUIREMENTS:
- All coordinates must be in PIXELS from top-left origin (0, 0)
- Measure the image dimensions and provide them in the output
- Provide confidence scores (0-1) for each element based on clarity
- In analysis_notes, mention any detection challenges or ambiguities

ACCURACY TIPS:
- Walls are typically represented by parallel lines (double lines)
- Doors often have arc symbols showing swing radius
- Windows usually have additional symbols showing glazing or frame
- Room labels are typically centered in the space
- Be precise with coordinates - they will be used for Revit model generation

RESPONSE FORMAT - EXACT JSON STRUCTURE REQUIRED:
{
  "image_dimensions": {
    "width_px": number,
    "height_px": number
  },
  "elements": [
    {
      "element_type": "wall",
      "wall_type": "exterior" | "interior" | "structural" | "partition" | "unknown",
      "start_point": { "x": number, "y": number },
      "end_point": { "x": number, "y": number },
      "thickness_px": number | null,
      "height_mm": number | null,
      "material": string | null,
      "confidence": number (0-1)
    },
    {
      "element_type": "door",
      "door_type": "hinged" | "sliding" | "folding" | "double" | "revolving" | "unknown",
      "center_point": { "x": number, "y": number },
      "width_px": number,
      "swing_direction": "left" | "right" | "both" | "none" | "unknown" | null,
      "opening_angle_degrees": number | null,
      "associated_wall_hint": string | null,
      "confidence": number (0-1)
    },
    {
      "element_type": "window",
      "window_type": "fixed" | "casement" | "sliding" | "bay" | "picture" | "unknown",
      "center_point": { "x": number, "y": number },
      "width_px": number,
      "height_px": number | null,
      "sill_height_mm": number | null,
      "associated_wall_hint": string | null,
      "confidence": number (0-1)
    },
    {
      "element_type": "room",
      "room_label": string | null,
      "boundary_polygon": [{ "x": number, "y": number }, ...],
      "approximate_center": { "x": number, "y": number },
      "room_type": "bedroom" | "bathroom" | "kitchen" | "living" | "dining" | "hallway" | "storage" | "utility" | "unknown" | null,
      "confidence": number (0-1)
    }
    // Include stairs and columns similarly
  ],
  "detection_summary": {
    "total_elements": number,
    "walls_count": number,
    "doors_count": number,
    "windows_count": number,
    "rooms_count": number,
    "stairs_count": number,
    "columns_count": number
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

    // Transform AI output to match our schema (handle common variations)
    const transformed = transformGeometricOutput(parsedOutput);

    return GeometricAnalysisOutputSchema.parse(transformed);
  } catch (error) {
    console.error('Failed to parse geometric analysis output:', error);
    console.error('Raw response:', jsonText);
    throw new Error('Invalid output from Geometric Specialist Agent');
  }
}

/**
 * Transform AI output to match expected schema
 * Handles common variations in field names and structure
 */
function transformGeometricOutput(raw: any): any {
  // Helper function to normalize swing_direction enum
  const normalizeSwingDirection = (value: string | null): string | null => {
    if (!value) return null;
    const normalized = value.toLowerCase();

    // Map invalid values to valid ones
    const validDirections = ['left', 'right', 'both', 'none', 'unknown'];
    if (validDirections.includes(normalized)) {
      return normalized;
    }

    // Map common invalid values
    if (['up', 'down', 'upward', 'downward'].includes(normalized)) {
      return 'unknown';
    }

    return 'unknown';
  };

  // Helper function to normalize room_type enum
  const normalizeRoomType = (value: string | null): string | null => {
    if (!value) return null;
    const normalized = value.toLowerCase();

    const validTypes = ['bedroom', 'bathroom', 'kitchen', 'living', 'dining', 'hallway', 'storage', 'utility', 'unknown'];
    if (validTypes.includes(normalized)) {
      return normalized;
    }

    // Map common invalid values
    if (['outdoor', 'porch', 'terrace', 'balcony', 'deck', 'patio'].includes(normalized)) {
      return 'unknown';
    }

    return 'unknown';
  };

  const transformed: any = {
    image_dimensions: {
      width_px: raw.image_dimensions?.width_px || raw.image_dimensions?.width || 0,
      height_px: raw.image_dimensions?.height_px || raw.image_dimensions?.height || 0,
    },
    elements: [],
    detection_summary: {
      total_elements: 0,
      walls_count: 0,
      doors_count: 0,
      windows_count: 0,
      rooms_count: 0,
      stairs_count: 0,
      columns_count: 0,
    },
    analysis_notes: raw.analysis_notes || '',
  };

  // Handle different element array structures
  let elementsArray: any[] = [];

  if (Array.isArray(raw.elements)) {
    // Already a flat array - but validate element_type and normalize enums
    elementsArray = raw.elements
      .filter((e: any) => {
        const validTypes = ['wall', 'door', 'window', 'room', 'stair', 'column'];
        return e.element_type && validTypes.includes(e.element_type);
      })
      .map((e: any) => {
        // Normalize enum values based on element type
        if (e.element_type === 'door' && e.swing_direction) {
          e.swing_direction = normalizeSwingDirection(e.swing_direction);
        }
        if (e.element_type === 'room' && e.room_type) {
          e.room_type = normalizeRoomType(e.room_type);
        }

        // Handle circular columns: convert diameter to width/depth
        if (e.element_type === 'column') {
          if (e.shape === 'circular' && e.dimensions_px?.diameter && !e.width_px && !e.depth_px) {
            e.width_px = e.dimensions_px.diameter;
            e.depth_px = e.dimensions_px.diameter;
          } else if (!e.width_px || !e.depth_px) {
            // Provide default values if missing
            e.width_px = e.width_px || e.dimensions_px?.width || 10;
            e.depth_px = e.depth_px || e.dimensions_px?.depth || 10;
          }
        }

        return e;
      });
  } else if (raw.detected_elements) {
    // Elements grouped by type (walls, doors, windows, etc.)
    const grouped = raw.detected_elements;

    // Convert walls
    if (Array.isArray(grouped.walls)) {
      elementsArray.push(...grouped.walls.map((w: any) => ({
        element_type: 'wall',
        wall_type: w.classification || w.wall_type || 'unknown',
        start_point: w.start_point || { x: 0, y: 0 },
        end_point: w.end_point || { x: 0, y: 0 },
        thickness_px: w.thickness_pixels || w.thickness_px || null,
        height_mm: w.height_mm || null,
        material: w.material || null,
        confidence: w.confidence || 0.5,
      })));
    }

    // Convert doors
    if (Array.isArray(grouped.doors)) {
      elementsArray.push(...grouped.doors.map((d: any) => ({
        element_type: 'door',
        door_type: d.type || d.door_type || 'unknown',
        center_point: d.center_point || d.position || { x: 0, y: 0 },
        width_px: d.width_pixels || d.width_px || d.width || 0,
        swing_direction: d.swing_direction || null,
        opening_angle_degrees: d.opening_angle_degrees || d.opening_angle || null,
        associated_wall_hint: d.associated_wall_hint || null,
        confidence: d.confidence || 0.5,
      })));
    }

    // Convert windows
    if (Array.isArray(grouped.windows)) {
      elementsArray.push(...grouped.windows.map((w: any) => ({
        element_type: 'window',
        window_type: w.type || w.window_type || 'unknown',
        center_point: w.center_point || w.position || { x: 0, y: 0 },
        width_px: w.width_pixels || w.width_px || w.width || 0,
        height_px: w.height_pixels || w.height_px || w.height || null,
        sill_height_mm: w.sill_height_mm || null,
        associated_wall_hint: w.associated_wall_hint || null,
        confidence: w.confidence || 0.5,
      })));
    }

    // Convert rooms
    if (Array.isArray(grouped.rooms)) {
      elementsArray.push(...grouped.rooms.map((r: any) => ({
        element_type: 'room',
        room_label: r.label || r.room_label || r.name || null,
        boundary_polygon: r.boundary_polygon || r.boundary || [],
        approximate_center: r.approximate_center || r.center || { x: 0, y: 0 },
        room_type: r.room_type || r.type || null,
        confidence: r.confidence || 0.5,
      })));
    }
  }

  transformed.elements = elementsArray;

  // Calculate detection summary
  transformed.detection_summary.total_elements = elementsArray.length;
  transformed.detection_summary.walls_count = elementsArray.filter((e: any) => e.element_type === 'wall').length;
  transformed.detection_summary.doors_count = elementsArray.filter((e: any) => e.element_type === 'door').length;
  transformed.detection_summary.windows_count = elementsArray.filter((e: any) => e.element_type === 'window').length;
  transformed.detection_summary.rooms_count = elementsArray.filter((e: any) => e.element_type === 'room').length;
  transformed.detection_summary.stairs_count = elementsArray.filter((e: any) => e.element_type === 'stair').length;
  transformed.detection_summary.columns_count = elementsArray.filter((e: any) => e.element_type === 'column').length;

  return transformed;
}

/**
 * Create the Geometric Specialist Agent with Mastra
 */
export function createGeometricSpecialistAgent(): Agent {
  return new Agent({
    name: 'GeometricSpecialist',
    instructions: `You are an expert architectural element detector specializing in floor plans and construction drawings.

Your PRIMARY TASK is to identify and precisely locate all structural and architectural elements:
- Walls (exterior, interior, structural, partitions)
- Doors (hinged, sliding, folding, double)
- Windows (fixed, casement, sliding, bay)
- Rooms (with boundaries and labels)
- Stairs (with direction and step count)
- Columns (structural supports)

You excel at:
- Distinguishing between different line types (walls vs dimensions vs furniture)
- Recognizing architectural symbols (door swings, window symbols, stair arrows)
- Providing precise pixel coordinates for element endpoints and centers
- Estimating dimensions when not explicitly labeled
- Classifying elements by type and subtype
- Assigning confidence scores based on visual clarity

You provide structured output with exact pixel coordinates, making your analysis ready for immediate use in coordinate transformation and Revit model generation.

Your detections are thorough, accurate, and construction-ready.`,
    model: {
      provider: 'GOOGLE',
      name: 'gemini-2.5-flash',
      toolChoice: 'auto',
    },
  });
}
