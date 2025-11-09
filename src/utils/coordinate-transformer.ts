/**
 * Coordinate Transformation Utilities
 *
 * Converts between pixel space (image coordinates) and real-world space (millimeters).
 *
 * Coordinate Systems:
 * - Pixel Space: Origin at top-left (0,0), X increases right, Y increases down
 * - Real Space (Option 1): Origin at top-left, same orientation as pixels
 * - Real Space (Option 2): Origin at bottom-left, X increases right, Y increases UP (architectural standard)
 *
 * The transformer supports both options via the `flipYAxis` parameter.
 */

export interface Point {
  x: number;
  y: number;
}

export interface PointWithUnit {
  x: number;
  y: number;
  unit: 'px' | 'mm' | 'ft';
}

export interface Line {
  start: Point;
  end: Point;
}

export interface TransformedLine {
  start_px: Point;
  end_px: Point;
  start_mm: Point;
  end_mm: Point;
  length_px: number;
  length_mm: number;
}

export interface TransformOptions {
  scalingFactor: number; // mm per pixel
  imageHeight?: number; // Required if flipYAxis is true
  flipYAxis?: boolean; // Default: false (keep top-left origin)
  outputUnit?: 'mm' | 'ft'; // Default: 'mm'
}

export class CoordinateTransformer {
  private scalingFactor: number; // mm per pixel
  private pixelsPerMm: number;
  private imageHeight: number;
  private flipYAxis: boolean;
  private outputUnit: 'mm' | 'ft';
  private mmToFt: number = 1 / 304.8; // Revit uses feet

  constructor(options: TransformOptions) {
    this.scalingFactor = options.scalingFactor;
    this.pixelsPerMm = 1 / options.scalingFactor;
    this.imageHeight = options.imageHeight || 0;
    this.flipYAxis = options.flipYAxis || false;
    this.outputUnit = options.outputUnit || 'mm';

    if (this.flipYAxis && !options.imageHeight) {
      throw new Error('imageHeight is required when flipYAxis is true');
    }
  }

  /**
   * Transform a single point from pixel space to real space
   */
  transformPoint(px: number, py: number): PointWithUnit {
    // Convert pixels to mm
    let x_mm = px * this.scalingFactor;
    let y_mm = py * this.scalingFactor;

    // Flip Y-axis if requested (for architectural bottom-left origin)
    if (this.flipYAxis) {
      const imageHeightMm = this.imageHeight * this.scalingFactor;
      y_mm = imageHeightMm - y_mm;
    }

    // Convert to output unit
    if (this.outputUnit === 'ft') {
      return {
        x: x_mm * this.mmToFt,
        y: y_mm * this.mmToFt,
        unit: 'ft',
      };
    }

    return {
      x: x_mm,
      y: y_mm,
      unit: 'mm',
    };
  }

  /**
   * Transform a point object
   */
  transformPointObject(point: Point): PointWithUnit {
    return this.transformPoint(point.x, point.y);
  }

  /**
   * Transform a line from pixel space to real space
   */
  transformLine(line: Line): TransformedLine {
    const start_mm = this.transformPoint(line.start.x, line.start.y);
    const end_mm = this.transformPoint(line.end.x, line.end.y);

    // Calculate lengths
    const length_px = this.calculateDistance(line.start, line.end);
    const length_mm = this.calculateDistance(
      { x: start_mm.x, y: start_mm.y },
      { x: end_mm.x, y: end_mm.y }
    );

    return {
      start_px: line.start,
      end_px: line.end,
      start_mm: { x: start_mm.x, y: start_mm.y },
      end_mm: { x: end_mm.x, y: end_mm.y },
      length_px,
      length_mm,
    };
  }

  /**
   * Transform an array of coordinates (for polygons)
   */
  transformCoordinates(coordinates: Point[]): PointWithUnit[] {
    return coordinates.map((point) => this.transformPointObject(point));
  }

  /**
   * Transform a length value from pixels to real-world units
   */
  transformLength(lengthPx: number): number {
    const lengthMm = lengthPx * this.scalingFactor;
    return this.outputUnit === 'ft' ? lengthMm * this.mmToFt : lengthMm;
  }

  /**
   * Calculate Euclidean distance between two points
   */
  private calculateDistance(p1: Point, p2: Point): number {
    return Math.sqrt(Math.pow(p2.x - p1.x, 2) + Math.pow(p2.y - p1.y, 2));
  }

  /**
   * Get transformation metadata (for including in output JSON)
   */
  getMetadata() {
    return {
      scalingFactor: this.scalingFactor,
      pixelsPerMm: this.pixelsPerMm,
      imageHeight: this.imageHeight,
      flipYAxis: this.flipYAxis,
      outputUnit: this.outputUnit,
      coordinateSystem: this.flipYAxis
        ? 'bottom-left origin (architectural standard)'
        : 'top-left origin (image standard)',
    };
  }
}

/**
 * Utility: Create transformer from image metadata
 */
export function createTransformerFromMetadata(metadata: {
  scaling_factor?: number;
  image_width?: number;
  image_height?: number;
}): CoordinateTransformer {
  const scalingFactor = metadata.scaling_factor || 15.0; // Default fallback
  const imageHeight = metadata.image_height || 0;

  return new CoordinateTransformer({
    scalingFactor,
    imageHeight,
    flipYAxis: false, // Can be configured based on user preference
    outputUnit: 'mm',
  });
}

/**
 * Utility: Validate that transformed coordinates match expected dimension text
 * Returns true if within tolerance (default 5%)
 */
export function validateTransformedLength(
  transformedLengthMm: number,
  expectedDimensionText: string,
  tolerancePercent: number = 5
): { isValid: boolean; difference: number; differencePercent: number } {
  // Extract numeric value from dimension text
  const cleaned = expectedDimensionText
    .replace(/mm|m|cm/gi, '')
    .replace(/,/g, '')
    .trim();
  const expectedMm = parseFloat(cleaned);

  if (isNaN(expectedMm)) {
    return {
      isValid: false,
      difference: 0,
      differencePercent: 0,
    };
  }

  const difference = Math.abs(transformedLengthMm - expectedMm);
  const differencePercent = (difference / expectedMm) * 100;
  const isValid = differencePercent <= tolerancePercent;

  return {
    isValid,
    difference,
    differencePercent,
  };
}
