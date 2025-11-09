/**
 * Automatic Scaling Factor Calculation
 *
 * Solves the "Two-Worlds Problem" by calculating the conversion factor
 * between pixel coordinates and real-world millimeters.
 *
 * Strategy:
 * 1. Find "anchor" objects: geometric objects that have both:
 *    - Pixel-based geometry (coordinates)
 *    - Dimension text (real-world measurement in mm)
 * 2. Calculate scaling factor for each anchor
 * 3. Average multiple anchors for robustness
 * 4. Validate consistency (flag if anchors disagree significantly)
 */

interface Point {
  x: number;
  y: number;
}

interface GeometricObject {
  id: string;
  objectType: string;
  geometry?: {
    type: string;
    coordinates: Point[];
  };
  properties?: {
    dimension_text?: string;
    length?: number;
    [key: string]: any;
  };
}

interface ScalingAnchor {
  objectId: string;
  objectType: string;
  pixelLength: number;
  realLengthMm: number;
  scalingFactor: number; // mm per pixel
  confidence: number;
}

interface ScalingResult {
  scalingFactor: number; // Final averaged scaling factor (mm per pixel)
  pixelsPerMm: number; // Inverse: pixels per mm
  anchors: ScalingAnchor[];
  confidence: number; // Overall confidence (0-1)
  warnings: string[];
  metadata: {
    anchorCount: number;
    scalingFactorStdDev: number;
    maxDeviation: number; // Max % deviation from average
  };
}

/**
 * Calculate Euclidean distance between two points
 */
function calculateDistance(p1: Point, p2: Point): number {
  return Math.sqrt(Math.pow(p2.x - p1.x, 2) + Math.pow(p2.y - p1.y, 2));
}

/**
 * Calculate pixel length of a geometric object
 */
function calculatePixelLength(geometry?: {
  type: string;
  coordinates: Point[];
}): number | null {
  if (!geometry || !geometry.coordinates || geometry.coordinates.length < 2) {
    return null;
  }

  if (geometry.type === 'line' && geometry.coordinates.length === 2) {
    // Simple line: distance between start and end
    return calculateDistance(geometry.coordinates[0], geometry.coordinates[1]);
  } else if (geometry.type === 'polygon') {
    // Polygon: sum of all edge lengths
    let totalLength = 0;
    for (let i = 0; i < geometry.coordinates.length - 1; i++) {
      totalLength += calculateDistance(
        geometry.coordinates[i],
        geometry.coordinates[i + 1]
      );
    }
    // Close the polygon
    totalLength += calculateDistance(
      geometry.coordinates[geometry.coordinates.length - 1],
      geometry.coordinates[0]
    );
    return totalLength;
  }

  return null;
}

/**
 * Extract numeric value from dimension text
 * Handles formats: "10,920", "10920mm", "10.920", "10920", etc.
 */
function extractDimensionValue(text?: string): number | null {
  if (!text) return null;

  // Remove common units and formatting
  const cleaned = text
    .replace(/mm|m|cm|km/gi, '')
    .replace(/,/g, '')
    .replace(/\s+/g, '')
    .trim();

  // Try to parse as number
  const num = parseFloat(cleaned);
  return isNaN(num) ? null : num;
}

/**
 * Calculate standard deviation
 */
function calculateStdDev(values: number[]): number {
  if (values.length === 0) return 0;
  const mean = values.reduce((sum, val) => sum + val, 0) / values.length;
  const squaredDiffs = values.map((val) => Math.pow(val - mean, 2));
  const variance =
    squaredDiffs.reduce((sum, val) => sum + val, 0) / values.length;
  return Math.sqrt(variance);
}

/**
 * Find anchor objects that can be used for scaling calculation
 */
export function findScalingAnchors(
  objects: GeometricObject[]
): ScalingAnchor[] {
  const anchors: ScalingAnchor[] = [];

  for (const obj of objects) {
    // Skip if no geometry or dimension text
    if (!obj.geometry || !obj.properties?.dimension_text) {
      continue;
    }

    // Calculate pixel length
    const pixelLength = calculatePixelLength(obj.geometry);
    if (!pixelLength || pixelLength < 10) {
      // Too small to be reliable anchor
      continue;
    }

    // Extract real-world dimension
    const realLengthMm = extractDimensionValue(obj.properties.dimension_text);
    if (!realLengthMm || realLengthMm < 100) {
      // Too small or invalid
      continue;
    }

    // Calculate scaling factor for this object
    const scalingFactor = realLengthMm / pixelLength;

    // Confidence based on object type and length
    let confidence = 0.5;
    if (obj.objectType === 'wall') {
      confidence = 0.9; // Walls are most reliable
    } else if (obj.objectType === 'door' || obj.objectType === 'window') {
      confidence = 0.7;
    }

    // Longer objects are more reliable
    if (pixelLength > 500) confidence += 0.1;
    if (pixelLength > 700) confidence += 0.1;

    confidence = Math.min(1.0, confidence);

    anchors.push({
      objectId: obj.id,
      objectType: obj.objectType,
      pixelLength,
      realLengthMm,
      scalingFactor,
      confidence,
    });
  }

  return anchors;
}

