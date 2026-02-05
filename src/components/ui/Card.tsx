import React from 'react';

interface CardProps {
  children: React.ReactNode;
  className?: string;
  padding?: 'normal' | 'tight' | 'none';
  variant?: 'default' | 'subdued';
}

const PADDING_CLASSES = {
  normal: 'p-6',
  tight: 'p-4',
  none: '',
} as const;

const VARIANT_CLASSES = {
  default: 'bg-deep-gray rounded-lg border border-neon-cyan',
  subdued: 'bg-dark-charcoal rounded-lg border border-neon-cyan border-opacity-20',
} as const;

export const Card: React.FC<CardProps> = ({
  children,
  className = '',
  padding = 'normal',
  variant = 'default',
}) => {
  const base = VARIANT_CLASSES[variant];
  const paddingClass = PADDING_CLASSES[padding];
  return (
    <div className={`${base} ${paddingClass} ${className}`.trim()}>
      {children}
    </div>
  );
};
