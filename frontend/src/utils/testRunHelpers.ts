import type { BoundingBox } from '../types/api';
import type { ImageCanvasRef } from '../components/ImageCanvas';

/**
 * Generate tool abbreviations for compact display in UI
 */
export function getToolAbbreviation(toolName: string): string {
  // Split by hyphens and take first letter of each significant word
  const parts = toolName.split('-').filter((p) => p.length > 0);

  // Handle special cases
  if (toolName.includes('gemini') && toolName.includes('coordinates'))
    return 'GC';
  if (toolName.includes('gemini') && toolName.includes('validation'))
    return 'GV';
  if (toolName.includes('gemini') && toolName.includes('bbox')) return 'GB';
  if (toolName.includes('cloud') && toolName.includes('vision')) return 'CV';
  if (toolName.includes('azure') && toolName.includes('read')) return 'AR';
  if (toolName.includes('azure') && toolName.includes('layout')) return 'AL';
  if (toolName.includes('azure') && toolName.includes('document')) return 'AD';

  // Default: take first letter of first 2-3 parts (max 3 chars)
  const abbr = parts
    .slice(0, 3)
    .map((p) => p[0].toUpperCase())
    .join('');

  return abbr || toolName.substring(0, 2).toUpperCase();
}

/**
 * Normalize bounding box to always have at least 4 points
 * Converts 2-point bboxes to 4-point rectangles
 */
export function normalizeBounds(
  bounds: Array<{ x: number; y: number }>
): Array<{ x: number; y: number }> {
  // If we already have 4 or more points, return as-is
  if (bounds.length >= 4) {
    return bounds;
  }

  // If we have exactly 2 points, convert to 4-point rectangle
  if (bounds.length === 2) {
    const [topLeft, bottomRight] = bounds;
    return [
      topLeft, // Top-left
      { x: bottomRight.x, y: topLeft.y }, // Top-right
      bottomRight, // Bottom-right
      { x: topLeft.x, y: bottomRight.y }, // Bottom-left
    ];
  }

  // If we have 1 or 3 points, return as-is (can't normalize these)
  return bounds;
}

/**
 * Calculate bounding box screen position from canvas coordinates
 * Accounts for canvas zoom and pan transformations
 */
export function calculateBboxScreenPosition(
  bbox: BoundingBox,
  canvasRef: React.RefObject<ImageCanvasRef | null>
): { x: number; y: number } | null {
  if (!bbox.bounds || bbox.bounds.length === 0 || !canvasRef.current) {
    return null;
  }

  const canvas = canvasRef.current.getCanvas();
  const transform = canvasRef.current.getTransform();

  if (!canvas) {
    return null;
  }

  const normalizedBounds = normalizeBounds(bbox.bounds);

  // Calculate bbox center in world coordinates
  const centerX =
    normalizedBounds.reduce((sum, p) => sum + p.x, 0) / normalizedBounds.length;
  const centerY =
    normalizedBounds.reduce((sum, p) => sum + p.y, 0) / normalizedBounds.length;

  // Convert to canvas coordinates (accounting for zoom/pan)
  const canvasX = centerX * transform.scale + transform.translateX;
  const canvasY = centerY * transform.scale + transform.translateY;

  // Convert to screen coordinates
  const rect = canvas.getBoundingClientRect();
  const screenX = rect.left + (canvasX / canvas.width) * rect.width;
  const screenY = rect.top + (canvasY / canvas.height) * rect.height;

  return { x: screenX, y: screenY };
}
