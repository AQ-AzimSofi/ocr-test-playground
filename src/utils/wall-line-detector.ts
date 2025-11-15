import sharp from 'sharp';
import Jimp from 'jimp';

const isDevelopment = process.env.NODE_ENV !== 'production';

/**
 * OpenCV-style wall line detection utility for floor plans
 * Uses image processing techniques to detect walls, lines, and room boundaries
 */

export interface Line {
  start: { x: number; y: number };
  end: { x: number; y: number };
  length: number;
  angle: number; // in radians
  orientation: 'horizontal' | 'vertical' | 'diagonal';
  thickness?: number; // estimated wall thickness
}

export interface Room {
  id: number;
  bounds: Array<{ x: number; y: number }>;
  center: { x: number; y: number };
  area: number;
}

export interface WallDetectionResult {
  walls: Line[];
  rooms: Room[];
  metadata: {
    image_width: number;
    image_height: number;
    total_lines: number;
    total_rooms: number;
  };
}

export class WallLineDetector {
  private minLineLength: number;
  private maxLineGap: number;
  private wallThicknessThreshold: number;

  constructor(
    minLineLength: number = 50,
    maxLineGap: number = 10,
    wallThicknessThreshold: number = 30
  ) {
    this.minLineLength = minLineLength;
    this.maxLineGap = maxLineGap;
    this.wallThicknessThreshold = wallThicknessThreshold;
  }

  /**
   * Main detection method - analyzes floor plan image
   */
  async detectWalls(imagePath: string): Promise<WallDetectionResult> {
    if (isDevelopment) console.log('  [Wall Line Detector] Loading image...');

    // Load image with Jimp for pixel-level operations
    const image = await Jimp.read(imagePath);
    const width = image.bitmap.width;
    const height = image.bitmap.height;

    if (isDevelopment) console.log(`  [Wall Line Detector] Image size: ${width}x${height}`);

    // Step 1: Preprocess - convert to grayscale and threshold
    if (isDevelopment) console.log('  [Wall Line Detector] Step 1: Preprocessing...');
    const binary = await this.preprocessImage(image);

    // Step 2: Detect lines using Hough-like transform
    if (isDevelopment) console.log('  [Wall Line Detector] Step 2: Detecting lines...');
    const lines = await this.detectLines(binary);

    // Step 3: Filter and classify lines as walls
    if (isDevelopment) console.log('  [Wall Line Detector] Step 3: Filtering walls...');
    const walls = this.filterWalls(lines);

    // Step 4: Detect parallel line pairs (wall thickness)
    if (isDevelopment) console.log('  [Wall Line Detector] Step 4: Detecting wall thickness...');
    const wallsWithThickness = this.detectParallelPairs(walls);

    // Step 5: Detect rooms using connected component analysis
    if (isDevelopment) console.log('  [Wall Line Detector] Step 5: Detecting rooms...');
    const rooms = await this.detectRooms(binary);

    if (isDevelopment) {
      console.log(
        `  [Wall Line Detector] Complete: ${wallsWithThickness.length} walls, ${rooms.length} rooms`
      );
    }

    return {
      walls: wallsWithThickness,
      rooms,
      metadata: {
        image_width: width,
        image_height: height,
        total_lines: lines.length,
        total_rooms: rooms.length,
      },
    };
  }

  /**
   * Preprocess image: grayscale + threshold + edge detection
   */
  private async preprocessImage(image: Jimp): Promise<Jimp> {
    // Convert to grayscale
    image.grayscale();

    // Apply threshold to get binary image (black walls on white background)
    image.contrast(1); // Increase contrast
    image.threshold({ max: 200 }); // Threshold at 200 (walls are darker)

    return image;
  }

