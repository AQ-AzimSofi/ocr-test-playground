import type { BoundingBox } from '../types/api';

export type HandleType =
  | 'top-left'
  | 'top-right'
  | 'bottom-left'
  | 'bottom-right'
  | 'top'
  | 'right'
  | 'bottom'
  | 'left';

export type Handle = {
  type: HandleType;
  x: number;
  y: number;
};

const HANDLE_SIZE = 8; // Size of resize handles in pixels

/**
 * Get bounding rectangle from polygon bounds
 */
export function getBoundingRect(bounds: Array<{ x: number; y: number }>) {
  if (bounds.length === 0) {
    return { minX: 0, minY: 0, maxX: 0, maxY: 0, width: 0, height: 0 };
  }

  const xs = bounds.map((p) => p.x);
  const ys = bounds.map((p) => p.y);

  const minX = Math.min(...xs);
  const maxX = Math.max(...xs);
  const minY = Math.min(...ys);
  const maxY = Math.max(...ys);

  return {
    minX,
    minY,
    maxX,
    maxY,
    width: maxX - minX,
    height: maxY - minY,
  };
}

/**
 * Generate resize handles for a bbox (8 handles: 4 corners + 4 edges)
 */
export function getResizeHandles(
  bbox: BoundingBox,
  _scale: number = 1
): Handle[] {
  const rect = getBoundingRect(bbox.bounds);
  const { minX, minY, maxX, maxY } = rect;
  const midX = (minX + maxX) / 2;
  const midY = (minY + maxY) / 2;

  return [
    { type: 'top-left', x: minX, y: minY },
    { type: 'top', x: midX, y: minY },
    { type: 'top-right', x: maxX, y: minY },
    { type: 'right', x: maxX, y: midY },
    { type: 'bottom-right', x: maxX, y: maxY },
    { type: 'bottom', x: midX, y: maxY },
    { type: 'bottom-left', x: minX, y: maxY },
    { type: 'left', x: minX, y: midY },
  ];
}

/**
 * Check if a point is near a handle
 */
export function getHandleAtPoint(
  handles: Handle[],
  x: number,
  y: number,
  scale: number = 1
): Handle | null {
  const threshold = HANDLE_SIZE / scale;

  for (const handle of handles) {
    const distance = Math.sqrt(
      Math.pow(x - handle.x, 2) + Math.pow(y - handle.y, 2)
    );
    if (distance <= threshold) {
      return handle;
    }
  }

  return null;
}

/**
 * Move bbox by delta
 */
export function moveBBox(
  bbox: BoundingBox,
  deltaX: number,
  deltaY: number
): BoundingBox {
  return {
    ...bbox,
    bounds: bbox.bounds.map((point) => ({
      x: point.x + deltaX,
      y: point.y + deltaY,
    })),
  };
}

/**
 * Resize bbox using a handle
 */
export function resizeBBox(
  bbox: BoundingBox,
  handleType: HandleType,
  newX: number,
  newY: number
): BoundingBox {
  const rect = getBoundingRect(bbox.bounds);
  let { minX, minY, maxX, maxY } = rect;

  // Update bounds based on handle type
  switch (handleType) {
    case 'top-left':
      minX = newX;
      minY = newY;
      break;
    case 'top':
      minY = newY;
      break;
    case 'top-right':
      maxX = newX;
      minY = newY;
      break;
    case 'right':
      maxX = newX;
      break;
    case 'bottom-right':
      maxX = newX;
      maxY = newY;
      break;
    case 'bottom':
      maxY = newY;
      break;
    case 'bottom-left':
      minX = newX;
      maxY = newY;
      break;
    case 'left':
      minX = newX;
      break;
  }

  // Ensure minimum size
  const MIN_SIZE = 10;
  if (maxX - minX < MIN_SIZE) {
    if (handleType.includes('left')) {
      minX = maxX - MIN_SIZE;
    } else {
      maxX = minX + MIN_SIZE;
    }
  }
  if (maxY - minY < MIN_SIZE) {
    if (handleType.includes('top')) {
      minY = maxY - MIN_SIZE;
    } else {
      maxY = minY + MIN_SIZE;
    }
  }

  // Convert back to polygon (rectangle)
  return {
    ...bbox,
    bounds: [
      { x: minX, y: minY },
      { x: maxX, y: minY },
      { x: maxX, y: maxY },
      { x: minX, y: maxY },
    ],
  };
}

/**
 * Create bbox from drag rectangle
 */
export function createBBoxFromRect(
  startX: number,
  startY: number,
  endX: number,
  endY: number,
  text: string = '',
  confidence?: number
): BoundingBox {
  const minX = Math.min(startX, endX);
  const maxX = Math.max(startX, endX);
  const minY = Math.min(startY, endY);
  const maxY = Math.max(startY, endY);

  return {
    text,
    bounds: [
      { x: minX, y: minY },
      { x: maxX, y: minY },
      { x: maxX, y: maxY },
      { x: minX, y: maxY },
    ],
    confidence,
    metadata: {
      source: 'manual',
    },
  };
}

/**
 * Clamp bbox bounds to stay within image dimensions
 */
export function clampBBoxToImage(
  bbox: BoundingBox,
  imageWidth: number,
  imageHeight: number
): BoundingBox {
  return {
    ...bbox,
    bounds: bbox.bounds.map((point) => ({
      x: Math.max(0, Math.min(imageWidth, point.x)),
      y: Math.max(0, Math.min(imageHeight, point.y)),
    })),
  };
}

/**
 * Get cursor style for handle type
 */
export function getCursorForHandle(handleType: HandleType): string {
  const cursors: Record<HandleType, string> = {
    'top-left': 'nw-resize',
    'top': 'n-resize',
    'top-right': 'ne-resize',
    'right': 'e-resize',
    'bottom-right': 'se-resize',
    'bottom': 's-resize',
    'bottom-left': 'sw-resize',
    'left': 'w-resize',
  };
  return cursors[handleType];
}

/**
 * Draw resize handle on canvas
 */
export function drawHandle(
  ctx: CanvasRenderingContext2D,
  handle: Handle,
  scale: number,
  translateX: number,
  translateY: number,
  isHovered: boolean = false
) {
  const screenX = handle.x * scale + translateX;
  const screenY = handle.y * scale + translateY;
  const size = HANDLE_SIZE;

  ctx.save();
  ctx.fillStyle = isHovered ? '#3b82f6' : '#ffffff';
  ctx.strokeStyle = '#000000';
  ctx.lineWidth = 1;

  ctx.fillRect(screenX - size / 2, screenY - size / 2, size, size);
  ctx.strokeRect(screenX - size / 2, screenY - size / 2, size, size);
  ctx.restore();
}

/**
 * Check if point is inside bbox bounds (for move detection)
 */
export function isPointInBBox(
  x: number,
  y: number,
  bbox: BoundingBox
): boolean {
  const rect = getBoundingRect(bbox.bounds);
  return (
    x >= rect.minX && x <= rect.maxX && y >= rect.minY && y <= rect.maxY
  );
}
