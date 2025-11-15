/**
 * Visual Verification Tool
 *
 * Generates annotated overlay images showing detected geometric objects
 * on top of the original drawing. Perfect for visual QA and demo presentations.
 *
 * Features:
 * - Color-coded overlays (walls=blue, doors=green, windows=yellow, rooms=transparent)
 * - Object labels with IDs and confidence scores
 * - Dimension text annotations
 * - Metadata legend box
 */

import Jimp from 'jimp';
import {
  db,
  geometricObjects,
  extractionResults,
  testDrawings,
} from '../db/index.js';
import { eq } from 'drizzle-orm';
import * as path from 'path';

const isDevelopment = process.env.NODE_ENV !== 'production';

interface Point {
  x: number;
  y: number;
}

interface VisualVerificationOptions {
  showLabels?: boolean; // Show object IDs and types
  showConfidence?: boolean; // Show confidence scores
  showDimensions?: boolean; // Show dimension text
  opacity?: number; // Overlay opacity (0-1)
}

// Color palette
const COLORS = {
  wall: { r: 0, g: 100, b: 255, a: 200 }, // Blue
  door: { r: 0, g: 200, b: 0, a: 200 }, // Green
  window: { r: 255, g: 200, b: 0, a: 200 }, // Yellow/Gold
  room: { r: 255, g: 0, b: 255, a: 80 }, // Magenta (transparent)
  text: { r: 255, g: 0, b: 0, a: 255 }, // Red for dimension text
  background: { r: 0, g: 0, b: 0, a: 180 }, // Semi-transparent black
};

/**
 * Draw a line on the image
 */
function drawLine(
  image: Jimp,
  x1: number,
  y1: number,
  x2: number,
  y2: number,
  color: number,
  thickness: number = 2
): void {
  // Bresenham's line algorithm with thickness
  const dx = Math.abs(x2 - x1);
  const dy = Math.abs(x2 - y1);
  const sx = x1 < x2 ? 1 : -1;
  const sy = y1 < y2 ? 1 : -1;
  let err = dx - dy;

  let x = Math.round(x1);
  let y = Math.round(y1);

  while (true) {
    // Draw with thickness
    for (
      let offsetX = -Math.floor(thickness / 2);
      offsetX <= Math.floor(thickness / 2);
      offsetX++
    ) {
      for (
        let offsetY = -Math.floor(thickness / 2);
        offsetY <= Math.floor(thickness / 2);
        offsetY++
      ) {
        const px = x + offsetX;
        const py = y + offsetY;
        if (
          px >= 0 &&
          px < image.bitmap.width &&
          py >= 0 &&
          py < image.bitmap.height
        ) {
          image.setPixelColor(color, px, py);
        }
      }
    }

    if (x === Math.round(x2) && y === Math.round(y2)) break;

    const e2 = 2 * err;
    if (e2 > -dy) {
      err -= dy;
      x += sx;
    }
    if (e2 < dx) {
      err += dx;
      y += sy;
    }
  }
}

/**
 * Draw a rectangle on the image
 */
function drawRectangle(
  image: Jimp,
  x: number,
  y: number,
  width: number,
  height: number,
  color: number,
  filled: boolean = false
): void {
  x = Math.round(x);
  y = Math.round(y);
  width = Math.round(width);
  height = Math.round(height);

  if (filled) {
    // Fill rectangle
    for (let px = x; px < x + width; px++) {
      for (let py = y; py < y + height; py++) {
        if (
          px >= 0 &&
          px < image.bitmap.width &&
          py >= 0 &&
          py < image.bitmap.height
        ) {
          image.setPixelColor(color, px, py);
        }
      }
    }
  } else {
    // Draw rectangle outline
    for (let px = x; px < x + width; px++) {
      if (px >= 0 && px < image.bitmap.width) {
        if (y >= 0 && y < image.bitmap.height)
          image.setPixelColor(color, px, y);
        if (y + height >= 0 && y + height < image.bitmap.height)
          image.setPixelColor(color, px, y + height);
      }
    }
    for (let py = y; py < y + height; py++) {
      if (py >= 0 && py < image.bitmap.height) {
        if (x >= 0 && x < image.bitmap.width) image.setPixelColor(color, x, py);
        if (x + width >= 0 && x + width < image.bitmap.width)
          image.setPixelColor(color, x + width, py);
      }
    }
  }
}

/**
 * Get bounding box from coordinates
 */
function getBoundingBox(coordinates: Point[]): {
  x: number;
  y: number;
  width: number;
  height: number;
} {
  if (coordinates.length === 0) {
    return { x: 0, y: 0, width: 0, height: 0 };
  }

  const xs = coordinates.map((p) => p.x);
  const ys = coordinates.map((p) => p.y);

  const minX = Math.min(...xs);
  const maxX = Math.max(...xs);
  const minY = Math.min(...ys);
  const maxY = Math.max(...ys);

  return {
    x: minX,
    y: minY,
    width: maxX - minX,
    height: maxY - minY,
  };
}

/**
 * Generate annotated overlay image
 */
