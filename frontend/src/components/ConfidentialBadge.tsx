import React from 'react';

interface ConfidentialBadgeProps {
  size?: 'small' | 'medium' | 'large';
  className?: string;
}

export const ConfidentialBadge: React.FC<ConfidentialBadgeProps> = ({
  size = 'medium',
  className = '',
}) => {
  const sizeClasses = {
    small: 'text-xs px-2 py-0.5',
    medium: 'text-sm px-3 py-1',
    large: 'text-base px-4 py-1.5',
  };

  return (
    <span
      className={`inline-flex items-center gap-1 ${sizeClasses[size]} bg-red-100 text-red-800 font-semibold rounded border border-red-300 ${className}`}
      title="This document is marked as confidential. Gemini AI processors are disabled."
    >
      <svg
        className="w-4 h-4"
        fill="none"
        stroke="currentColor"
        viewBox="0 0 24 24"
        xmlns="http://www.w3.org/2000/svg"
      >
        <path
          strokeLinecap="round"
          strokeLinejoin="round"
          strokeWidth={2}
          d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z"
        />
      </svg>
      CONFIDENTIAL
    </span>
  );
};
