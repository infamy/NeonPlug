import React from 'react';

interface CardProps {
  children: React.ReactNode;
  className?: string;
  padding?: 'normal' | 'tight' | 'none';
  variant?: 'default' | 'subdued';
  /** DOM id, so a card can be a jump-navigation target. */
  id?: string;
}

const PADDING_CLASSES = {
  normal: 'p-6',
  tight: 'p-4',
  none: '',
} as const;

const VARIANT_CLASSES = {
  default: 'bg-panel rounded-lg border border-neon-cyan',
  subdued: 'bg-dark-charcoal rounded-lg border-panel',
} as const;

export const Card: React.FC<CardProps> = ({
  children,
  className = '',
  padding = 'normal',
  variant = 'default',
  id,
}) => {
  const base = VARIANT_CLASSES[variant];
  const paddingClass = PADDING_CLASSES[padding];
  return (
    <div id={id} className={`${base} ${paddingClass} ${className}`.trim()}>
      {children}
    </div>
  );
};
