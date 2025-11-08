import { useState, useRef, useEffect } from 'react';
import { getProcessorInfo } from '../utils/processorInfo';

interface ProcessorDropdownProps {
  value: string | null;
  onChange: (value: string) => void;
  options: string[];
  className?: string;
  placeholder?: string;
}

export function ProcessorDropdown({
  value,
  onChange,
  options,
  className = '',
  placeholder = 'Select a processor',
}: ProcessorDropdownProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [hoveredOption, setHoveredOption] = useState<string | null>(null);
  const [tooltipPosition, setTooltipPosition] = useState({ x: 0, y: 0 });
  const dropdownRef = useRef<HTMLDivElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);

  // Close dropdown when clicking outside
  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setIsOpen(false);
        setHoveredOption(null);
      }
    }

    if (isOpen) {
      document.addEventListener('mousedown', handleClickOutside);
      return () => document.removeEventListener('mousedown', handleClickOutside);
    }
  }, [isOpen]);

  // Handle keyboard navigation
  useEffect(() => {
    function handleKeyDown(event: KeyboardEvent) {
      if (!isOpen) return;

      if (event.key === 'Escape') {
        setIsOpen(false);
        setHoveredOption(null);
      }
    }

    if (isOpen) {
      document.addEventListener('keydown', handleKeyDown);
      return () => document.removeEventListener('keydown', handleKeyDown);
    }
  }, [isOpen]);

  const handleSelect = (option: string) => {
    onChange(option);
    setIsOpen(false);
    setHoveredOption(null);
  };

  const handleOptionHover = (option: string, event: React.MouseEvent<HTMLDivElement>) => {
    setHoveredOption(option);
    const rect = event.currentTarget.getBoundingClientRect();

    // Viewport dimensions
    const viewportWidth = window.innerWidth;
    const viewportHeight = window.innerHeight;
    const tooltipWidth = 448; // max-w-md (28rem = 448px)
    const tooltipEstimatedHeight = 300; // Estimated height

    // Calculate available space on all sides
    const spaceOnRight = viewportWidth - rect.right;
    const spaceOnLeft = rect.left;

    // Smart horizontal positioning
    let x: number;
    if (spaceOnRight >= tooltipWidth + 20) {
      // Enough space on right - show tooltip to the right
      x = rect.right + 10;
    } else if (spaceOnLeft >= tooltipWidth + 20) {
      // Not enough space on right but enough on left - show tooltip to the left
      x = rect.left - tooltipWidth - 10;
    } else {
      // Not enough space on either side - position as far right as possible
      x = Math.max(10, viewportWidth - tooltipWidth - 10);
    }

    // Smart vertical positioning - keep tooltip in viewport
    const y = Math.min(
      Math.max(10, rect.top), // At least 10px from top
      viewportHeight - tooltipEstimatedHeight - 10 // Don't overflow bottom
    );

    setTooltipPosition({ x, y });
  };

  const getDisplayValue = () => {
    if (!value) return placeholder;
    const info = getProcessorInfo(value);
    return info?.displayName || value;
  };

  return (
    <div ref={dropdownRef} className={`relative ${className}`}>
      {/* Dropdown Button */}
      <button
        type="button"
        onClick={() => setIsOpen(!isOpen)}
        className="w-full px-4 py-2 border border-gray-300 rounded-lg bg-white text-left focus:outline-none focus:ring-2 focus:ring-blue-500 flex items-center justify-between hover:border-gray-400 transition-colors"
      >
        <span className="text-gray-900">{getDisplayValue()}</span>
        <svg
          className={`w-5 h-5 text-gray-400 transition-transform ${isOpen ? 'rotate-180' : ''}`}
          fill="none"
          stroke="currentColor"
          viewBox="0 0 24 24"
        >
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
        </svg>
      </button>

      {/* Dropdown Menu */}
      {isOpen && (
        <div
          ref={menuRef}
          className="absolute z-50 w-full mt-1 bg-white border border-gray-300 rounded-lg shadow-lg max-h-96 overflow-auto"
        >
          {options.map((option) => {
            const info = getProcessorInfo(option);
            const displayName = info?.displayName || option;
            const isSelected = option === value;

            return (
              <div
                key={option}
                onClick={() => handleSelect(option)}
                onMouseEnter={(e) => handleOptionHover(option, e)}
                onMouseLeave={() => setHoveredOption(null)}
                className={`px-4 py-3 cursor-pointer transition-colors ${
                  isSelected
                    ? 'bg-blue-50 text-blue-700 font-medium'
                    : 'hover:bg-gray-100 text-gray-900'
                }`}
              >
                <div className="flex items-center justify-between">
                  <span>{displayName}</span>
                  {info?.recommended && <span className="text-yellow-500 ml-2">⭐</span>}
                  {info?.experimental && <span className="text-blue-500 ml-2">🆕</span>}
                </div>
                {info && (
                  <div className="text-xs text-gray-500 mt-1">{info.shortDescription}</div>
                )}
              </div>
            );
          })}
        </div>
      )}

      {/* Tooltip */}
      {hoveredOption && isOpen && (
        <div
          className="fixed z-[100] bg-gray-900 text-white rounded-lg shadow-xl p-4 w-[28rem] max-w-[28rem] pointer-events-none"
          style={{
            left: `${tooltipPosition.x}px`,
            top: `${tooltipPosition.y}px`,
          }}
        >
          {(() => {
            const info = getProcessorInfo(hoveredOption);
            if (!info) return <div>{hoveredOption}</div>;

            return (
              <div>
                <div className="font-semibold text-lg mb-2 flex items-center gap-2">
                  {info.displayName}
                  {info.recommended && <span className="text-yellow-400">⭐</span>}
                  {info.experimental && <span className="text-blue-400">🆕</span>}
                </div>

                <div className="text-sm text-gray-200 mb-3">{info.fullDescription}</div>

                <div className="space-y-2 text-sm">
                  <div>
                    <span className="font-semibold text-gray-300">How it works:</span>
                    <ul className="list-disc list-inside ml-2 text-gray-200 mt-1">
                      {info.howItWorks.map((step, idx) => (
                        <li key={idx} className="text-xs">
                          {step}
                        </li>
                      ))}
                    </ul>
                  </div>

                  <div>
                    <span className="font-semibold text-gray-300">Best for:</span>
                    <span className="text-gray-200 ml-1">{info.bestFor}</span>
                  </div>

                  <div className="flex gap-4">
                    <div>
                      <span className="font-semibold text-gray-300">Cost:</span>
                      <span className="text-gray-200 ml-1">{info.cost}</span>
                    </div>
                    <div>
                      <span className="font-semibold text-gray-300">Bbox:</span>
                      <span className="text-gray-200 ml-1 capitalize">{info.bboxAccuracy}</span>
                    </div>
                  </div>
                </div>
              </div>
            );
          })()}
        </div>
      )}
    </div>
  );
}
