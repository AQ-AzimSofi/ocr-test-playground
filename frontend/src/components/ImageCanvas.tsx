import {
  useEffect,
  useRef,
  useState,
  useCallback,
  forwardRef,
  useImperativeHandle,
} from 'react';
import type { BoundingBox } from '../types/api';
import { getConfidenceColor } from '../utils/colors';
import { findHoveredBBox } from '../utils/geometry';

/**
 * Normalize bounding box to always have at least 4 points
 * Azure API sometimes returns only 2 points (diagonal corners)
 * This converts 2-point boxes to proper 4-point rectangles
 */
function normalizeBounds(
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

interface ImageCanvasProps {
  imageUrl: string;
  boundingBoxes: BoundingBox[];
  hoveredIndex: number | null;
  onHover: (index: number | null) => void;
  selectedIndex: number | null;
  onSelect: (index: number | null) => void;
  heatmapMode?: boolean;
  confidenceThreshold?: number;
  showOnlyLowConfidence?: boolean;
  showOnlyGeminiUpdates?: boolean;
  showGeminiIcons?: boolean;
  scrollToBboxIndex?: number | null;
  showFill?: boolean;
}

export interface ImageCanvasRef {
  canvas: HTMLCanvasElement | null;
  getCanvas: () => HTMLCanvasElement | null;
  getTransform: () => { scale: number; translateX: number; translateY: number };
}

export const ImageCanvas = forwardRef<ImageCanvasRef, ImageCanvasProps>(
  function ImageCanvas(
    {
      imageUrl,
      boundingBoxes,
      hoveredIndex,
      onHover,
      selectedIndex,
      onSelect,
      heatmapMode = false,
      confidenceThreshold = 0,
      showOnlyLowConfidence = false,
      showOnlyGeminiUpdates = false,
      showGeminiIcons = true,
      scrollToBboxIndex = null,
      showFill = true,
    },
    ref
  ) {
    const canvasRef = useRef<HTMLCanvasElement>(null);
    const containerRef = useRef<HTMLDivElement>(null);
    const [image, setImage] = useState<HTMLImageElement | null>(null);
    const [scale, setScale] = useState(1);
    const [translateX, setTranslateX] = useState(0);
    const [translateY, setTranslateY] = useState(0);

    // Expose canvas and transform state through ref
    useImperativeHandle(
      ref,
      () => ({
        canvas: canvasRef.current,
        getCanvas: () => canvasRef.current,
        getTransform: () => ({ scale, translateX, translateY }),
      }),
      [scale, translateX, translateY]
    );

    // Load image
    useEffect(() => {
      const img = new Image();
      img.src = imageUrl;
      img.onload = () => {
        setImage(img);
      };
    }, [imageUrl]);

    // Scroll to bbox when requested
    useEffect(() => {
      if (scrollToBboxIndex === null || scrollToBboxIndex === undefined) return;
      if (!canvasRef.current || !image) return;

      const bbox = boundingBoxes[scrollToBboxIndex];
      if (!bbox || !bbox.bounds || bbox.bounds.length === 0) return;

      const canvas = canvasRef.current;
      const normalizedBounds = normalizeBounds(bbox.bounds);

      // Calculate bbox center
      const centerX =
        normalizedBounds.reduce((sum, p) => sum + p.x, 0) /
        normalizedBounds.length;
      const centerY =
        normalizedBounds.reduce((sum, p) => sum + p.y, 0) /
        normalizedBounds.length;

      // Zoom in a bit (2x zoom) and center on the bbox
      const targetScale = 2.0;

      // Calculate translate to center the bbox in the canvas
      const canvasWidth = canvas.width;
      const canvasHeight = canvas.height;

      const newTranslateX = canvasWidth / 2 - centerX * targetScale;
      const newTranslateY = canvasHeight / 2 - centerY * targetScale;

      // Clamp translate values
      const minTranslateX = Math.min(
        0,
        canvasWidth - canvasWidth * targetScale
      );
      const minTranslateY = Math.min(
        0,
        canvasHeight - canvasHeight * targetScale
      );

      const clampedTranslateX = Math.max(
        minTranslateX,
        Math.min(0, newTranslateX)
      );
      const clampedTranslateY = Math.max(
        minTranslateY,
        Math.min(0, newTranslateY)
      );

      setScale(targetScale);
      setTranslateX(clampedTranslateX);
      setTranslateY(clampedTranslateY);
    }, [scrollToBboxIndex, boundingBoxes, image]);

    // Filter bounding boxes based on criteria
    const filteredBBoxes = boundingBoxes.filter((bbox) => {
      if (showOnlyLowConfidence && (bbox.confidence ?? 1) >= 0.85) return false;
      if (showOnlyGeminiUpdates && !bbox.metadata?.geminiUpdated) return false;
      if ((bbox.confidence ?? 1) < confidenceThreshold / 100) return false;
      return true;
    });

    // Draw canvas
    useEffect(() => {
      if (!canvasRef.current || !image) return;

      const canvas = canvasRef.current;
      const ctx = canvas.getContext('2d');
      if (!ctx) return;

      // Set canvas size to match image
      canvas.width = image.width;
      canvas.height = image.height;

      // Apply transformation (scale and translate for zoom)
      ctx.setTransform(scale, 0, 0, scale, translateX, translateY);

      // Clear canvas (in transformed space)
      ctx.clearRect(
        -translateX / scale,
        -translateY / scale,
        canvas.width / scale,
        canvas.height / scale
      );

      // Draw image
      ctx.drawImage(image, 0, 0);

      // Draw bounding boxes
      filteredBBoxes.forEach((bbox, index) => {
        if (!bbox.bounds || bbox.bounds.length === 0) {
          console.warn('[ImageCanvas] Skipping invalid bbox (no bounds):', {
            index,
            text: bbox.text,
            boundsLength: bbox.bounds?.length ?? 0,
            confidence: bbox.confidence,
            metadata: bbox.metadata,
          });
          return;
        }

        // Normalize bounds (convert 2-point to 4-point if needed)
        const normalizedBounds = normalizeBounds(bbox.bounds);

        // Skip if still invalid after normalization
        if (normalizedBounds.length < 3) {
          console.warn(
            '[ImageCanvas] Skipping bbox with insufficient points after normalization:',
            {
              index,
              text: bbox.text,
              boundsLength: normalizedBounds.length,
              bounds: normalizedBounds,
              confidence: bbox.confidence,
              metadata: bbox.metadata,
            }
          );
          return;
        }

        const isHovered = index === hoveredIndex;
        const isSelected = index === selectedIndex;
        const confidence = bbox.confidence ?? 1;

        // Begin path
        ctx.beginPath();
        ctx.moveTo(normalizedBounds[0].x, normalizedBounds[0].y);
        for (let i = 1; i < normalizedBounds.length; i++) {
          ctx.lineTo(normalizedBounds[i].x, normalizedBounds[i].y);
        }
        ctx.closePath();

        // Only render fill and stroke if showFill is true
        if (showFill) {
          // Fill with confidence color
          const alpha = heatmapMode ? 0.7 : 0.2;
          ctx.fillStyle = getConfidenceColor(confidence, alpha);
          ctx.fill();

          // Stroke - color-coded by processing status
          const geminiUpdated = bbox.metadata?.geminiUpdated;
          const isLowConfidence = confidence < 0.85;

          let strokeColor: string;
          if (geminiUpdated && showGeminiIcons) {
            // Blue for Gemini-corrected (only if showGeminiIcons is true)
            strokeColor = 'rgba(59, 130, 246, 0.9)';
          } else if (isLowConfidence) {
            // Yellow/orange/red for low confidence (sent to Gemini but not corrected)
            strokeColor = getConfidenceColor(confidence, 0.9);
          } else {
            // Green for high confidence (not sent to Gemini)
            strokeColor = getConfidenceColor(confidence, 0.9);
          }

          ctx.strokeStyle = strokeColor;
          ctx.lineWidth = isHovered || isSelected ? 3 : 1.5;
          ctx.stroke();

          // Add badge for Gemini-updated (larger and more visible)
          if (geminiUpdated && !heatmapMode && showGeminiIcons) {
            const x = bbox.bounds[0].x;
            const y = bbox.bounds[0].y;
            ctx.fillStyle = 'rgba(59, 130, 246, 1)'; // Fully opaque blue
            ctx.fillRect(x - 3, y - 15, 12, 12);

            // Draw white checkmark path
            ctx.strokeStyle = 'white';
            ctx.lineWidth = 1.5;
            ctx.lineCap = 'round';
            ctx.lineJoin = 'round';
            ctx.beginPath();
            ctx.moveTo(x - 1, y - 9);
            ctx.lineTo(x + 1, y - 7);
            ctx.lineTo(x + 5, y - 11);
            ctx.stroke();
          }
        }
      });
    }, [
      image,
      filteredBBoxes,
      hoveredIndex,
      selectedIndex,
      heatmapMode,
      showGeminiIcons,
      showFill,
      scale,
      translateX,
      translateY,
    ]);

    // Handle mouse move
    const handleMouseMove = useCallback(
      (e: React.MouseEvent<HTMLCanvasElement>) => {
        if (!canvasRef.current) return;

        const canvas = canvasRef.current;
        const rect = canvas.getBoundingClientRect();

        // Convert to canvas coordinates
        const canvasX = ((e.clientX - rect.left) / rect.width) * canvas.width;
        const canvasY = ((e.clientY - rect.top) / rect.height) * canvas.height;

        // Convert to world coordinates (accounting for zoom/pan)
        const x = (canvasX - translateX) / scale;
        const y = (canvasY - translateY) / scale;

        const index = findHoveredBBox({ x, y }, filteredBBoxes);
        onHover(index);
      },
      [filteredBBoxes, onHover, scale, translateX, translateY]
    );

    // Handle mouse leave
    const handleMouseLeave = useCallback(() => {
      onHover(null);
    }, [onHover]);

    // Handle click
    const handleClick = useCallback(
      (e: React.MouseEvent<HTMLCanvasElement>) => {
        if (!canvasRef.current) return;

        const canvas = canvasRef.current;
        const rect = canvas.getBoundingClientRect();

        // Convert to canvas coordinates
        const canvasX = ((e.clientX - rect.left) / rect.width) * canvas.width;
        const canvasY = ((e.clientY - rect.top) / rect.height) * canvas.height;

        // Convert to world coordinates (accounting for zoom/pan)
        const x = (canvasX - translateX) / scale;
        const y = (canvasY - translateY) / scale;

        const index = findHoveredBBox({ x, y }, filteredBBoxes);
        onSelect(index);
      },
      [filteredBBoxes, onSelect, scale, translateX, translateY]
    );

    // Handle mouse wheel for zooming
    const handleWheel = useCallback(
      (e: React.WheelEvent<HTMLCanvasElement>) => {
        e.preventDefault();

        if (!canvasRef.current) return;

        const canvas = canvasRef.current;
        const rect = canvas.getBoundingClientRect();

        // Get mouse position in canvas coordinates
        const canvasX = ((e.clientX - rect.left) / rect.width) * canvas.width;
        const canvasY = ((e.clientY - rect.top) / rect.height) * canvas.height;

        // Get mouse position in world coordinates (before zoom)
        const worldX = (canvasX - translateX) / scale;
        const worldY = (canvasY - translateY) / scale;

        // Calculate new scale (zoom in/out)
        const delta = -e.deltaY; // Negative delta = zoom in, positive = zoom out
        const zoomFactor = 1 + delta * 0.001; // Adjust sensitivity
        const newScale = Math.max(1.0, Math.min(5, scale * zoomFactor)); // Min: 1.0 (original size), Max: 5.0

        // Calculate new translate to keep mouse position fixed
        let newTranslateX = canvasX - worldX * newScale;
        let newTranslateY = canvasY - worldY * newScale;

        // Clamp translate values to keep image within canvas bounds
        // When scale = 1.0, translate must be (0, 0)
        // When scale > 1.0, translate range is [canvas.width - image.width * scale, 0]
        const minTranslateX = Math.min(
          0,
          canvas.width - canvas.width * newScale
        );
        const minTranslateY = Math.min(
          0,
          canvas.height - canvas.height * newScale
        );

        newTranslateX = Math.max(minTranslateX, Math.min(0, newTranslateX));
        newTranslateY = Math.max(minTranslateY, Math.min(0, newTranslateY));

        setScale(newScale);
        setTranslateX(newTranslateX);
        setTranslateY(newTranslateY);
      },
      [scale, translateX, translateY]
    );

    // Handle double click to reset zoom
    const handleDoubleClick = useCallback(() => {
      setScale(1);
      setTranslateX(0);
      setTranslateY(0);
    }, []);

    if (!image) {
      return (
        <div className="flex items-center justify-center h-96 bg-gray-100 rounded-lg">
          <div className="text-gray-500">Loading image...</div>
        </div>
      );
    }

    return (
      <div
        ref={containerRef}
        className="relative w-full overflow-auto bg-gray-900 rounded-lg"
      >
        <canvas
          ref={canvasRef}
          onMouseMove={handleMouseMove}
          onMouseLeave={handleMouseLeave}
          onClick={handleClick}
          onWheel={handleWheel}
          onDoubleClick={handleDoubleClick}
          className="cursor-crosshair"
          style={{ maxWidth: '100%', height: 'auto' }}
        />
      </div>
    );
  }
);
