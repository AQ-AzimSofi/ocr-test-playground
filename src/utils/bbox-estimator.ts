import Levenshtein from 'fast-levenshtein';

/**
 * Bounding box estimation and synthesis utilities
 * Used for creating approximate bounding boxes for text detected by Gemini
 */

export interface BoundingBox {
  bounds: Array<{ x: number; y: number }>;
  text?: string;
  confidence?: number;
}

export interface CharDimensions {
  avgWidth: number;
  avgHeight: number;
  medianWidth: number;
  medianHeight: number;
}

export interface MatchResult {
  bbox: BoundingBox;
  similarity: number;
  matchedText: string;
  sourceText: string;
}

/**
 * Calculate Levenshtein distance between two strings (normalized 0-1)
 */
export function calculateTextSimilarity(str1: string, str2: string): number {
  if (!str1 || !str2) return 0;

  const distance = Levenshtein.get(str1, str2);
  const maxLength = Math.max(str1.length, str2.length);

  if (maxLength === 0) return 1;

  return 1 - distance / maxLength;
}

/**
 * Fuzzy match a text segment to a list of bounding boxes
 * Returns best match above similarity threshold
 */
export function fuzzyMatchTextToBbox(
  text: string,
  bboxes: BoundingBox[],
  threshold: number = 0.7
): MatchResult | null {
  let bestMatch: MatchResult | null = null;

  for (const bbox of bboxes) {
    if (!bbox.text) continue;

    const similarity = calculateTextSimilarity(text, bbox.text);

    if (similarity >= threshold && (!bestMatch || similarity > bestMatch.similarity)) {
      bestMatch = {
        bbox,
        similarity,
        matchedText: bbox.text,
        sourceText: text,
      };
    }
  }

  return bestMatch;
}

/**
 * Calculate average character dimensions from known bounding boxes
 */
export function calculateAverageCharDimensions(bboxes: BoundingBox[]): CharDimensions {
  const widths: number[] = [];
  const heights: number[] = [];

  for (const bbox of bboxes) {
    if (!bbox.text || bbox.text.length === 0) continue;

    const bounds = bbox.bounds;
    if (bounds.length < 4) continue;

    // Calculate bbox width and height
    const width = Math.abs(bounds[1].x - bounds[0].x);
    const height = Math.abs(bounds[2].y - bounds[1].y);

    // Estimate per-character dimensions
    const charWidth = width / bbox.text.length;
    const charHeight = height;

    widths.push(charWidth);
    heights.push(charHeight);
  }

  if (widths.length === 0) {
    // Default dimensions if no bboxes available
    return {
      avgWidth: 20,
      avgHeight: 30,
      medianWidth: 20,
      medianHeight: 30,
    };
  }

  const avgWidth = widths.reduce((a, b) => a + b, 0) / widths.length;
  const avgHeight = heights.reduce((a, b) => a + b, 0) / heights.length;

  const sortedWidths = [...widths].sort((a, b) => a - b);
  const sortedHeights = [...heights].sort((a, b) => a - b);

  const medianWidth = sortedWidths[Math.floor(sortedWidths.length / 2)];
  const medianHeight = sortedHeights[Math.floor(sortedHeights.length / 2)];

  return { avgWidth, avgHeight, medianWidth, medianHeight };
}

/**
 * Get the centroid (center point) of a bounding box
 */
export function getBboxCentroid(bbox: BoundingBox): { x: number; y: number } {
  const bounds = bbox.bounds;

  if (bounds.length === 0) {
    return { x: 0, y: 0 };
  }

  const sumX = bounds.reduce((sum, point) => sum + point.x, 0);
  const sumY = bounds.reduce((sum, point) => sum + point.y, 0);

  return {
    x: sumX / bounds.length,
    y: sumY / bounds.length,
  };
}

/**
 * Find the N nearest bounding boxes to a given point
 */
export function findNearestBboxes(
  point: { x: number; y: number },
  bboxes: BoundingBox[],
  n: number = 5
): BoundingBox[] {
  const distances = bboxes.map(bbox => ({
    bbox,
    distance: Math.hypot(
      point.x - getBboxCentroid(bbox).x,
      point.y - getBboxCentroid(bbox).y
    ),
  }));

  distances.sort((a, b) => a.distance - b.distance);

  return distances.slice(0, n).map(d => d.bbox);
}

/**
 * Estimate bbox position based on neighboring bboxes
 * If between two bboxes: interpolate
 * If at start/end: extrapolate from nearest
 */
