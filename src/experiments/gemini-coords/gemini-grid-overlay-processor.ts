import { geminiClient } from '../../lib/gemini-client.js';
import { db, extractionResults } from '../../db/index.js';
import sharp from 'sharp';
import { percentageToBbox } from '../../utils/bbox-estimator.js';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';

/**
 * EXPERIMENTAL: Grid Overlay Processor
 *
 * Strategy:
 * 1. Draw a transparent coordinate grid on the image (like graph paper)
 * 2. Label grid axes: A-T (columns), 1-20 (rows)
 * 3. Ask Gemini to provide text + grid cell reference + orientation
 * 4. Convert grid cells to pixel coordinates
 *
 * This tests whether a visual coordinate system helps Gemini
 * provide more accurate location information.
 */

/**
 * Generate column label for grid (supports >26 columns)
 * 0 -> A, 25 -> Z, 26 -> AA, 51 -> AZ, 52 -> BA, etc.
 */
function getColumnLabel(index: number): string {
  if (index < 26) {
    return String.fromCharCode(65 + index);
  }
  const firstLetter = String.fromCharCode(65 + Math.floor(index / 26) - 1);
  const secondLetter = String.fromCharCode(65 + (index % 26));
  return firstLetter + secondLetter;
}

/**
 * Parse column label back to index
 * A -> 0, Z -> 25, AA -> 26, AZ -> 51, BA -> 52, etc.
 */
function parseColumnLabel(label: string): number {
  const upper = label.toUpperCase();
  if (upper.length === 1) {
    return upper.charCodeAt(0) - 65;
  }
  const firstChar = upper.charCodeAt(0) - 65 + 1;
  const secondChar = upper.charCodeAt(1) - 65;
  return firstChar * 26 + secondChar;
}

interface GridConfig {
  rows: number;
  cols: number;
  opacity: number; // 0-1
  color: { r: number; g: number; b: number };
}

const DEFAULT_GRID: GridConfig = {
  rows: 20,
  cols: 20,
  opacity: 0.15, // 15% opacity - visible but not intrusive
  color: { r: 128, g: 128, b: 128 }, // Gray
};

/**
 * Draw a grid overlay on an image
 */
async function drawGridOverlay(
  imagePath: string,
  gridConfig: GridConfig = DEFAULT_GRID
): Promise<{ path: string; width: number; height: number }> {
  const image = sharp(imagePath);
  const metadata = await image.metadata();
  const width = metadata.width || 1000;
  const height = metadata.height || 1000;

  const cellWidth = width / gridConfig.cols;
  const cellHeight = height / gridConfig.rows;

  let gridSvg = `<svg width="${width}" height="${height}" xmlns="http://www.w3.org/2000/svg">`;

  for (let i = 0; i <= gridConfig.cols; i++) {
    const x = i * cellWidth;
    gridSvg += `<line x1="${x}" y1="0" x2="${x}" y2="${height}" stroke="rgb(${gridConfig.color.r},${gridConfig.color.g},${gridConfig.color.b})" stroke-width="1" opacity="${gridConfig.opacity}" />`;
  }

  for (let i = 0; i <= gridConfig.rows; i++) {
    const y = i * cellHeight;
    gridSvg += `<line x1="0" y1="${y}" x2="${width}" y2="${y}" stroke="rgb(${gridConfig.color.r},${gridConfig.color.g},${gridConfig.color.b})" stroke-width="1" opacity="${gridConfig.opacity}" />`;
  }

  const fontSize = Math.min(cellWidth, cellHeight) * 0.3;
  for (let i = 0; i < gridConfig.cols; i++) {
    const x = i * cellWidth + cellWidth / 2;
    const label = getColumnLabel(i);
    gridSvg += `<text x="${x}" y="${fontSize}" text-anchor="middle" fill="rgb(${gridConfig.color.r},${gridConfig.color.g},${gridConfig.color.b})" font-size="${fontSize}" opacity="${gridConfig.opacity * 1.5}">${label}</text>`;
  }

  for (let i = 0; i < gridConfig.rows; i++) {
    const y = i * cellHeight + cellHeight / 2 + fontSize / 3;
    const label = (i + 1).toString();
    gridSvg += `<text x="${fontSize / 2}" y="${y}" text-anchor="start" fill="rgb(${gridConfig.color.r},${gridConfig.color.g},${gridConfig.color.b})" font-size="${fontSize}" opacity="${gridConfig.opacity * 1.5}">${label}</text>`;
  }

  gridSvg += '</svg>';

  const gridBuffer = Buffer.from(gridSvg);
  const outputPath = path.join(os.tmpdir(), `grid-overlay-${Date.now()}.png`);

  await image
    .composite([
      {
        input: gridBuffer,
        top: 0,
        left: 0,
      },
    ])
    .toFile(outputPath);

  return { path: outputPath, width, height };
}

