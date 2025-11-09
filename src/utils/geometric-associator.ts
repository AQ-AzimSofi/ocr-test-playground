import { db, geometricObjects, elementRelationships } from '../db/index.js';
import { eq } from 'drizzle-orm';

/**
 * Geometric Object and Dimension Association Utility
 * Matches extracted dimension text to geometric objects based on spatial proximity
 */

interface Point {
  x: number;
  y: number;
}

interface BoundingBox {
  text: string;
  bounds: Point[];
  confidence?: number;
  bboxSource?: string;
  metadata?: Record<string, any>;
}

/**
 * Calculate Euclidean distance between two points
 */
function calculateDistance(p1: Point, p2: Point): number {
  return Math.sqrt(Math.pow(p2.x - p1.x, 2) + Math.pow(p2.y - p1.y, 2));
}

/**
 * Calculate the center point of a bounding box or geometry
 */
function getCenterPoint(points: Point[]): Point {
  if (points.length === 0) {
    return { x: 0, y: 0 };
  }

  const sum = points.reduce(
    (acc, p) => ({
      x: acc.x + p.x,
      y: acc.y + p.y,
    }),
    { x: 0, y: 0 }
  );

  return {
    x: sum.x / points.length,
    y: sum.y / points.length,
  };
}

/**
 * Get the closest point on a line segment to a given point
 */
function getClosestPointOnLine(
  lineStart: Point,
  lineEnd: Point,
  point: Point
): Point {
  const A = point.x - lineStart.x;
  const B = point.y - lineStart.y;
  const C = lineEnd.x - lineStart.x;
  const D = lineEnd.y - lineStart.y;

  const dot = A * C + B * D;
  const lenSq = C * C + D * D;
  let param = -1;

  if (lenSq !== 0) {
    param = dot / lenSq;
  }

  let xx, yy;

  if (param < 0) {
    xx = lineStart.x;
    yy = lineStart.y;
  } else if (param > 1) {
    xx = lineEnd.x;
    yy = lineEnd.y;
  } else {
    xx = lineStart.x + param * C;
    yy = lineStart.y + param * D;
  }

  return { x: xx, y: yy };
}

/**
 * Calculate the minimum distance from a point to a geometric object
 */
function getDistanceToObject(point: Point, objectCoordinates: Point[]): number {
  if (objectCoordinates.length === 1) {
    // Point object - direct distance
    return calculateDistance(point, objectCoordinates[0]);
  } else if (objectCoordinates.length === 2) {
    // Line object - distance to line segment
    const closestPoint = getClosestPointOnLine(
      objectCoordinates[0],
      objectCoordinates[1],
      point
    );
    return calculateDistance(point, closestPoint);
  } else {
    // Polygon - distance to centroid (simplified)
    const center = getCenterPoint(objectCoordinates);
    return calculateDistance(point, center);
  }
}

/**
 * Check if a text string contains dimension information
 */
function isDimensionText(text: string): boolean {
  // Match patterns like: "10,920", "3,500mm", "2.5m", "150", etc.
  const dimensionPattern = /^[\d,\.]+\s*(mm|m|cm|km|ft|in|'|")?$/i;
  return dimensionPattern.test(text.trim());
}

/**
 * Extract numeric value from dimension text
 */
function extractDimensionValue(text: string): number | null {
  const cleaned = text.replace(/[,\s]/g, '');
  const match = cleaned.match(/^([\d.]+)/);
  return match ? parseFloat(match[1]) : null;
}

/**
 * Associate dimension text bounding boxes with geometric objects
 * Returns a map of geometric object ID to associated dimension text
 */
export async function associateDimensionsWithObjects(
  extractionResultId: string,
  boundingBoxes: BoundingBox[],
  drawingId: string,
  maxDistance: number = 200 // pixels
): Promise<
  Map<string, { dimension: string; distance: number; confidence: number }>
> {
  // Fetch all geometric objects for this extraction result
  const objects = await db
    .select()
    .from(geometricObjects)
    .where(eq(geometricObjects.extractionResultId, extractionResultId));

  if (objects.length === 0) {
    console.log('  No geometric objects found for association');
    return new Map();
  }

  // Filter bounding boxes to find dimension text
  const dimensionBoxes = boundingBoxes.filter((bbox) =>
    isDimensionText(bbox.text)
  );

  console.log(
    `  Found ${dimensionBoxes.length} dimension text boxes to associate`
  );

  const associations = new Map<
    string,
    { dimension: string; distance: number; confidence: number }
  >();

  // For each dimension text box, find the nearest geometric object
  for (const dimBox of dimensionBoxes) {
    const dimCenter = getCenterPoint(dimBox.bounds);
    let nearestObject: (typeof objects)[0] | null = null;
    let minDistance = Infinity;

    // Find nearest object
    for (const obj of objects) {
      if (!obj.geometry || !obj.geometry.coordinates) {
        continue;
      }

      const distance = getDistanceToObject(dimCenter, obj.geometry.coordinates);

      if (distance < minDistance && distance <= maxDistance) {
        minDistance = distance;
        nearestObject = obj;
      }
    }

    // If we found a nearby object, create association
    if (nearestObject && minDistance < maxDistance) {
      // Calculate confidence based on distance (closer = higher confidence)
      const confidence = Math.max(0, 1 - minDistance / maxDistance);

      associations.set(nearestObject.id, {
        dimension: dimBox.text,
        distance: minDistance,
        confidence,
      });

      // Save relationship to database
      await db.insert(elementRelationships).values({
        drawingId,
        sourceObjectId: nearestObject.id,
        targetType: 'dimension-text',
        targetId: dimBox.text,
        relationshipType: 'has-dimension',
        spatialData: {
          distance: minDistance,
          confidence,
        },
        metadata: {
          dimensionValue: extractDimensionValue(dimBox.text),
          textBbox: dimBox.bounds,
        },
      });

      console.log(
        `    Associated "${dimBox.text}" with ${nearestObject.objectType} (distance: ${minDistance.toFixed(1)}px, confidence: ${(confidence * 100).toFixed(1)}%)`
      );
    }
  }

  return associations;
}

/**
 * Update geometric object properties with associated dimension values
 */
export async function updateObjectsWithDimensions(
  associations: Map<
    string,
    { dimension: string; distance: number; confidence: number }
  >
): Promise<void> {
  for (const [objectId, assoc] of associations.entries()) {
    const [obj] = await db
      .select()
      .from(geometricObjects)
      .where(eq(geometricObjects.id, objectId));

    if (!obj) continue;

    const dimensionValue = extractDimensionValue(assoc.dimension);

    // Update properties based on object type
    const updatedProperties = { ...obj.properties };

    if (obj.objectType === 'wall' && dimensionValue) {
      // For walls, dimension is likely the length
      updatedProperties.length = dimensionValue;
      updatedProperties.dimension_text = assoc.dimension;
    } else if (
      (obj.objectType === 'door' || obj.objectType === 'window') &&
      dimensionValue
    ) {
      // For doors/windows, dimension is likely the width
      updatedProperties.width = dimensionValue;
      updatedProperties.dimension_text = assoc.dimension;
    } else if (obj.objectType === 'room' && dimensionValue) {
      // For rooms, could be area or a dimension
      updatedProperties.dimension_text = assoc.dimension;
    }

    // Update the object in the database
    await db
      .update(geometricObjects)
      .set({ properties: updatedProperties })
      .where(eq(geometricObjects.id, objectId));
  }

  console.log(`  Updated ${associations.size} objects with dimension values`);
}
