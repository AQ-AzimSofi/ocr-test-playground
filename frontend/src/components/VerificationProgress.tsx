import React from 'react';

interface VerificationProgressProps {
  totalBboxes: number;
  verifiedCount: number;
  correctCount: number;
  incorrectCount: number;
  missingTextCount: number;
  className?: string;
}

export const VerificationProgress: React.FC<VerificationProgressProps> = ({
  totalBboxes,
  verifiedCount,
  correctCount,
  incorrectCount,
  missingTextCount,
  className = '',
}) => {
  const unverifiedCount = totalBboxes - verifiedCount;
  const progress = totalBboxes > 0 ? (verifiedCount / totalBboxes) * 100 : 0;
  const correctRate = verifiedCount > 0 ? (correctCount / verifiedCount) * 100 : 0;

  return (
    <div className={`bg-white border border-gray-200 rounded-lg p-4 ${className}`}>
      <div className="mb-3">
        <div className="flex justify-between items-center mb-2">
          <h3 className="text-sm font-semibold text-gray-700">
            Verification Progress
          </h3>
          <span className="text-sm font-medium text-gray-600">
            {verifiedCount}/{totalBboxes} ({progress.toFixed(1)}%)
          </span>
        </div>

        {/* Progress bar */}
        <div className="w-full bg-gray-200 rounded-full h-2.5">
          <div
            className="bg-blue-600 h-2.5 rounded-full transition-all duration-300"
            style={{ width: `${progress}%` }}
          />
        </div>
      </div>

      {/* Statistics grid */}
      <div className="grid grid-cols-2 gap-3 text-sm">
        <div className="flex items-center gap-2">
          <span className="w-3 h-3 bg-green-500 rounded-full" />
          <span className="text-gray-600">Correct:</span>
          <span className="font-semibold text-green-700">{correctCount}</span>
          {verifiedCount > 0 && (
            <span className="text-xs text-gray-500">({correctRate.toFixed(1)}%)</span>
          )}
        </div>

        <div className="flex items-center gap-2">
          <span className="w-3 h-3 bg-red-500 rounded-full" />
          <span className="text-gray-600">Incorrect:</span>
          <span className="font-semibold text-red-700">{incorrectCount}</span>
        </div>

        <div className="flex items-center gap-2">
          <span className="w-3 h-3 bg-gray-400 rounded-full" />
          <span className="text-gray-600">Unverified:</span>
          <span className="font-semibold text-gray-700">{unverifiedCount}</span>
        </div>

        <div className="flex items-center gap-2">
          <span className="w-3 h-3 bg-yellow-500 rounded-full" />
          <span className="text-gray-600">Missing:</span>
          <span className="font-semibold text-yellow-700">{missingTextCount}</span>
        </div>
      </div>
    </div>
  );
};