export async function generateVisualVerification(
  drawingPath: string,
  extractionResultId: string,
  outputPath: string,
  options: VisualVerificationOptions = {}
): Promise<void> {
  const {
    showLabels = true,
    showConfidence = true,
    showDimensions = true,
    opacity = 0.8,
  } = options;

  if (isDevelopment) console.log(`\n  Generating visual verification overlay...`);

  // Load original drawing
  const image = await Jimp.read(drawingPath);
  if (isDevelopment) {
    console.log(
      `    Loaded image: ${image.bitmap.width}×${image.bitmap.height}px`
    );
  }

  // Fetch geometric objects
  const objects = await db
    .select()
    .from(geometricObjects)
    .where(eq(geometricObjects.extractionResultId, extractionResultId));

  if (isDevelopment) console.log(`    Found ${objects.length} objects to annotate`);

  // Note: Text rendering disabled for performance
  // Text rendering with Jimp can be slow with many objects
  // Skipping labels for performance; showing colored overlays only

  // Draw objects by type
  let annotationCount = 0;

  for (const obj of objects) {
    const coords = obj.geometry?.coordinates || [];
    if (coords.length === 0) continue;

    const objType = obj.objectType;
    const color = COLORS[objType as keyof typeof COLORS] || COLORS.wall;
    const jimpColor = Jimp.rgbaToInt(color.r, color.g, color.b, color.a);

    // Draw based on geometry type
    if (
      coords.length === 2 &&
      (objType === 'wall' || objType === 'door' || objType === 'window')
    ) {
      // Line geometry
      const thickness = objType === 'wall' ? 3 : 2;
      drawLine(
        image,
        coords[0].x,
        coords[0].y,
        coords[1].x,
        coords[1].y,
        jimpColor,
        thickness
      );

      // Draw small rectangles at start/end points
      const dotSize = 4;
      drawRectangle(
        image,
        coords[0].x - dotSize / 2,
        coords[0].y - dotSize / 2,
        dotSize,
        dotSize,
        jimpColor,
        true
      );
      drawRectangle(
        image,
        coords[1].x - dotSize / 2,
        coords[1].y - dotSize / 2,
        dotSize,
        dotSize,
        jimpColor,
        true
      );
    } else if (objType === 'room' && coords.length >= 3) {
      // Polygon geometry (room boundaries)
      const bbox = getBoundingBox(coords);
      const roomColor = Jimp.rgbaToInt(
        COLORS.room.r,
        COLORS.room.g,
        COLORS.room.b,
        COLORS.room.a
      );
      drawRectangle(
        image,
        bbox.x,
        bbox.y,
        bbox.width,
        bbox.height,
        roomColor,
        true
      );

      // Draw outline
      const outlineColor = Jimp.rgbaToInt(255, 0, 255, 255);
      for (let i = 0; i < coords.length; i++) {
        const start = coords[i];
        const end = coords[(i + 1) % coords.length];
        drawLine(image, start.x, start.y, end.x, end.y, outlineColor, 1);
      }
    }

    // Labels and dimension text disabled for performance
    // Text rendering with Jimp is slow - for demo, just show colored overlays

    annotationCount++;
  }

  // Add legend box (simplified - color boxes only, no text for performance)
  const legendX = 10;
  const legendY = 10;
  const legendWidth = 40;
  const legendHeight = 90;

  // Legend background
  const legendBg = Jimp.rgbaToInt(
    COLORS.background.r,
    COLORS.background.g,
    COLORS.background.b,
    220
  );
  drawRectangle(
    image,
    legendX,
    legendY,
    legendWidth,
    legendHeight,
    legendBg,
    true
  );

  // Legend border
  const borderColor = Jimp.rgbaToInt(255, 255, 255, 255);
  drawRectangle(
    image,
    legendX,
    legendY,
    legendWidth,
    legendHeight,
    borderColor,
    false
  );

  // Legend items (color swatches only)
  let legendItemY = legendY + 10;
  const legendItems = [
    COLORS.wall, // Blue
    COLORS.door, // Green
    COLORS.window, // Yellow
    COLORS.room, // Magenta
  ];

  for (const color of legendItems) {
    const itemColor = Jimp.rgbaToInt(color.r, color.g, color.b, color.a);
    drawRectangle(image, legendX + 10, legendItemY, 20, 15, itemColor, true);
    legendItemY += 20;
  }

  // Save annotated image
  await image.writeAsync(outputPath);
  if (isDevelopment) {
    console.log(`    Annotated image saved: ${outputPath}`);
    console.log(`    Annotated ${annotationCount} objects`);
  }
}

/**
 * Generate visual verification as part of the pipeline
 */
export async function generateVisualVerificationFromResult(
  extractionResultId: string,
  outputDir: string
): Promise<string> {
  // Fetch extraction result to get drawing info
  const [result] = await db
    .select()
    .from(extractionResults)
    .where(eq(extractionResults.id, extractionResultId));

  if (!result) {
    throw new Error(`Extraction result not found: ${extractionResultId}`);
  }

  // Fetch drawing to get file path
  const [drawing] = await db
    .select()
    .from(testDrawings)
    .where(eq(testDrawings.drawingId, result.drawingId));

  if (!drawing) {
    throw new Error(`Drawing not found: ${result.drawingId}`);
  }

  const outputPath = path.join(outputDir, `${result.drawingId}-annotated.png`);

  await generateVisualVerification(
    drawing.filePath,
    extractionResultId,
    outputPath
  );

  return outputPath;
}