  /**
   * Detect lines using edge detection and contour tracing
   */
  private async detectLines(binary: Jimp): Promise<Line[]> {
    const width = binary.bitmap.width;
    const height = binary.bitmap.height;
    const lines: Line[] = [];

    // Scan horizontally for horizontal lines
    for (let y = 0; y < height; y += 2) {
      // Skip every other row for performance
      let lineStart: number | null = null;

      for (let x = 0; x < width; x++) {
        const pixel = Jimp.intToRGBA(binary.getPixelColor(x, y));
        const isBlack = pixel.r < 128;

        if (isBlack && lineStart === null) {
          lineStart = x;
        } else if (!isBlack && lineStart !== null) {
          const lineLength = x - lineStart;
          if (lineLength >= this.minLineLength) {
            lines.push({
              start: { x: lineStart, y },
              end: { x: x - 1, y },
              length: lineLength,
              angle: 0,
              orientation: 'horizontal',
            });
          }
          lineStart = null;
        }
      }

      // Handle line that extends to edge
      if (lineStart !== null) {
        const lineLength = width - lineStart;
        if (lineLength >= this.minLineLength) {
          lines.push({
            start: { x: lineStart, y },
            end: { x: width - 1, y },
            length: lineLength,
            angle: 0,
            orientation: 'horizontal',
          });
        }
      }
    }

    // Scan vertically for vertical lines
    for (let x = 0; x < width; x += 2) {
      // Skip every other column for performance
      let lineStart: number | null = null;

      for (let y = 0; y < height; y++) {
        const pixel = Jimp.intToRGBA(binary.getPixelColor(x, y));
        const isBlack = pixel.r < 128;

        if (isBlack && lineStart === null) {
          lineStart = y;
        } else if (!isBlack && lineStart !== null) {
          const lineLength = y - lineStart;
          if (lineLength >= this.minLineLength) {
            lines.push({
              start: { x, y: lineStart },
              end: { x, y: y - 1 },
              length: lineLength,
              angle: Math.PI / 2,
              orientation: 'vertical',
            });
          }
          lineStart = null;
        }
      }

      // Handle line that extends to edge
      if (lineStart !== null) {
        const lineLength = height - lineStart;
        if (lineLength >= this.minLineLength) {
          lines.push({
            start: { x, y: lineStart },
            end: { x, y: height - 1 },
            length: lineLength,
            angle: Math.PI / 2,
            orientation: 'vertical',
          });
        }
      }
    }

    return lines;
  }

  /**
   * Filter lines to identify walls (longer lines, proper orientation)
   */
  private filterWalls(lines: Line[]): Line[] {
    return lines.filter((line) => {
      // Walls should be reasonably long
      if (line.length < this.minLineLength * 2) {
        return false;
      }

      // Walls should be horizontal or vertical (not diagonal)
      if (line.orientation === 'diagonal') {
        return false;
      }

      return true;
    });
  }

  /**
   * Detect parallel line pairs to estimate wall thickness
   */
  private detectParallelPairs(walls: Line[]): Line[] {
    const wallsWithThickness = [...walls];

    for (let i = 0; i < wallsWithThickness.length; i++) {
      const wall1 = wallsWithThickness[i];

      if (wall1.thickness !== undefined) continue; // Already has thickness

      for (let j = i + 1; j < wallsWithThickness.length; j++) {
        const wall2 = wallsWithThickness[j];

        // Check if parallel (same orientation)
        if (wall1.orientation !== wall2.orientation) continue;

        // Calculate distance between parallel lines
        let distance: number;

        if (wall1.orientation === 'horizontal') {
          distance = Math.abs(wall1.start.y - wall2.start.y);

          // Check if lines overlap in X direction
          const overlap =
            Math.min(wall1.end.x, wall2.end.x) - Math.max(wall1.start.x, wall2.start.x);

          if (overlap > this.minLineLength * 0.5 && distance < this.wallThicknessThreshold) {
            wall1.thickness = distance;
            wall2.thickness = distance;
          }
        } else {
          // vertical
          distance = Math.abs(wall1.start.x - wall2.start.x);

          // Check if lines overlap in Y direction
          const overlap =
            Math.min(wall1.end.y, wall2.end.y) - Math.max(wall1.start.y, wall2.start.y);

          if (overlap > this.minLineLength * 0.5 && distance < this.wallThicknessThreshold) {
            wall1.thickness = distance;
            wall2.thickness = distance;
          }
        }
      }

      // If no parallel pair found, assume single line wall (thickness = 1)
      if (wall1.thickness === undefined) {
        wall1.thickness = 1;
      }
    }

    return wallsWithThickness;
  }