/**
 * Calculate final scaling factor from multiple anchors
 * Uses weighted average based on confidence
 */
export function calculateScalingFactor(
  objects: GeometricObject[]
): ScalingResult {
  const anchors = findScalingAnchors(objects);

  if (anchors.length === 0) {
    return {
      scalingFactor: 15.0, // Default fallback (typical for 1:100 scale drawings)
      pixelsPerMm: 1 / 15.0,
      anchors: [],
      confidence: 0.0,
      warnings: [
        'No valid anchor objects found with both geometry and dimensions. Using default scaling factor of 15.0 mm/pixel.',
      ],
      metadata: {
        anchorCount: 0,
        scalingFactorStdDev: 0,
        maxDeviation: 0,
      },
    };
  }

  // Calculate weighted average
  const totalWeight = anchors.reduce(
    (sum, anchor) => sum + anchor.confidence,
    0
  );
  const weightedSum = anchors.reduce(
    (sum, anchor) => sum + anchor.scalingFactor * anchor.confidence,
    0
  );
  const avgScalingFactor = weightedSum / totalWeight;

  // Calculate statistics
  const scalingFactors = anchors.map((a) => a.scalingFactor);
  const stdDev = calculateStdDev(scalingFactors);
  const deviations = scalingFactors.map((sf) =>
    Math.abs((sf - avgScalingFactor) / avgScalingFactor)
  );
  const maxDeviation = Math.max(...deviations) * 100; // Convert to percentage

  // Generate warnings
  const warnings: string[] = [];
  if (anchors.length === 1) {
    warnings.push(
      'Only 1 anchor found. Scaling factor may be less reliable. Consider adding more dimension labels to the drawing.'
    );
  }
  if (maxDeviation > 10) {
    warnings.push(
      `High variance in anchor scaling factors (${maxDeviation.toFixed(1)}% max deviation). Check dimension labels for accuracy.`
    );
  }
  if (stdDev > 2) {
    warnings.push(
      `Standard deviation of ${stdDev.toFixed(2)} indicates inconsistent scaling across objects.`
    );
  }

  // Overall confidence
  let overallConfidence = Math.min(...anchors.map((a) => a.confidence));
  if (anchors.length >= 3) overallConfidence += 0.1;
  if (maxDeviation < 5) overallConfidence += 0.1;
  overallConfidence = Math.min(1.0, overallConfidence);

  return {
    scalingFactor: avgScalingFactor,
    pixelsPerMm: 1 / avgScalingFactor,
    anchors,
    confidence: overallConfidence,
    warnings,
    metadata: {
      anchorCount: anchors.length,
      scalingFactorStdDev: stdDev,
      maxDeviation,
    },
  };
}

/**
 * Log scaling calculation results (for debugging)
 */
export function logScalingResults(result: ScalingResult): void {
  console.log(`\n${'='.repeat(70)}`);
  console.log('SCALING FACTOR CALCULATION');
  console.log('='.repeat(70));

  console.log(
    `\nFinal Scaling Factor: ${result.scalingFactor.toFixed(3)} mm/pixel`
  );
  console.log(`Pixels per mm: ${result.pixelsPerMm.toFixed(6)}`);
  console.log(`Confidence: ${(result.confidence * 100).toFixed(1)}%`);
  console.log(`Anchors used: ${result.anchors.length}`);

  if (result.anchors.length > 0) {
    console.log(`\nAnchor Objects:`);
    result.anchors.forEach((anchor, idx) => {
      console.log(
        `  ${idx + 1}. ${anchor.objectType} (${anchor.objectId.substring(0, 8)}...)`
      );
      console.log(`     Pixel length: ${anchor.pixelLength.toFixed(1)}px`);
      console.log(`     Real length: ${anchor.realLengthMm.toFixed(0)}mm`);
      console.log(
        `     Scaling factor: ${anchor.scalingFactor.toFixed(3)} mm/px`
      );
      console.log(`     Confidence: ${(anchor.confidence * 100).toFixed(0)}%`);
    });

    console.log(`\nStatistics:`);
    console.log(
      `  Standard deviation: ${result.metadata.scalingFactorStdDev.toFixed(3)}`
    );
    console.log(`  Max deviation: ${result.metadata.maxDeviation.toFixed(1)}%`);
  }

  if (result.warnings.length > 0) {
    console.log(`\nWarnings:`);
    result.warnings.forEach((warning) => {
      console.log(`  - ${warning}`);
    });
  }

  console.log('');
}