export function estimateBboxFromNeighbors(
  textLength: number,
  nearbyBboxes: BoundingBox[],
  charDimensions: CharDimensions,
  imageWidth: number,
  imageHeight: number
): BoundingBox {
  if (nearbyBboxes.length === 0) {
    // No neighbors - place in center with estimated size
    const width = charDimensions.avgWidth * textLength;
    const height = charDimensions.avgHeight;
    const x = (imageWidth - width) / 2;
    const y = (imageHeight - height) / 2;

    return {
      bounds: [
        { x, y },
        { x: x + width, y },
        { x: x + width, y: y + height },
        { x, y: y + height },
      ],
      confidence: 0.5, // Low confidence for pure estimation
    };
  }

  // Use nearest neighbor as reference
  const nearest = nearbyBboxes[0];
  const nearestBounds = nearest.bounds;

  if (nearestBounds.length < 4) {
    // Fallback to center placement
    const width = charDimensions.avgWidth * textLength;
    const height = charDimensions.avgHeight;
    const x = (imageWidth - width) / 2;
    const y = (imageHeight - height) / 2;

    return {
      bounds: [
        { x, y },
        { x: x + width, y },
        { x: x + width, y: y + height },
        { x, y: y + height },
      ],
      confidence: 0.5,
    };
  }

  // Calculate estimated dimensions
  const width = charDimensions.avgWidth * textLength;
  const height = charDimensions.avgHeight;

  // Get reference position from nearest bbox
  const refCentroid = getBboxCentroid(nearest);

  // Estimate position based on text flow direction
  // Assume horizontal left-to-right flow by default
  const nearestWidth = Math.abs(nearestBounds[1].x - nearestBounds[0].x);

  // Place to the right of nearest bbox with some spacing
  const spacing = charDimensions.avgWidth;
  const x = nearestBounds[1].x + spacing;
  const y = nearestBounds[0].y;

  // Check if position is out of bounds
  const finalX = Math.min(x, imageWidth - width);
  const finalY = Math.min(Math.max(y, 0), imageHeight - height);

  return {
    bounds: [
      { x: finalX, y: finalY },
      { x: finalX + width, y: finalY },
      { x: finalX + width, y: finalY + height },
      { x: finalX, y: finalY + height },
    ],
    confidence: 0.6, // Medium-low confidence for neighbor-based estimation
  };
}

/**
 * Synthesize a bounding box for text using context from existing bboxes
 */
export function synthesizeBboxForText(
  text: string,
  allBboxes: BoundingBox[],
  estimatedPosition?: { x: number; y: number },
  imageWidth: number = 1000,
  imageHeight: number = 1000
): BoundingBox {
  const charDimensions = calculateAverageCharDimensions(allBboxes);

  let nearbyBboxes: BoundingBox[] = [];

  if (estimatedPosition) {
    // Find bboxes near the estimated position
    nearbyBboxes = findNearestBboxes(estimatedPosition, allBboxes, 5);
  } else {
    // Use any available bboxes
    nearbyBboxes = allBboxes.slice(0, 5);
  }

  return estimateBboxFromNeighbors(
    text.length,
    nearbyBboxes,
    charDimensions,
    imageWidth,
    imageHeight
  );
}

/**
 * Convert percentage-based coordinates to pixel coordinates
 */
export function percentageToBbox(
  topPercent: number,
  leftPercent: number,
  widthPercent: number,
  heightPercent: number,
  imageWidth: number,
  imageHeight: number
): BoundingBox {
  const x = (leftPercent / 100) * imageWidth;
  const y = (topPercent / 100) * imageHeight;
  const width = (widthPercent / 100) * imageWidth;
  const height = (heightPercent / 100) * imageHeight;

  return {
    bounds: [
      { x, y },
      { x: x + width, y },
      { x: x + width, y: y + height },
      { x, y: y + height },
    ],
    confidence: 0.7, // Medium confidence for Gemini-provided percentages
  };
}

/**
 * Parse location description (e.g., "top-right corner") to approximate coordinates
 */
export function descriptionToApproximatePosition(
  description: string,
  imageWidth: number,
  imageHeight: number
): { x: number; y: number } | null {
  const desc = description.toLowerCase();

  // Vertical position
  let y = imageHeight / 2; // default: middle
  if (desc.includes('top')) {
    y = imageHeight * 0.2;
  } else if (desc.includes('bottom')) {
    y = imageHeight * 0.8;
  } else if (desc.includes('center') || desc.includes('middle')) {
    y = imageHeight * 0.5;
  }

  // Horizontal position
  let x = imageWidth / 2; // default: center
  if (desc.includes('left')) {
    x = imageWidth * 0.2;
  } else if (desc.includes('right')) {
    x = imageWidth * 0.8;
  } else if (desc.includes('center') || desc.includes('middle')) {
    x = imageWidth * 0.5;
  }

  // Check if we found any position keywords
  const hasPositionKeyword = desc.match(/top|bottom|left|right|center|middle/);

  if (!hasPositionKeyword) {
    return null; // Couldn't parse description
  }

  return { x, y };
}

/**
 * Calculate Intersection over Union (IoU) for two bounding boxes
 * Useful for evaluating bbox accuracy
 */
export function calculateIoU(bbox1: BoundingBox, bbox2: BoundingBox): number {
  const getBounds = (bbox: BoundingBox) => {
    const xs = bbox.bounds.map(p => p.x);
    const ys = bbox.bounds.map(p => p.y);
    return {
      x1: Math.min(...xs),
      y1: Math.min(...ys),
      x2: Math.max(...xs),
      y2: Math.max(...ys),
    };
  };

  const b1 = getBounds(bbox1);
  const b2 = getBounds(bbox2);

  // Calculate intersection
  const x1 = Math.max(b1.x1, b2.x1);
  const y1 = Math.max(b1.y1, b2.y1);
  const x2 = Math.min(b1.x2, b2.x2);
  const y2 = Math.min(b1.y2, b2.y2);

  const intersectionWidth = Math.max(0, x2 - x1);
  const intersectionHeight = Math.max(0, y2 - y1);
  const intersectionArea = intersectionWidth * intersectionHeight;

  // Calculate union
  const area1 = (b1.x2 - b1.x1) * (b1.y2 - b1.y1);
  const area2 = (b2.x2 - b2.x1) * (b2.y2 - b2.y1);
  const unionArea = area1 + area2 - intersectionArea;

  if (unionArea === 0) return 0;

  return intersectionArea / unionArea;
}