  /**
   * Build building perimeter from exterior walls
   * Returns a polygon representing the building boundary
   */
  private buildBuildingPerimeter(
    exteriorWalls: Line[],
    imageWidth: number,
    imageHeight: number
  ): Array<{ x: number; y: number }> | null {
    if (exteriorWalls.length === 0) {
      return null;
    }

    // Find the bounding box of all exterior walls
    const allPoints = exteriorWalls.flatMap((wall) => [wall.start, wall.end]);

    const minX = Math.min(...allPoints.map((p) => p.x));
    const maxX = Math.max(...allPoints.map((p) => p.x));
    const minY = Math.min(...allPoints.map((p) => p.y));
    const maxY = Math.max(...allPoints.map((p) => p.y));

    // Create a simple rectangular perimeter from exterior wall bounds
    const perimeter = [
      { x: minX, y: minY },
      { x: maxX, y: minY },
      { x: maxX, y: maxY },
      { x: minX, y: maxY },
    ];

    // Add some margin (10px inward) to ensure we're truly inside
    const margin = 10;
    return [
      { x: minX + margin, y: minY + margin },
      { x: maxX - margin, y: minY + margin },
      { x: maxX - margin, y: maxY - margin },
      { x: minX + margin, y: maxY - margin },
    ];
  }

  /**
   * Check if a point is inside a polygon using ray casting algorithm
   */
  private isPointInsidePerimeter(
    point: { x: number; y: number },
    polygon: Array<{ x: number; y: number }>
  ): boolean {
    if (!polygon || polygon.length < 3) {
      return true; // If no perimeter, assume everything is inside
    }

    let inside = false;
    const n = polygon.length;

    for (let i = 0, j = n - 1; i < n; j = i++) {
      const xi = polygon[i].x;
      const yi = polygon[i].y;
      const xj = polygon[j].x;
      const yj = polygon[j].y;

      const intersect =
        yi > point.y !== yj > point.y &&
        point.x < ((xj - xi) * (point.y - yi)) / (yj - yi) + xi;

      if (intersect) {
        inside = !inside;
      }
    }

    return inside;
  }

  /**
   * Extract boundary pixels from a set of room pixels
   * Returns pixels that have at least one non-room neighbor (are on the edge)
   */
  private extractBoundaryPixels(
    roomPixels: Array<{ x: number; y: number }>,
    width: number,
    height: number,
    isRoomPixel: (x: number, y: number) => boolean
  ): Array<{ x: number; y: number }> {
    const boundaryPixels: Array<{ x: number; y: number }> = [];
    const pixelSet = new Set(roomPixels.map((p) => `${p.x},${p.y}`));

    for (const pixel of roomPixels) {
      const { x, y } = pixel;

      // Check 8-connected neighbors
      const hasNonRoomNeighbor =
        !pixelSet.has(`${x - 1},${y}`) || // left
        !pixelSet.has(`${x + 1},${y}`) || // right
        !pixelSet.has(`${x},${y - 1}`) || // top
        !pixelSet.has(`${x},${y + 1}`) || // bottom
        !pixelSet.has(`${x - 1},${y - 1}`) || // top-left
        !pixelSet.has(`${x + 1},${y - 1}`) || // top-right
        !pixelSet.has(`${x - 1},${y + 1}`) || // bottom-left
        !pixelSet.has(`${x + 1},${y + 1}`); // bottom-right

      if (hasNonRoomNeighbor) {
        boundaryPixels.push(pixel);
      }
    }

    return boundaryPixels;
  }

