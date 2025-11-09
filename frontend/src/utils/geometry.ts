import type { BoundingBox } from '../types/api';

/**
 * Point-in-polygon algorithm (ray casting)
 * Returns true if point is inside the polygon
 */
export function isPointInPolygon(
  point: { x: number; y: number },
  polygon: Array<{ x: number; y: number }>
): boolean {
  let inside = false;
  const x = point.x;
  const y = point.y;

  for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i++) {
    const xi = polygon[i].x;
    const yi = polygon[i].y;
    const xj = polygon[j].x;
    const yj = polygon[j].y;

    const intersect =
      yi > y !== yj > y && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi;

    if (intersect) inside = !inside;
  }

  return inside;
}

/**
 * Find which bounding box contains the mouse point
 */
export function findHoveredBBox(
  mousePos: { x: number; y: number },
  boundingBoxes: BoundingBox[]
): number | null {
  for (let i = boundingBoxes.length - 1; i >= 0; i--) {
    const bbox = boundingBoxes[i];
    if (bbox.bounds && isPointInPolygon(mousePos, bbox.bounds)) {
      return i;
    }
  }
  return null;
}

/**
 * Get bounding rectangle from polygon bounds
 */
export function getBoundingRect(bounds: Array<{ x: number; y: number }>) {
  if (bounds.length === 0) {
    return { left: 0, top: 0, right: 0, bottom: 0, width: 0, height: 0 };
  }

  const xs = bounds.map((p) => p.x);
  const ys = bounds.map((p) => p.y);

  const left = Math.min(...xs);
  const right = Math.max(...xs);
  const top = Math.min(...ys);
  const bottom = Math.max(...ys);

  return {
    left,
    top,
    right,
    bottom,
    width: right - left,
    height: bottom - top,
  };
}

/**
 * Check if two bounding boxes overlap (for synchronized hover in comparison view)
 */
export function doBBoxesOverlap(
  bbox1: BoundingBox,
  bbox2: BoundingBox
): boolean {
  const rect1 = getBoundingRect(bbox1.bounds);
  const rect2 = getBoundingRect(bbox2.bounds);

  return !(
    rect1.right < rect2.left ||
    rect1.left > rect2.right ||
    rect1.bottom < rect2.top ||
    rect1.top > rect2.bottom
  );
}
