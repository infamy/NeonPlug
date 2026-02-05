import React from 'react';

interface EmptyStateProps {
  message: string;
  secondary?: string;
  className?: string;
}

export const EmptyState: React.FC<EmptyStateProps> = ({
  message,
  secondary,
  className = '',
}) => {
  return (
    <div className={`p-8 text-center ${className}`.trim()}>
      <p className="text-muted">{message}</p>
      {secondary && (
        <p className="text-muted text-sm mt-2">{secondary}</p>
      )}
    </div>
  );
};