  /**
   * Trace contour in clockwise order using Moore-Neighbor tracing algorithm
   */
  private traceContour(
    boundaryPixels: Array<{ x: number; y: number }>
  ): Array<{ x: number; y: number }> {
    if (boundaryPixels.length === 0) return [];

    const pixelSet = new Set(boundaryPixels.map((p) => `${p.x},${p.y}`));

    // Find starting pixel (leftmost-topmost)
    let startPixel = boundaryPixels[0];
    for (const pixel of boundaryPixels) {
      if (pixel.y < startPixel.y || (pixel.y === startPixel.y && pixel.x < startPixel.x)) {
        startPixel = pixel;
      }
    }

    const contour: Array<{ x: number; y: number }> = [startPixel];
    const visited = new Set<string>([`${startPixel.x},${startPixel.y}`]);

    // 8-direction neighbors in clockwise order (starting from right)
    const directions = [
      { dx: 1, dy: 0 }, // right
      { dx: 1, dy: 1 }, // bottom-right
      { dx: 0, dy: 1 }, // bottom
      { dx: -1, dy: 1 }, // bottom-left
      { dx: -1, dy: 0 }, // left
      { dx: -1, dy: -1 }, // top-left
      { dx: 0, dy: -1 }, // top
      { dx: 1, dy: -1 }, // top-right
    ];

    let currentPixel = startPixel;
    let maxIterations = boundaryPixels.length * 2; // Safety limit
    let iterations = 0;

    while (iterations < maxIterations) {
      iterations++;

      // Find next boundary pixel
      let foundNext = false;
      for (const dir of directions) {
        const nx = currentPixel.x + dir.dx;
        const ny = currentPixel.y + dir.dy;
        const key = `${nx},${ny}`;

        if (pixelSet.has(key) && !visited.has(key)) {
          currentPixel = { x: nx, y: ny };
          contour.push(currentPixel);
          visited.add(key);
          foundNext = true;
          break;
        }
      }

      // If back at start or no more neighbors, done
      if (!foundNext || (currentPixel.x === startPixel.x && currentPixel.y === startPixel.y)) {
        break;
      }
    }

    return contour;
  }

  /**
   * Simplify polygon using Douglas-Peucker algorithm
   * Reduces number of vertices while maintaining shape
   */
  private simplifyPolygon(
    points: Array<{ x: number; y: number }>,
    tolerance: number
  ): Array<{ x: number; y: number }> {
    if (points.length <= 3) return points;

    // Find point with maximum distance from line segment
    let maxDistance = 0;
    let maxIndex = 0;

    const start = points[0];
    const end = points[points.length - 1];

    for (let i = 1; i < points.length - 1; i++) {
      const distance = this.perpendicularDistance(points[i], start, end);
      if (distance > maxDistance) {
        maxDistance = distance;
        maxIndex = i;
      }
    }

    // If max distance is greater than tolerance, recursively simplify
    if (maxDistance > tolerance) {
      const left = this.simplifyPolygon(points.slice(0, maxIndex + 1), tolerance);
      const right = this.simplifyPolygon(points.slice(maxIndex), tolerance);

      // Concatenate results (remove duplicate middle point)
      return [...left.slice(0, -1), ...right];
    } else {
      // All points are within tolerance, return endpoints only
      return [start, end];
    }
  }

  /**
   * Calculate perpendicular distance from point to line segment
   */
  private perpendicularDistance(
    point: { x: number; y: number },
    lineStart: { x: number; y: number },
    lineEnd: { x: number; y: number }
  ): number {
    const dx = lineEnd.x - lineStart.x;
    const dy = lineEnd.y - lineStart.y;

    if (dx === 0 && dy === 0) {
      // Line segment is a point
      return Math.sqrt(
        Math.pow(point.x - lineStart.x, 2) + Math.pow(point.y - lineStart.y, 2)
      );
    }

    // Calculate perpendicular distance
    const numerator = Math.abs(
      dy * point.x - dx * point.y + lineEnd.x * lineStart.y - lineEnd.y * lineStart.x
    );
    const denominator = Math.sqrt(dx * dx + dy * dy);

    return numerator / denominator;
  }

