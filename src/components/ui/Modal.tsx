import React from 'react';
import { BUTTON } from './controlStyles';

interface ModalProps {
  isOpen: boolean;
  onClose: () => void;
  title: string;
  children: React.ReactNode;
  /**
   * Actions, kept below the scrolling body so they stay on screen however long
   * the content is — the same rule ConfirmModal and ReadProgressModal follow.
   */
  footer?: React.ReactNode;
}

export const Modal: React.FC<ModalProps> = ({
  isOpen,
  onClose,
  title,
  children,
  footer,
}) => {
  if (!isOpen) return null;

  return (
    <div
      className="fixed inset-0 z-[100] flex items-center justify-center bg-black bg-opacity-75 pb-20"
      onClick={onClose}
    >
      <div
        className="bg-deep-gray rounded-lg p-4 max-w-3xl w-full mx-4 max-h-[85vh] border border-electric-purple shadow-glow-purple flex flex-col"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex justify-between items-center mb-3 flex-shrink-0">
          <h2 className="text-xl font-bold text-electric-purple">{title}</h2>
          <button
            onClick={onClose}
            className={`${BUTTON.ghost} text-2xl`}
          >
            ×
          </button>
        </div>
        <div className="text-white flex-1 overflow-y-auto min-h-0">
          {children}
        </div>
        {footer && (
          <div className="flex-shrink-0 mt-3 pt-3 border-t border-neon-cyan border-opacity-30">{footer}</div>
        )}
      </div>
    </div>
  );
};

