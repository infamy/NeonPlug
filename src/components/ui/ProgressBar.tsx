import React from 'react';

interface ProgressBarProps {
  progress: number; // 0-100
  message?: string;
}

export const ProgressBar: React.FC<ProgressBarProps> = ({
  progress,
  message,
}) => {
  return (
    <div className="w-full">
      {message && (
        <p className="text-cool-gray mb-2 text-sm">{message}</p>
      )}
      <div className="w-full bg-deep-gray rounded-full h-2.5 overflow-hidden">
        <div
          className="h-full bg-neon-cyan transition-all duration-300 shadow-glow-cyan"
          style={{ width: `${Math.min(100, Math.max(0, progress))}%` }}
        />
      </div>
      <p className="text-neon-cyan text-sm mt-1 text-right">
        {Math.round(progress)}%
      </p>
    </div>
  );
};

