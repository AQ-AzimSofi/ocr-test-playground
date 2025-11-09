import { geminiClient } from '../lib/gemini-client.js';
import { db, extractionResults } from '../db/index.js';
import sharp from 'sharp';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';

/**
 * Grid Overlay Processor with configurable grid size
 *
 * Strategy:
 * 1. Draw a transparent coordinate grid on the image
 * 2. Label grid axes with column/row labels
 * 3. Ask Gemini to provide text + grid cell reference + orientation
 * 4. Convert grid cells to pixel coordinates
 *
 * Supported grid sizes: 20x20 (5%), 40x40 (2.5%), 80x80 (1.25%), 100x100 (1%)
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
  opacity: number;
  color: { r: number; g: number; b: number };
}

/**
 * Predefined grid configurations
 */
const GRID_PRESETS: Record<
  string,
  { config: GridConfig; precision: string; description: string }
> = {
  '20x20': {
    config: { rows: 20, cols: 20, opacity: 0.15, color: { r: 128, g: 128, b: 128 } },
    precision: '5%',
    description: 'Fast, lower precision',
  },
  '40x40': {
    config: { rows: 40, cols: 40, opacity: 0.1, color: { r: 128, g: 128, b: 128 } },
    precision: '2.5%',
    description: 'Balanced precision',
  },
  '80x80': {
    config: { rows: 80, cols: 80, opacity: 0.07, color: { r: 128, g: 128, b: 128 } },
    precision: '1.25%',
    description: 'High precision',
  },
  '100x100': {
    config: { rows: 100, cols: 100, opacity: 0.05, color: { r: 128, g: 128, b: 128 } },
    precision: '1%',
    description: 'Maximum precision',
  },
};

/**
 * Draw a grid overlay on an image
 */
async function drawGridOverlay(
  imagePath: string,
  gridConfig: GridConfig,
  gridSize: string
): Promise<{ path: string; width: number; height: number }> {
  const image = sharp(imagePath);
  const metadata = await image.metadata();
  const width = metadata.width || 1000;
  const height = metadata.height || 1000;

  const cellWidth = width / gridConfig.cols;
  const cellHeight = height / gridConfig.rows;

  let gridSvg = `<svg width="${width}" height="${height}" xmlns="http://www.w3.org/2000/svg">`;

  // Draw vertical lines
  for (let i = 0; i <= gridConfig.cols; i++) {
    const x = i * cellWidth;
    gridSvg += `<line x1="${x}" y1="0" x2="${x}" y2="${height}" stroke="rgb(${gridConfig.color.r},${gridConfig.color.g},${gridConfig.color.b})" stroke-width="1" opacity="${gridConfig.opacity}" />`;
  }

  // Draw horizontal lines
  for (let i = 0; i <= gridConfig.rows; i++) {
    const y = i * cellHeight;
    gridSvg += `<line x1="0" y1="${y}" x2="${width}" y2="${y}" stroke="rgb(${gridConfig.color.r},${gridConfig.color.g},${gridConfig.color.b})" stroke-width="1" opacity="${gridConfig.opacity}" />`;
  }

  // Add column labels
  const fontSize = Math.min(cellWidth, cellHeight) * 0.3;
  for (let i = 0; i < gridConfig.cols; i++) {
    const x = i * cellWidth + cellWidth / 2;
    const label = getColumnLabel(i);
    gridSvg += `<text x="${x}" y="${fontSize}" text-anchor="middle" fill="rgb(${gridConfig.color.r},${gridConfig.color.g},${gridConfig.color.b})" font-size="${fontSize}" opacity="${gridConfig.opacity * 1.5}">${label}</text>`;
  }

  // Add row labels
  for (let i = 0; i < gridConfig.rows; i++) {
    const y = i * cellHeight + cellHeight / 2 + fontSize / 3;
    const label = (i + 1).toString();
    gridSvg += `<text x="${fontSize / 2}" y="${y}" text-anchor="start" fill="rgb(${gridConfig.color.r},${gridConfig.color.g},${gridConfig.color.b})" font-size="${fontSize}" opacity="${gridConfig.opacity * 1.5}">${label}</text>`;
  }

  gridSvg += '</svg>';

  const gridBuffer = Buffer.from(gridSvg);
  const outputPath = path.join(
    os.tmpdir(),
    `grid-overlay-${gridSize}-${Date.now()}.png`
  );

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
  const row = parseInt(match[2]) - 1;

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

/**
 * Process image with configurable grid overlay
 * @param imagePath Path to the image to process
 * @param drawingId Drawing identifier
 * @param gridSize Grid size preset: '20x20', '40x40', '80x80', or '100x100'
 */
export async function processWithGeminiGridOverlay(
  imagePath: string,
  drawingId: string,
  gridSize: '20x20' | '40x40' | '80x80' | '100x100' = '40x40'
) {
  const preset = GRID_PRESETS[gridSize];
  if (!preset) {
    throw new Error(
      `Invalid grid size: ${gridSize}. Must be one of: 20x20, 40x40, 80x80, 100x100`
    );
  }

  const gridConfig = preset.config;

  console.log(
    `  Processing with Grid Overlay ${gridSize} (${preset.precision} precision)...`
  );
  const startTime = Date.now();

  let gridImagePath: string | null = null;

  try {
    console.log(
      `  Drawing ${gridConfig.rows}x${gridConfig.cols} grid overlay...`
    );
    const gridImage = await drawGridOverlay(imagePath, gridConfig, gridSize);
    gridImagePath = gridImage.path;

    console.log(`  Grid created: ${gridImage.width}x${gridImage.height}px`);

    const gridLabels = Array.from({ length: gridConfig.cols }, (_, i) =>
      getColumnLabel(i)
    ).join(', ');

    const prompt = `This image has a coordinate grid overlay with ${gridConfig.rows} rows and ${gridConfig.cols} columns.

GRID SYSTEM:
- Columns are labeled: ${gridLabels}
- Rows are labeled: 1-${gridConfig.rows}
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

    const timeoutMs = 90000;
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
          gridConfig,
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

    // Convert to bounding boxes (orientation-aware)
    const boundingBoxes = parsedEntries.map((entry) => {
      const charWidth = gridImage.width / gridConfig.cols / 5;
      const charHeight = gridImage.height / gridConfig.rows / 3;

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
        bboxSource: 'gemini-grid' as const,
        metadata: {
          gridCell: entry.gridCell,
          gridCoordinates: entry.coordinates,
          orientation: entry.orientation,
          gridSize,
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
        tool: `gemini-grid-${gridSize}`,
        rawText: fullText,
        boundingBoxes,
        processingTimeMs: processingTime,
        apiCost: geminiCost,
        metadata: {
          approach: 'grid-overlay',
          gridConfig,
          gridSize,
          precision: preset.precision,
          parsedEntries: parsedEntries.length,
          orientationSupport: true,
        },
      })
      .returning();

    console.log(
      `  Grid ${gridSize} completed in ${(processingTime / 1000).toFixed(2)}s`
    );
    console.log(`  Extracted ${boundingBoxes.length} text elements`);

    return {
      success: true,
      extractionResultId: dbResult.id,
      tool: `gemini-grid-${gridSize}`,
      rawText: fullText,
      boundingBoxes,
      processingTime,
      cost: geminiCost,
    };
  } catch (error) {
    console.error(`  Grid ${gridSize} failed:`, error);
    throw error;
  } finally {
    if (gridImagePath && fs.existsSync(gridImagePath)) {
      try {
        fs.unlinkSync(gridImagePath);
      } catch (err) {
        // Ignore cleanup errors
      }
    }
  }
}
