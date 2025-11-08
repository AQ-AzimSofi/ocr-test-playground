import React from 'react';

interface WarningIconProps {
  className?: string;
  size?: number;
}

export const WarningIcon: React.FC<WarningIconProps> = ({
  className = '',
  size = 16
}) => {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 16 16"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      className={className}
      aria-label="Warning"
    >
      <path
        d="M8 1L15 14H1L8 1Z"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinejoin="round"
      />
      <path
        d="M8 6V9"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinecap="round"
      />
      <circle
        cx="8"
        cy="11.5"
        r="0.5"
        fill="currentColor"
      />
    </svg>
  );
};