  /**
   * Check if a room region is likely dimension text or other false positive
   */
  private isLikelyTextRegion(
    roomPixels: Array<{ x: number; y: number }>,
    imageWidth: number,
    imageHeight: number
  ): boolean {
    const minX = Math.min(...roomPixels.map((p) => p.x));
    const maxX = Math.max(...roomPixels.map((p) => p.x));
    const minY = Math.min(...roomPixels.map((p) => p.y));
    const maxY = Math.max(...roomPixels.map((p) => p.y));

    const width = maxX - minX;
    const height = maxY - minY;
    const area = roomPixels.length;
    const aspectRatio = width / Math.max(height, 1);

    // Filter 1: Very wide and short regions (dimension text like "640×760")
    if (aspectRatio > 5 && area < 300) {
      return true;
    }

    // Filter 2: Small regions near top/bottom edges (title blocks, dimension text)
    const isNearTopEdge = minY < imageHeight * 0.1;
    const isNearBottomEdge = maxY > imageHeight * 0.9;

    if ((isNearTopEdge || isNearBottomEdge) && width < 200 && height < 40) {
      return true;
    }

    // Filter 3: Very small regions (< 100 pixels) with high aspect ratio
    if (area < 100 && aspectRatio > 3) {
      return true;
    }

    return false;
  }