/**
 * Parse grid cell reference to coordinates
 * Example: "E5" → column 4 (E), row 4 (5-1) → pixel coordinates
 * Supports multi-letter columns: "AA5", "BA10", etc.
 */
function gridCellToCoordinates(
  cell: string,
  gridConfig: GridConfig,
  imageWidth: number,
  imageHeight: number
): { x: number; y: number } | null {
  const match = cell
    .trim()
    .toUpperCase()
    .match(/^([A-Z]+)(\d+)$/);
  if (!match) return null;

  const col = parseColumnLabel(match[1]);
  const row = parseInt(match[2]) - 1; // 1-based to 0-based

  if (col < 0 || col >= gridConfig.cols || row < 0 || row >= gridConfig.rows) {
    return null;
  }

  const cellWidth = imageWidth / gridConfig.cols;
  const cellHeight = imageHeight / gridConfig.rows;

  return {
    x: col * cellWidth + cellWidth / 2,
    y: row * cellHeight + cellHeight / 2,
  };
}

export async function processWithGeminiGridOverlay(
  imagePath: string,
  drawingId: string
) {
  console.log(`  EXPERIMENT: Grid Overlay Processor`);
  const startTime = Date.now();

  let gridImagePath: string | null = null;

  try {
    console.log(
      `  Drawing ${DEFAULT_GRID.rows}x${DEFAULT_GRID.cols} grid overlay...`
    );
    const gridImage = await drawGridOverlay(imagePath, DEFAULT_GRID);
    gridImagePath = gridImage.path;

    console.log(`  Grid created: ${gridImage.width}x${gridImage.height}px`);

    const gridLabels = Array.from({ length: DEFAULT_GRID.cols }, (_, i) =>
      getColumnLabel(i)
    ).join(', ');

    const prompt = `This image has a coordinate grid overlay with ${DEFAULT_GRID.rows} rows and ${DEFAULT_GRID.cols} columns.

GRID SYSTEM:
- Columns are labeled: ${gridLabels}
- Rows are labeled: 1-${DEFAULT_GRID.rows}
- Each cell is referenced like "E5" (column E, row 5)

TASK:
Extract all visible text and provide the grid cell where each text is located AND its orientation.

FORMAT:
TEXT|GRID_CELL|ORIENTATION

ORIENTATION:
- H: horizontal text (left-to-right)
- V: vertical text (rotated 90° counterclockwise, bottom-to-top)

EXAMPLES:
配筋図|E5|H
3500mm|J12|H
浴室|C18|H
1255|B8|V
910|A5|V

RULES:
- One text per line
- Use pipe | to separate text, cell, and orientation
- Provide the cell where the text CENTER is located
- Extract ALL visible text (both horizontal AND vertical)
- Pay special attention to vertical text on the left and right margins
- NO explanations, NO comments, JUST the formatted data`;

    console.log(`  Sending grid image to Gemini (this may take 30-60s)...`);

    const timeoutMs = 90000; // 90 seconds
    const timeoutPromise = new Promise((_, reject) =>
      setTimeout(
        () => reject(new Error('Gemini API timeout after 90s')),
        timeoutMs
      )
    );

    const response = (await Promise.race([
      geminiClient.extractWithCustomPrompt(gridImagePath, prompt),
      timeoutPromise,
    ])) as string;

    console.log(`  Gemini response received`);
    console.log(`  Response preview: ${response.substring(0, 200)}...`);

    const lines = response.split('\n');
    const parsedEntries: Array<{
      text: string;
      gridCell: string;
      coordinates: { x: number; y: number } | null;
      orientation: 'H' | 'V';
    }> = [];

    for (const line of lines) {
      const trimmed = line.trim();
      if (!trimmed) continue;

      const parts = trimmed.split('|');
      if (parts.length >= 2) {
        const text = parts[0].trim();
        const gridCell = parts[1].trim();
        const orientation = parts[2]?.trim().toUpperCase() === 'V' ? 'V' : 'H';
        const coordinates = gridCellToCoordinates(
          gridCell,
          DEFAULT_GRID,
          gridImage.width,
          gridImage.height
        );

        if (text && coordinates) {
          parsedEntries.push({ text, gridCell, coordinates, orientation });
        }
      }
    }

    console.log(
      `  Parsed ${parsedEntries.length} entries with grid coordinates`
    );

    const boundingBoxes = parsedEntries.map((entry) => {
      const charWidth = gridImage.width / DEFAULT_GRID.cols / 5; // Approx 5 chars per cell
      const charHeight = gridImage.height / DEFAULT_GRID.rows / 3;

      let width: number;
      let height: number;

      if (entry.orientation === 'V') {
        width = charHeight * 1.5;
        height = entry.text.length * charWidth;
      } else {
        width = entry.text.length * charWidth;
        height = charHeight * 1.5;
      }

      const x = entry.coordinates!.x - width / 2;
      const y = entry.coordinates!.y - height / 2;

      return {
        text: entry.text,
        bounds: [
          { x, y },
          { x: x + width, y },
          { x: x + width, y: y + height },
          { x, y: y + height },
        ],
        confidence: 0.7,
        bboxSource: 'gemini-percentage' as const,
        metadata: {
          gridCell: entry.gridCell,
          gridCoordinates: entry.coordinates,
          orientation: entry.orientation,
        },
      };
    });

    const fullText = parsedEntries.map((e) => e.text).join('\n');

    const processingTime = Date.now() - startTime;
    const geminiCost = geminiClient.estimateCost(1);

    const [dbResult] = await db
      .insert(extractionResults)
      .values({
        drawingId,
        tool: 'exp-gemini-grid-overlay',
        rawText: fullText,
        boundingBoxes,
        processingTimeMs: processingTime,
        apiCost: geminiCost,
        metadata: {
          experiment: true,
          approach: 'grid-overlay',
          gridConfig: DEFAULT_GRID,
          parsedEntries: parsedEntries.length,
          note: 'Uses grid overlay to help Gemini provide location references',
        },
      })
      .returning();

    console.log(
      `  Grid Overlay completed in ${(processingTime / 1000).toFixed(2)}s`
    );
    console.log(
      `     Extracted ${boundingBoxes.length} text elements with grid references`
    );

    return {
      success: true,
      extractionResultId: dbResult.id,
      tool: 'exp-gemini-grid-overlay',
      rawText: fullText,
      boundingBoxes,
      processingTime,
      cost: geminiCost,
    };
  } catch (error) {
    console.error(`  Grid Overlay failed:`, error);
    throw error;
  } finally {
    if (gridImagePath && fs.existsSync(gridImagePath)) {
      try {
        fs.unlinkSync(gridImagePath);
      } catch (err) {
        console.warn(
          `  Could not delete temporary grid image: ${gridImagePath}`
        );
      }
    }
  }
}
