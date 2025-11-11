import { useLayoutEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import type { BoundingBox } from '../types/api';
import { getConfidenceBadgeClass, getConfidenceLabel } from '../utils/colors';
import { CheckmarkIcon } from './icons';

interface TooltipProps {
  bbox: BoundingBox;
  position: { x: number; y: number };
}

export function Tooltip({ bbox, position }: TooltipProps) {
  const tooltipRef = useRef<HTMLDivElement>(null);
  const [adjustedPosition, setAdjustedPosition] = useState({ x: position.x + 10, y: position.y + 10 });

  // Calculate adjusted position to keep tooltip within viewport bounds
  useLayoutEffect(() => {
    if (!tooltipRef.current) return;

    const rect = tooltipRef.current.getBoundingClientRect();
    const viewportWidth = window.innerWidth;
    const viewportHeight = window.innerHeight;
    const margin = 10; // Safety margin from viewport edges

    let newX = position.x + 10;
    let newY = position.y + 10;

    // Check if tooltip would extend past right edge
    if (newX + rect.width > viewportWidth - margin) {
      // Flip to left side of cursor
      newX = position.x - rect.width - 10;
    }

    // Check if tooltip would extend past bottom edge
    if (newY + rect.height > viewportHeight - margin) {
      // Flip to above cursor
      newY = position.y - rect.height - 10;
    }

    // Ensure tooltip doesn't go off left edge
    if (newX < margin) {
      newX = margin;
    }

    // Ensure tooltip doesn't go off top edge
    if (newY < margin) {
      newY = margin;
    }

    setAdjustedPosition({ x: newX, y: newY });
  }, [position.x, position.y]);
  const geminiUpdated = bbox.metadata?.geminiUpdated;
  const confidence = (bbox.confidence ?? 1) * 100;
  const isLowConfidence = (bbox.confidence ?? 1) < 0.85;

  // Determine processing status
  let processingStatus: {
    text: string;
    color: string;
    bgColor: string;
    borderColor: string;
  };

  if (geminiUpdated) {
    processingStatus = {
      text: 'Corrected by Gemini',
      color: 'text-blue-700',
      bgColor: 'bg-blue-50',
      borderColor: 'border-blue-200',
    };
  } else if (isLowConfidence) {
    processingStatus = {
      text: 'Sent to Gemini (no changes)',
      color: 'text-yellow-700',
      bgColor: 'bg-yellow-50',
      borderColor: 'border-yellow-200',
    };
  } else {
    processingStatus = {
      text: 'High confidence (not sent)',
      color: 'text-green-700',
      bgColor: 'bg-green-50',
      borderColor: 'border-green-200',
    };
  }

  const tooltipContent = (
    <div
      ref={tooltipRef}
      className="fixed z-50 bg-white rounded-lg shadow-xl border border-gray-200 p-4 max-w-sm pointer-events-none"
      style={{
        left: adjustedPosition.x,
        top: adjustedPosition.y,
      }}
    >
      {/* Text */}
      <div className="text-lg font-semibold mb-2">{bbox.text}</div>

      {/* Confidence badge */}
      <div className="flex items-center gap-2 mb-2">
        <span
          className={`px-2 py-1 rounded text-xs font-medium border ${getConfidenceBadgeClass(
            bbox.confidence
          )}`}
        >
          {getConfidenceLabel(bbox.confidence)}
        </span>
        <span className="text-sm text-gray-600">{confidence.toFixed(1)}%</span>
      </div>

      {/* Source */}
      <div className="text-xs text-gray-500 mb-2">
        Source:{' '}
        <span className="font-medium">
          {bbox.metadata?.source || 'Unknown'}
        </span>
      </div>

      {/* Processing Status */}
      <div
        className={`p-2 rounded border ${processingStatus.bgColor} ${processingStatus.borderColor}`}
      >
        <div
          className={`text-xs font-medium ${processingStatus.color} flex items-center gap-1`}
        >
          {geminiUpdated && <CheckmarkIcon size={12} />}
          {processingStatus.text}
        </div>
        {isLowConfidence && (
          <div className="text-xs text-gray-500 mt-1">
            Low confidence regions (&lt;85%) are sent to Gemini for verification
          </div>
        )}
      </div>

      {/* Gemini update details */}
      {geminiUpdated && (
        <div className="mt-2 p-2 bg-blue-50 border border-blue-200 rounded">
          {bbox.metadata?.originalText && (
            <div className="text-xs space-y-1">
              <div className="text-gray-600">
                <span className="font-medium">Original:</span>{' '}
                {bbox.metadata.originalText}
              </div>
              <div className="text-gray-600">
                <span className="font-medium">Corrected:</span> {bbox.text}
              </div>
            </div>
          )}
          {bbox.metadata?.updateReason && (
            <div className="text-xs text-gray-500 mt-1">
              Reason: {bbox.metadata.updateReason}
            </div>
          )}
        </div>
      )}
    </div>
  );

  // Render tooltip using portal to bypass parent overflow constraints
  return createPortal(tooltipContent, document.body);
}
