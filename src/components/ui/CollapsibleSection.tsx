import React, { ReactNode, useState } from 'react';

interface CollapsibleSectionProps {
  title: string;
  children: ReactNode;
  defaultOpen?: boolean;
  /**
   * Controlled mode. Pass `open` when the section must also close for a reason
   * other than a click — the contacts tab folds the RadioID.net picker away
   * once a download lands, so the loaded list gets the room. Omit it and the
   * section keeps its own state, which is what every other caller wants.
   */
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
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
  open,
  onOpenChange,
  className = '',
  variant = 'yellow',
}) => {
  const [ownOpen, setOwnOpen] = useState(defaultOpen);
  const isOpen = open ?? ownOpen;
  const setOpen = (next: boolean) => {
    if (open === undefined) setOwnOpen(next);
    onOpenChange?.(next);
  };
  const styles = VARIANT_CLASSES[variant];

  return (
    <div className={`bg-deep-gray rounded-lg border p-6 ${styles.container} ${className}`}>
      {/* The gap under the title only when something is under it — closed, it
          was a margin's worth of empty card. */}
      <div className={`flex items-center justify-between ${isOpen ? 'mb-4' : ''}`}>
        <h3 className={`text-lg font-semibold ${styles.title}`}>{title}</h3>
        <button
          type="button"
          onClick={(e) => {
            e.preventDefault();
            e.stopPropagation();
            setOpen(!isOpen);
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