  /**
   * Detect rooms using connected component analysis (flood fill)
   */
  private async detectRooms(
    binary: Jimp,
    exteriorWalls?: Line[]
  ): Promise<Room[]> {
    const width = binary.bitmap.width;
    const height = binary.bitmap.height;
    const visited = new Set<string>();
    const rooms: Room[] = [];

    // Build perimeter from exterior walls if provided
    const perimeter = exteriorWalls
      ? this.buildBuildingPerimeter(exteriorWalls, width, height)
      : null;

    if (perimeter) {
      console.log(
        `  [Wall Line Detector] Built building perimeter from ${exteriorWalls?.length} exterior walls`
      );
    }

    // Helper function to check if pixel is white (room space)
    const isRoomSpace = (x: number, y: number): boolean => {
      if (x < 0 || x >= width || y < 0 || y >= height) return false;
      const pixel = Jimp.intToRGBA(binary.getPixelColor(x, y));
      return pixel.r > 128; // White pixels are room space
    };

    // Flood fill to find connected white regions (rooms)
    const floodFill = (startX: number, startY: number): Room | null => {
      const stack: Array<{ x: number; y: number }> = [{ x: startX, y: startY }];
      const roomPixels: Array<{ x: number; y: number }> = [];
      const maxPixels = 100000; // Prevent runaway memory usage

      // Helper to add neighbor if valid
      const addNeighbor = (nx: number, ny: number) => {
        if (nx < 0 || nx >= width || ny < 0 || ny >= height) return;
        const nkey = `${nx},${ny}`;
        if (visited.has(nkey)) return;
        if (!isRoomSpace(nx, ny)) return;
        stack.push({ x: nx, y: ny });
      };

      while (stack.length > 0 && roomPixels.length < maxPixels) {
        const { x, y } = stack.pop()!;
        const key = `${x},${y}`;

        if (visited.has(key)) continue;
        if (!isRoomSpace(x, y)) continue;

        visited.add(key);
        roomPixels.push({ x, y });

        // Add neighbors only if they're valid (prevents stack explosion)
        addNeighbor(x + 1, y);
        addNeighbor(x - 1, y);
        addNeighbor(x, y + 1);
        addNeighbor(x, y - 1);
      }

      // Filter 0: Check if room is likely dimension text or false positive
      if (this.isLikelyTextRegion(roomPixels, width, height)) {
        return null;
      }

      // If room is too small, ignore (lowered threshold to detect closets/hallways)
      if (roomPixels.length < 100) return null; // Minimum 100 pixels (detect small rooms like 物入, 廊下)

      // Calculate bounds and center
      const minX = Math.min(...roomPixels.map((p) => p.x));
      const maxX = Math.max(...roomPixels.map((p) => p.x));
      const minY = Math.min(...roomPixels.map((p) => p.y));
      const maxY = Math.max(...roomPixels.map((p) => p.y));

      // Filter 1: Reject rooms that cover too much of the image (likely background)
      const maxImageArea = width * height;
      if (roomPixels.length > maxImageArea * 0.4) {
        console.log(
          `  [Wall Line Detector] Rejected room (too large): ${roomPixels.length} pixels (${((roomPixels.length / maxImageArea) * 100).toFixed(1)}% of image)`
        );
        return null;
      }

      // Filter 2: Reject rooms with bounds nearly equal to image dimensions (background)
      // Changed to OR condition to catch large regions in any dimension
      const boundsWidth = maxX - minX;
      const boundsHeight = maxY - minY;
      if (boundsWidth > width * 0.8 || boundsHeight > height * 0.8) {
        console.log(
          `  [Wall Line Detector] Rejected room (covers entire image): ${boundsWidth}x${boundsHeight} vs ${width}x${height}`
        );
        return null;
      }

      // Calculate center for perimeter check
      const center = {
        x: (minX + maxX) / 2,
        y: (minY + maxY) / 2,
      };

      // Filter 3: Check if room center is inside building perimeter (if available)
      if (perimeter && !this.isPointInsidePerimeter(center, perimeter)) {
        console.log(
          `  [Wall Line Detector] Rejected room (outside building perimeter): center at (${Math.round(center.x)},${Math.round(center.y)})`
        );
        return null;
      }

      // Extract actual polygon contour instead of bounding box rectangle
      const boundaryPixels = this.extractBoundaryPixels(roomPixels, width, height, isRoomSpace);
      let contour = this.traceContour(boundaryPixels);

      // If contour tracing failed or resulted in too few points, fall back to rectangle
      if (contour.length < 4) {
        contour = [
          { x: minX, y: minY },
          { x: maxX, y: minY },
          { x: maxX, y: maxY },
          { x: minX, y: maxY },
        ];
      } else {
        // Simplify polygon to reduce vertices (tolerance = 5 pixels for floor plans)
        contour = this.simplifyPolygon(contour, 5);

        // Ensure we have at least 3 vertices for a valid polygon
        if (contour.length < 3) {
          contour = [
            { x: minX, y: minY },
            { x: maxX, y: minY },
            { x: maxX, y: maxY },
            { x: minX, y: maxY },
          ];
        }
      }

      return {
        id: rooms.length + 1,
        bounds: contour, // Now contains actual polygon vertices instead of just 4 corners!
        center,
        area: roomPixels.length,
      };
    };

    // Scan image to find rooms (skip edges to avoid detecting background)
    for (let y = 10; y < height - 10; y += 10) {
      // Sample every 10 pixels for performance, with 10px margin from edges
      for (let x = 10; x < width - 10; x += 10) {
        const key = `${x},${y}`;
        if (visited.has(key)) continue;
        if (!isRoomSpace(x, y)) continue;

        const room = floodFill(x, y);
        if (room) {
          rooms.push(room);
        }
      }
    }

    return rooms;
  }

  /**
   * Re-detect rooms with perimeter filtering using classified exterior walls
   * This is called after AI classification to filter out exterior spaces
   */
  async redetectRoomsWithPerimeter(
    imagePath: string,
    exteriorWalls: Line[]
  ): Promise<Room[]> {
    console.log('  [Wall Line Detector] Re-detecting rooms with perimeter filtering...');

    // Load and preprocess image
    const image = await Jimp.read(imagePath);
    const binary = await this.preprocessImage(image);

    // Detect rooms with exterior wall perimeter
    const rooms = await this.detectRooms(binary, exteriorWalls);

    console.log(
      `  [Wall Line Detector] Re-detection complete: ${rooms.length} interior rooms`
    );

    return rooms;
  }
}

// Singleton instance
export const wallLineDetector = new WallLineDetector();
