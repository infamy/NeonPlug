import React from 'react';

interface ModalProps {
  isOpen: boolean;
  onClose: () => void;
  title: string;
  children: React.ReactNode;
}

export const Modal: React.FC<ModalProps> = ({
  isOpen,
  onClose,
  title,
  children,
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
            className="text-cool-gray hover:text-white text-2xl"
          >
            ×
          </button>
        </div>
        <div className="text-white flex-1 overflow-y-auto min-h-0">
          {children}
        </div>
      </div>
    </div>
  );
};

