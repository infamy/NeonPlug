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
      className="fixed inset-0 z-50 flex items-center justify-center bg-black bg-opacity-75"
      onClick={onClose}
    >
      <div
        className="bg-deep-gray rounded-lg p-6 max-w-2xl w-full mx-4 border border-electric-purple shadow-glow-purple"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex justify-between items-center mb-4">
          <h2 className="text-2xl font-bold text-electric-purple">{title}</h2>
          <button
            onClick={onClose}
            className="text-cool-gray hover:text-white text-2xl"
          >
            ×
          </button>
        </div>
        <div className="text-white">
          {children}
        </div>
      </div>
    </div>
  );
};

