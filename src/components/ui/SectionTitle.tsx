import React from 'react';

type HeadingTag = 'h2' | 'h3' | 'h4';
type Size = 'sm' | 'md' | 'lg' | 'xl';

interface SectionTitleProps {
  children: React.ReactNode;
  as?: HeadingTag;
  size?: Size;
  underline?: boolean;
  bold?: boolean;
  className?: string;
}

const SIZE_CLASSES: Record<Size, string> = {
  sm: 'text-sm mb-2',
  md: 'text-md mb-3',
  lg: 'text-lg mb-4',
  xl: 'text-xl mb-2',
};

export const SectionTitle: React.FC<SectionTitleProps> = ({
  children,
  as: Tag = 'h3',
  size = 'lg',
  underline = false,
  bold = false,
  className = '',
}) => {
  const sizeClass = SIZE_CLASSES[size];
  const weightClass = bold ? 'font-bold' : 'font-semibold';
  const baseClass = `text-neon-cyan ${weightClass}`;
  const underlineClass = underline ? 'pb-2 border-b border-neon-cyan border-opacity-20' : '';
  return (
    <Tag className={`${baseClass} ${sizeClass} ${underlineClass} ${className}`.trim()}>
      {children}
    </Tag>
  );
};
