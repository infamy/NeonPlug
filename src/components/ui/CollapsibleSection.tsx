import React, { ReactNode, useState } from 'react';

interface CollapsibleSectionProps {
  title: string;
  children: ReactNode;
  defaultOpen?: boolean;
  className?: string;
  variant?: 'cyan' | 'yellow';
}

const VARIANT_CLASSES = {
  yellow: {
    container: 'border-yellow-600/30',
    title: 'text-yellow-400',
    button: 'text-yellow-400 hover:text-yellow-300',
  },
  cyan: {
    container: 'border-neon-cyan border-opacity-30',
    title: 'text-neon-cyan',
    button: 'text-neon-cyan hover:text-neon-cyan/80',
  },
} as const;

export const CollapsibleSection: React.FC<CollapsibleSectionProps> = ({
  title,
  children,
  defaultOpen = false,
  className = '',
  variant = 'yellow',
}) => {
  const [isOpen, setIsOpen] = useState(defaultOpen);
  const styles = VARIANT_CLASSES[variant];

  return (
    <div className={`bg-deep-gray rounded-lg border p-6 ${styles.container} ${className}`}>
      <div className="flex items-center justify-between mb-4">
        <h3 className={`text-lg font-semibold ${styles.title}`}>{title}</h3>
        <button
          type="button"
          onClick={(e) => {
            e.preventDefault();
            e.stopPropagation();
            setIsOpen(!isOpen);
          }}
          className={`text-xs ${styles.button}`}
        >
          {isOpen ? '▼' : '▶'}
        </button>
      </div>
      <div className={isOpen ? '' : 'hidden'}>
        {children}
      </div>
    </div>
  );
};
