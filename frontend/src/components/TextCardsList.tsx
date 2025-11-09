import { useEffect, useRef } from 'react';
import type { BoundingBox } from '../types/api';

interface TextCardsListProps {
  boundingBoxes: BoundingBox[];
  selectedIndex: number | null;
  onCardClick: (index: number) => void;
  toolName: string;
}

export function TextCardsList({
  boundingBoxes,
  selectedIndex,
  onCardClick,
  toolName,
}: TextCardsListProps) {
  const selectedCardRef = useRef<HTMLButtonElement>(null);

  // Scroll selected card into view
  useEffect(() => {
    if (selectedCardRef.current) {
      selectedCardRef.current.scrollIntoView({
        behavior: 'smooth',
        block: 'nearest',
      });
    }
  }, [selectedIndex]);
  // Helper to get confidence color
  const getConfidenceColor = (confidence?: number): string => {
    if (!confidence) return 'gray';
    if (confidence >= 0.85) return 'green';
    if (confidence >= 0.7) return 'yellow';
    return 'red';
  };

  // Helper to get confidence badge classes
  const getConfidenceBadgeClasses = (confidence?: number): string => {
    const color = getConfidenceColor(confidence);
    const baseClasses = 'text-xs px-2 py-0.5 rounded-full font-medium';

    switch (color) {
      case 'green':
        return `${baseClasses} bg-green-100 text-green-800`;
      case 'yellow':
        return `${baseClasses} bg-yellow-100 text-yellow-800`;
      case 'red':
        return `${baseClasses} bg-red-100 text-red-800`;
      default:
        return `${baseClasses} bg-gray-100 text-gray-800`;
    }
  };

  return (
    <div
      className="space-y-2 max-h-96 overflow-y-auto pr-2"
      style={{ scrollbarWidth: 'thin' }}
    >
      {boundingBoxes.length === 0 ? (
        <div className="text-center py-8 text-gray-500 text-sm">
          No text detected for {toolName}
        </div>
      ) : (
        boundingBoxes.map((bbox, index) => {
          const isSelected = selectedIndex === index;
          const hasGeminiCorrection = bbox.metadata?.geminiUpdated;
          const originalText = bbox.metadata?.originalText;
          const validatedText = bbox.text;
          const hasTextDifference =
            hasGeminiCorrection &&
            originalText &&
            originalText !== validatedText;

          return (
            <button
              key={index}
              ref={isSelected ? selectedCardRef : null}
              onClick={() => onCardClick(index)}
              className={`w-full text-left p-3 rounded-lg border-2 transition-all ${
                isSelected
                  ? 'border-blue-500 bg-blue-50 shadow-md'
                  : 'border-gray-200 bg-white hover:bg-gray-50 hover:border-gray-300'
              }`}
            >
              {/* Card Header */}
              <div className="flex items-start justify-between mb-2">
                <span className="text-xs font-medium text-gray-500">
                  #{index + 1}
                </span>
                <div className="flex items-center gap-2">
                  {hasGeminiCorrection && (
                    <div
                      className="flex items-center gap-1 text-blue-600"
                      title="Corrected by Gemini"
                    >
                      <svg
                        className="w-4 h-4"
                        fill="currentColor"
                        viewBox="0 0 20 20"
                      >
                        <path
                          fillRule="evenodd"
                          d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z"
                          clipRule="evenodd"
                        />
                      </svg>
                    </div>
                  )}
                  {bbox.confidence !== undefined && (
                    <span
                      className={getConfidenceBadgeClasses(bbox.confidence)}
                    >
                      {Math.round(bbox.confidence * 100)}%
                    </span>
                  )}
                </div>
              </div>

              {/* Text Content */}
              <div className="space-y-2">
                {hasTextDifference ? (
                  <>
                    {/* Validated Text (shown first as requested) */}
                    <div>
                      <div className="text-xs text-blue-600 font-medium mb-1">
                        Validated:
                      </div>
                      <div className="text-sm font-medium text-gray-900 leading-relaxed">
                        {validatedText}
                      </div>
                    </div>
                    {/* Original Text (shown below) */}
                    <div>
                      <div className="text-xs text-gray-500 mb-1">
                        Original:
                      </div>
                      <div className="text-xs text-gray-600 leading-relaxed line-through">
                        {originalText}
                      </div>
                    </div>
                  </>
                ) : (
                  /* Just show the text if no correction */
                  <div className="text-sm font-medium text-gray-900 leading-relaxed">
                    {validatedText}
                  </div>
                )}
              </div>

              {/* Source indicator */}
              {bbox.metadata?.source && (
                <div className="mt-2 text-xs text-gray-400">
                  {bbox.metadata.source}
                </div>
              )}
            </button>
          );
        })
      )}
    </div>
  );
}
