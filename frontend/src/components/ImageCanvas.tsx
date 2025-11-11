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

    const handleMouseLeave = useCallback(() => {
      onHover(null);
    }, [onHover]);

    const handleClick = useCallback(
      (e: React.MouseEvent<HTMLCanvasElement>) => {
        if (!canvasRef.current) return;

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
      [filteredBBoxes, onSelect, scale, translateX, translateY, getCanvasDisplayScale]
    );

    const handleWheel = useCallback(
      (e: React.WheelEvent<HTMLCanvasElement>) => {
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
      [scale, translateX, translateY, getCanvasDisplayScale]
    );

    const handleDoubleClick = useCallback(() => {
      setScale(1);
      setTranslateX(0);
      setTranslateY(0);
    }, []);

    const handleMouseDown = useCallback(
      (e: React.MouseEvent<HTMLCanvasElement>) => {
        if (enablePanning && scale > 1) {
          setIsPanning(true);
          setPanStart({ x: e.clientX, y: e.clientY });
          e.preventDefault();
        }
      },
      [enablePanning, scale]
    );

    const handleMouseUp = useCallback(() => {
      setIsPanning(false);
      setPanStart(null);
    }, []);

    const handleMouseMoveWithPan = useCallback(
      (e: React.MouseEvent<HTMLCanvasElement>) => {
        if (!canvasRef.current) return;

        if (isPanning && panStart && enablePanning) {
          const deltaX = e.clientX - panStart.x;
          const deltaY = e.clientY - panStart.y;

          const canvas = canvasRef.current;
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
          onWheel={handleWheel}
          onDoubleClick={handleDoubleClick}
          className={cursorStyle}
          style={{ width: '100%', height: '100%', objectFit: 'contain' }}
        />
      </div>
    );
  }
);
