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
import {
  getResizeHandles,
  getHandleAtPoint,
  moveBBox,
  resizeBBox,
  createBBoxFromRect,
  clampBBoxToImage,
  getCursorForHandle,
  drawHandle,
  isPointInBBox,
  type HandleType,
} from '../utils/bboxEditor';

function normalizeBounds(
  bounds: Array<{ x: number; y: number }>
): Array<{ x: number; y: number }> {
  if (bounds.length >= 4) {
    return bounds;
  }

  if (bounds.length === 2) {
    const [topLeft, bottomRight] = bounds;
    return [
      topLeft,
      { x: bottomRight.x, y: topLeft.y },
      bottomRight,
      { x: topLeft.x, y: bottomRight.y },
    ];
  }

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
  enablePanning?: boolean;
  allowZoomOut?: boolean;
  // Edit mode props
  isEditMode?: boolean;
  isResizeMode?: boolean;
  onBBoxMove?: (index: number, newBBox: BoundingBox) => void;
  onBBoxResize?: (index: number, newBBox: BoundingBox) => void;
  onBBoxCreate?: (newBBox: BoundingBox) => void;
  onBBoxDoubleClick?: (index: number) => void;
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
      enablePanning = false,
      allowZoomOut = true,
      isEditMode = false,
      isResizeMode = false,
      onBBoxMove,
      onBBoxResize,
      onBBoxCreate,
      onBBoxDoubleClick,
    },
    ref
  ) {
    const canvasRef = useRef<HTMLCanvasElement>(null);
    const containerRef = useRef<HTMLDivElement>(null);
    const [image, setImage] = useState<HTMLImageElement | null>(null);
    const [scale, setScale] = useState(1);
    const [translateX, setTranslateX] = useState(0);
    const [translateY, setTranslateY] = useState(0);

    const [isPanning, setIsPanning] = useState(false);
    const [panStart, setPanStart] = useState<{ x: number; y: number } | null>(null);

    // Edit mode state
    const [isDrawing, setIsDrawing] = useState(false);
    const [drawStart, setDrawStart] = useState<{ x: number; y: number } | null>(null);
    const [drawCurrent, setDrawCurrent] = useState<{ x: number; y: number } | null>(null);
    const [isDraggingBBox, setIsDraggingBBox] = useState(false);
    const [draggedBBoxIndex, setDraggedBBoxIndex] = useState<number | null>(null);
    const [dragOffset, setDragOffset] = useState<{ x: number; y: number } | null>(null);
    const [resizingHandle, setResizingHandle] = useState<HandleType | null>(null);
    const [hoveredHandle, setHoveredHandle] = useState<HandleType | null>(null);

    useImperativeHandle(
      ref,
      () => ({
        canvas: canvasRef.current,
        getCanvas: () => canvasRef.current,
        getTransform: () => ({ scale, translateX, translateY }),
      }),
      [scale, translateX, translateY]
    );

    const getCanvasDisplayScale = useCallback(() => {
      if (!canvasRef.current) return { scaleX: 1, scaleY: 1, offsetX: 0, offsetY: 0 };

      const canvas = canvasRef.current;
      const rect = canvas.getBoundingClientRect();

      const canvasWidth = canvas.width;
      const canvasHeight = canvas.height;

      if (canvasWidth === 0 || canvasHeight === 0) {
        return { scaleX: 1, scaleY: 1, offsetX: 0, offsetY: 0 };
      }

      const scaleX = rect.width / canvasWidth;
      const scaleY = rect.height / canvasHeight;
      const displayScale = Math.min(scaleX, scaleY);

      const displayWidth = canvasWidth * displayScale;
      const displayHeight = canvasHeight * displayScale;
      const offsetX = (rect.width - displayWidth) / 2;
      const offsetY = (rect.height - displayHeight) / 2;

      return { scaleX: displayScale, scaleY: displayScale, offsetX, offsetY };
    }, []);

    useEffect(() => {
      const img = new Image();
      img.src = imageUrl;
      img.onload = () => {
        setImage(img);
      };
    }, [imageUrl]);

    useEffect(() => {
      if (scrollToBboxIndex === null || scrollToBboxIndex === undefined) return;
      if (!canvasRef.current || !image) return;

      const bbox = boundingBoxes[scrollToBboxIndex];
      if (!bbox || !bbox.bounds || bbox.bounds.length === 0) return;

      const canvas = canvasRef.current;
      const normalizedBounds = normalizeBounds(bbox.bounds);

      const centerX =
        normalizedBounds.reduce((sum, p) => sum + p.x, 0) /
        normalizedBounds.length;
      const centerY =
        normalizedBounds.reduce((sum, p) => sum + p.y, 0) /
        normalizedBounds.length;

      const targetScale = 2.0;

      const canvasWidth = canvas.width;
      const canvasHeight = canvas.height;

      const newTranslateX = canvasWidth / 2 - centerX * targetScale;
      const newTranslateY = canvasHeight / 2 - centerY * targetScale;

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

    const filteredBBoxes = boundingBoxes.filter((bbox) => {
      if (showOnlyLowConfidence && (bbox.confidence ?? 1) >= 0.85) return false;
      if (showOnlyGeminiUpdates && !bbox.metadata?.geminiUpdated) return false;
      if ((bbox.confidence ?? 1) < confidenceThreshold / 100) return false;
      return true;
    });

    useEffect(() => {
      if (!canvasRef.current || !image) return;

      const canvas = canvasRef.current;
      const ctx = canvas.getContext('2d');
      if (!ctx) return;

      canvas.width = image.width;
      canvas.height = image.height;

      ctx.setTransform(scale, 0, 0, scale, translateX, translateY);

      ctx.clearRect(
        -translateX / scale,
        -translateY / scale,
        canvas.width / scale,
        canvas.height / scale
      );

      ctx.drawImage(image, 0, 0);

      filteredBBoxes.forEach((bbox, index) => {
        if (!bbox.bounds || bbox.bounds.length === 0) {
          return;
        }

        const normalizedBounds = normalizeBounds(bbox.bounds);

        if (normalizedBounds.length < 3) {
          return;
        }

        const isHovered = index === hoveredIndex;
        const isSelected = index === selectedIndex;
        const confidence = bbox.confidence ?? 1;

        ctx.beginPath();
        ctx.moveTo(normalizedBounds[0].x, normalizedBounds[0].y);
        for (let i = 1; i < normalizedBounds.length; i++) {
          ctx.lineTo(normalizedBounds[i].x, normalizedBounds[i].y);
        }
        ctx.closePath();

        if (showFill) {
          const alpha = heatmapMode ? 0.7 : 0.2;
          ctx.fillStyle = getConfidenceColor(confidence, alpha);
          ctx.fill();

          const geminiUpdated = bbox.metadata?.geminiUpdated;
          const isLowConfidence = confidence < 0.85;

          let strokeColor: string;
          if (geminiUpdated && showGeminiIcons) {
            strokeColor = 'rgba(59, 130, 246, 0.9)';
          } else if (isLowConfidence) {
            strokeColor = getConfidenceColor(confidence, 0.9);
          } else {
            strokeColor = getConfidenceColor(confidence, 0.9);
          }

          ctx.strokeStyle = strokeColor;
          ctx.lineWidth = isHovered || isSelected ? 3 : 1.5;
          ctx.stroke();

          if (geminiUpdated && !heatmapMode && showGeminiIcons) {
            const x = bbox.bounds[0].x;
            const y = bbox.bounds[0].y;
            ctx.fillStyle = 'rgba(59, 130, 246, 1)';
            ctx.fillRect(x - 3, y - 15, 12, 12);

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

      // Draw resize handles only in resize mode
      if (isEditMode && isResizeMode && selectedIndex !== null && filteredBBoxes[selectedIndex]) {
        const selectedBBox = filteredBBoxes[selectedIndex];
        const handles = getResizeHandles(selectedBBox, scale);

        handles.forEach((handle) => {
          const isHovered = hoveredHandle === handle.type;
          drawHandle(ctx, handle, scale, translateX, translateY, isHovered);
        });
      }

      // Draw new bbox being created
      if (isEditMode && isDrawing && drawStart && drawCurrent) {
        ctx.save();
        ctx.setTransform(1, 0, 0, 1, 0, 0);

        ctx.strokeStyle = '#3b82f6';
        ctx.fillStyle = 'rgba(59, 130, 246, 0.2)';
        ctx.lineWidth = 2;
        ctx.setLineDash([5, 5]);

        const startX = drawStart.x * scale + translateX;
        const startY = drawStart.y * scale + translateY;
        const currentX = drawCurrent.x * scale + translateX;
        const currentY = drawCurrent.y * scale + translateY;

        const width = currentX - startX;
        const height = currentY - startY;

        ctx.fillRect(startX, startY, width, height);
        ctx.strokeRect(startX, startY, width, height);

        ctx.restore();
      }
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
      isEditMode,
      isResizeMode,
      hoveredHandle,
      isDrawing,
      drawStart,
      drawCurrent,
    ]);

    const handleMouseLeave = useCallback(() => {
      onHover(null);
    }, [onHover]);

    const handleClick = useCallback(
      (e: React.MouseEvent<HTMLCanvasElement>) => {
        if (!canvasRef.current) return;

        // Handle double-click for text editing
        if (e.detail === 2 && isEditMode && onBBoxDoubleClick && selectedIndex !== null) {
          onBBoxDoubleClick(selectedIndex);
          return;
        }

        const canvas = canvasRef.current;
        const rect = canvas.getBoundingClientRect();
        const displayScale = getCanvasDisplayScale();

        const mouseX = e.clientX - rect.left - displayScale.offsetX;
        const mouseY = e.clientY - rect.top - displayScale.offsetY;

        const canvasX = mouseX / displayScale.scaleX;
        const canvasY = mouseY / displayScale.scaleY;

        const x = (canvasX - translateX) / scale;
        const y = (canvasY - translateY) / scale;

        const index = findHoveredBBox({ x, y }, filteredBBoxes);
        onSelect(index);
      },
      [
        filteredBBoxes,
        onSelect,
        scale,
        translateX,
        translateY,
        getCanvasDisplayScale,
        isEditMode,
        onBBoxDoubleClick,
        selectedIndex,
      ]
    );

    const handleWheel = useCallback(
      (e: WheelEvent) => {
        e.preventDefault();

        if (!canvasRef.current) return;

        const canvas = canvasRef.current;
        const rect = canvas.getBoundingClientRect();
        const displayScale = getCanvasDisplayScale();

        const mouseX = e.clientX - rect.left - displayScale.offsetX;
        const mouseY = e.clientY - rect.top - displayScale.offsetY;

        const canvasX = mouseX / displayScale.scaleX;
        const canvasY = mouseY / displayScale.scaleY;

        const worldX = (canvasX - translateX) / scale;
        const worldY = (canvasY - translateY) / scale;

        const delta = -e.deltaY;
        const zoomFactor = 1 + delta * 0.001;
        const minZoom = allowZoomOut ? 0.5 : 1.0;
        const newScale = Math.max(minZoom, Math.min(5, scale * zoomFactor));

        let newTranslateX = canvasX - worldX * newScale;
        let newTranslateY = canvasY - worldY * newScale;

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
      [scale, translateX, translateY, getCanvasDisplayScale, allowZoomOut]
    );

    // Register non-passive wheel event listener to prevent default scroll behavior
    useEffect(() => {
      const canvas = canvasRef.current;
      if (!canvas) return;

      canvas.addEventListener('wheel', handleWheel, { passive: false });

      return () => {
        canvas.removeEventListener('wheel', handleWheel);
      };
    }, [handleWheel]);

    const handleDoubleClick = useCallback(() => {
      setScale(1);
      setTranslateX(0);
      setTranslateY(0);
    }, []);

    const handleMouseDown = useCallback(
      (e: React.MouseEvent<HTMLCanvasElement>) => {
        if (!canvasRef.current || !image) return;

        const canvas = canvasRef.current;
        const rect = canvas.getBoundingClientRect();
        const displayScale = getCanvasDisplayScale();

        const mouseX = e.clientX - rect.left - displayScale.offsetX;
        const mouseY = e.clientY - rect.top - displayScale.offsetY;

        const canvasX = mouseX / displayScale.scaleX;
        const canvasY = mouseY / displayScale.scaleY;

        const x = (canvasX - translateX) / scale;
        const y = (canvasY - translateY) / scale;

        // Edit mode operations
        if (isEditMode) {
          // Check if clicking on a resize handle
          if (selectedIndex !== null && filteredBBoxes[selectedIndex]) {
            const selectedBBox = filteredBBoxes[selectedIndex];
            const handles = getResizeHandles(selectedBBox, scale);
            const handle = getHandleAtPoint(handles, x, y, scale);

            if (handle) {
              setResizingHandle(handle.type);
              e.preventDefault();
              return;
            }
          }

          // Check if clicking on a bbox to drag it
          const clickedIndex = findHoveredBBox({ x, y }, filteredBBoxes);
          if (clickedIndex !== null) {
            const bbox = filteredBBoxes[clickedIndex];
            setIsDraggingBBox(true);
            setDraggedBBoxIndex(clickedIndex);
            // Calculate offset from bbox top-left corner
            const minX = Math.min(...bbox.bounds.map((p) => p.x));
            const minY = Math.min(...bbox.bounds.map((p) => p.y));
            setDragOffset({ x: x - minX, y: y - minY });
            e.preventDefault();
            return;
          }

          // Start drawing new bbox
          setIsDrawing(true);
          setDrawStart({ x, y });
          setDrawCurrent({ x, y });
          e.preventDefault();
          return;
        }

        // Default panning behavior
        if (enablePanning && scale > 1) {
          setIsPanning(true);
          setPanStart({ x: e.clientX, y: e.clientY });
          e.preventDefault();
        }
      },
      [
        enablePanning,
        scale,
        isEditMode,
        selectedIndex,
        filteredBBoxes,
        translateX,
        translateY,
        getCanvasDisplayScale,
        image,
      ]
    );

    const handleMouseUp = useCallback(() => {
      if (!image) return;

      // Finish drawing new bbox
      if (isDrawing && drawStart && drawCurrent && onBBoxCreate) {
        const minX = Math.min(drawStart.x, drawCurrent.x);
        const maxX = Math.max(drawStart.x, drawCurrent.x);
        const minY = Math.min(drawStart.y, drawCurrent.y);
        const maxY = Math.max(drawStart.y, drawCurrent.y);

        // Only create if bbox has minimum size
        if (maxX - minX > 10 && maxY - minY > 10) {
          const newBBox = createBBoxFromRect(
            minX,
            minY,
            maxX,
            maxY,
            '', // Empty text, will be filled via modal
            undefined
          );
          const clampedBBox = clampBBoxToImage(newBBox, image.width, image.height);
          onBBoxCreate(clampedBBox);
        }
      }

      // Reset all edit states
      setIsDrawing(false);
      setDrawStart(null);
      setDrawCurrent(null);
      setIsDraggingBBox(false);
      setDraggedBBoxIndex(null);
      setDragOffset(null);
      setResizingHandle(null);

      // Reset panning
      setIsPanning(false);
      setPanStart(null);
    }, [
      isDrawing,
      drawStart,
      drawCurrent,
      onBBoxCreate,
      image,
    ]);

    const handleMouseMoveWithPan = useCallback(
      (e: React.MouseEvent<HTMLCanvasElement>) => {
        if (!canvasRef.current || !image) return;

        const canvas = canvasRef.current;
        const rect = canvas.getBoundingClientRect();
        const displayScale = getCanvasDisplayScale();

        const mouseX = e.clientX - rect.left - displayScale.offsetX;
        const mouseY = e.clientY - rect.top - displayScale.offsetY;

        const canvasX = mouseX / displayScale.scaleX;
        const canvasY = mouseY / displayScale.scaleY;

        const x = (canvasX - translateX) / scale;
        const y = (canvasY - translateY) / scale;

        // Handle edit mode operations
        if (isEditMode) {
          // Update drawing rect
          if (isDrawing && drawStart) {
            setDrawCurrent({ x, y });
            return;
          }

          // Drag bbox
          if (isDraggingBBox && draggedBBoxIndex !== null && dragOffset && onBBoxMove) {
            const bbox = filteredBBoxes[draggedBBoxIndex];
            if (bbox) {
              const currentMinX = Math.min(...bbox.bounds.map((p) => p.x));
              const currentMinY = Math.min(...bbox.bounds.map((p) => p.y));
              const newMinX = x - dragOffset.x;
              const newMinY = y - dragOffset.y;
              const deltaX = newMinX - currentMinX;
              const deltaY = newMinY - currentMinY;

              const movedBBox = moveBBox(bbox, deltaX, deltaY);
              const clampedBBox = clampBBoxToImage(movedBBox, image.width, image.height);
              onBBoxMove(draggedBBoxIndex, clampedBBox);
            }
            return;
          }

          // Resize bbox
          if (resizingHandle && selectedIndex !== null && onBBoxResize) {
            const bbox = filteredBBoxes[selectedIndex];
            if (bbox) {
              const resizedBBox = resizeBBox(bbox, resizingHandle, x, y);
              const clampedBBox = clampBBoxToImage(resizedBBox, image.width, image.height);
              onBBoxResize(selectedIndex, clampedBBox);
            }
            return;
          }

          // Detect hovered handle
          if (selectedIndex !== null && filteredBBoxes[selectedIndex]) {
            const selectedBBox = filteredBBoxes[selectedIndex];
            const handles = getResizeHandles(selectedBBox, scale);
            const handle = getHandleAtPoint(handles, x, y, scale);
            setHoveredHandle(handle ? handle.type : null);

            // Update cursor
            if (handle && canvasRef.current) {
              canvasRef.current.style.cursor = getCursorForHandle(handle.type);
              return;
            }
          }

          // Check if hovering over a bbox (for move cursor)
          const hoveredBBoxIndex = findHoveredBBox({ x, y }, filteredBBoxes);
          if (hoveredBBoxIndex !== null && canvasRef.current) {
            canvasRef.current.style.cursor = 'move';
            onHover(hoveredBBoxIndex);
            return;
          }

          // Default cursor in edit mode
          if (canvasRef.current) {
            canvasRef.current.style.cursor = 'crosshair';
          }
          onHover(null);
          return;
        }

        // Handle panning
        if (isPanning && panStart && enablePanning) {
          const deltaX = e.clientX - panStart.x;
          const deltaY = e.clientY - panStart.y;

          let newTranslateX = translateX + deltaX;
          let newTranslateY = translateY + deltaY;

          const minTranslateX = Math.min(0, canvas.width - canvas.width * scale);
          const minTranslateY = Math.min(0, canvas.height - canvas.height * scale);

          newTranslateX = Math.max(minTranslateX, Math.min(0, newTranslateX));
          newTranslateY = Math.max(minTranslateY, Math.min(0, newTranslateY));

          setTranslateX(newTranslateX);
          setTranslateY(newTranslateY);
          setPanStart({ x: e.clientX, y: e.clientY });
          return;
        }

        // Default hover detection
        const index = findHoveredBBox({ x, y }, filteredBBoxes);
        onHover(index);
      },
      [
        isPanning,
        panStart,
        enablePanning,
        filteredBBoxes,
        onHover,
        scale,
        translateX,
        translateY,
        getCanvasDisplayScale,
        isEditMode,
        isDrawing,
        drawStart,
        isDraggingBBox,
        draggedBBoxIndex,
        dragOffset,
        onBBoxMove,
        resizingHandle,
        selectedIndex,
        onBBoxResize,
        image,
      ]
    );

    if (!image) {
      return (
        <div className="flex items-center justify-center h-96 bg-gray-100 rounded-lg">
          <div className="text-gray-500">Loading image...</div>
        </div>
      );
    }

    const cursorStyle = enablePanning && scale > 1
      ? isPanning
        ? 'cursor-grabbing'
        : 'cursor-grab'
      : 'cursor-crosshair';

    return (
      <div
        ref={containerRef}
        className="relative w-full h-full overflow-hidden bg-gray-900 rounded-lg flex items-center justify-center"
      >
        <canvas
          ref={canvasRef}
          onMouseMove={handleMouseMoveWithPan}
          onMouseLeave={handleMouseLeave}
          onMouseDown={handleMouseDown}
          onMouseUp={handleMouseUp}
          onClick={handleClick}
          onDoubleClick={handleDoubleClick}
          className={cursorStyle}
          style={{ width: '100%', height: '100%', objectFit: 'contain' }}
        />
      </div>
    );
  }
);
