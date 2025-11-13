import React, { useEffect } from 'react';

interface VerificationControlsProps {
  currentIndex: number;
  totalBboxes: number;
  currentVerificationStatus?: 'correct' | 'incorrect' | 'unverified';
  onVerify: (status: 'correct' | 'incorrect') => void;
  onNavigate: (direction: 'prev' | 'next') => void;
  disabled?: boolean;
}

export const VerificationControls: React.FC<VerificationControlsProps> = ({
  currentIndex,
  totalBboxes,
  currentVerificationStatus,
  onVerify,
  onNavigate,
  disabled = false,
}) => {
  useEffect(() => {
    const handleKeyPress = (event: KeyboardEvent) => {
      if (disabled) return;

      // Prevent if typing in an input field
      if (
        event.target instanceof HTMLInputElement ||
        event.target instanceof HTMLTextAreaElement
      ) {
        return;
      }

      switch (event.key.toLowerCase()) {
        case 'c':
          event.preventDefault();
          onVerify('correct');
          break;
        case 'i':
          event.preventDefault();
          onVerify('incorrect');
          break;
        case 'arrowleft':
          event.preventDefault();
          if (currentIndex > 0) onNavigate('prev');
          break;
        case 'arrowright':
          event.preventDefault();
          if (currentIndex < totalBboxes - 1) onNavigate('next');
          break;
      }
    };

    window.addEventListener('keydown', handleKeyPress);
    return () => window.removeEventListener('keydown', handleKeyPress);
  }, [currentIndex, totalBboxes, disabled, onVerify, onNavigate]);

  const getStatusColor = (status?: string) => {
    switch (status) {
      case 'correct':
        return 'bg-green-100 border-green-500';
      case 'incorrect':
        return 'bg-red-100 border-red-500';
      default:
        return 'bg-gray-50 border-gray-300';
    }
  };

  return (
    <div className={`bg-white border-2 ${getStatusColor(currentVerificationStatus)} rounded-lg p-4`}>
      <div className="flex items-center justify-between mb-3">
        <h3 className="text-sm font-semibold text-gray-700">
          Verification Controls
        </h3>
        <span className="text-xs text-gray-500">
          BBox {currentIndex + 1} of {totalBboxes}
        </span>
      </div>

      {/* Quick Action Buttons */}
      <div className="flex gap-2 mb-3">
        <button
          onClick={() => onVerify('correct')}
          disabled={disabled}
          className="flex-1 flex items-center justify-center gap-2 px-4 py-2 bg-green-500 hover:bg-green-600 disabled:bg-gray-300 text-white font-medium rounded transition-colors"
          title="Mark as correct (Keyboard: C)"
        >
          <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
          </svg>
          Correct (C)
        </button>

        <button
          onClick={() => onVerify('incorrect')}
          disabled={disabled}
          className="flex-1 flex items-center justify-center gap-2 px-4 py-2 bg-red-500 hover:bg-red-600 disabled:bg-gray-300 text-white font-medium rounded transition-colors"
          title="Mark as incorrect (Keyboard: I)"
        >
          <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
          </svg>
          Incorrect (I)
        </button>
      </div>

      {/* Navigation */}
      <div className="flex gap-2">
        <button
          onClick={() => onNavigate('prev')}
          disabled={disabled || currentIndex === 0}
          className="flex-1 flex items-center justify-center gap-2 px-4 py-2 bg-gray-100 hover:bg-gray-200 disabled:bg-gray-50 disabled:text-gray-400 text-gray-700 font-medium rounded transition-colors"
          title="Previous bbox (Keyboard: ←)"
        >
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
          </svg>
          Prev (←)
        </button>

        <button
          onClick={() => onNavigate('next')}
          disabled={disabled || currentIndex === totalBboxes - 1}
          className="flex-1 flex items-center justify-center gap-2 px-4 py-2 bg-gray-100 hover:bg-gray-200 disabled:bg-gray-50 disabled:text-gray-400 text-gray-700 font-medium rounded transition-colors"
          title="Next bbox (Keyboard: →)"
        >
          Next (→)
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
          </svg>
        </button>
      </div>

      {/* Current Status Indicator */}
      {currentVerificationStatus && (
        <div className="mt-3 pt-3 border-t border-gray-200">
          <div className="flex items-center gap-2 text-sm">
            <span className="text-gray-600">Status:</span>
            {currentVerificationStatus === 'correct' && (
              <span className="flex items-center gap-1 text-green-700 font-medium">
                <span className="w-2 h-2 bg-green-500 rounded-full" />
                Marked Correct
              </span>
            )}
            {currentVerificationStatus === 'incorrect' && (
              <span className="flex items-center gap-1 text-red-700 font-medium">
                <span className="w-2 h-2 bg-red-500 rounded-full" />
                Marked Incorrect
              </span>
            )}
          </div>
        </div>
      )}
    </div>
  );
};
