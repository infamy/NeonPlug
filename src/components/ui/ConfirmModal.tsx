import React from 'react';

export type ConfirmModalVariant = 'danger' | 'default' | 'alert';

interface ConfirmModalProps {
  isOpen: boolean;
  onClose: () => void;
  onConfirm?: () => void;
  title: string;
  message: string;
  confirmLabel?: string;
  cancelLabel?: string;
  variant?: ConfirmModalVariant;
}

export const ConfirmModal: React.FC<ConfirmModalProps> = ({
  isOpen,
  onClose,
  onConfirm,
  title,
  message,
  confirmLabel = 'Delete',
  cancelLabel = 'Cancel',
  variant = 'danger',
}) => {
  if (!isOpen) return null;

  const handleConfirm = () => {
    onConfirm?.();
    onClose();
  };

  const isAlert = variant === 'alert';
  const isDanger = variant === 'danger';

  return (
    <div
      className="fixed inset-0 z-[100] flex items-center justify-center bg-black bg-opacity-75"
      onClick={onClose}
    >
      <div
        className={`bg-deep-gray rounded-lg p-6 max-w-md w-full mx-4 border shadow-xl flex flex-col gap-4 ${
          isDanger ? 'border-red-500 border-opacity-50' : 'border-neon-cyan border-opacity-30'
        }`}
        onClick={(e) => e.stopPropagation()}
      >
        <h2 className={`text-xl font-bold ${isDanger ? 'text-red-400' : 'text-neon-cyan'}`}>
          {title}
        </h2>
        <p className="text-cool-gray text-sm whitespace-pre-wrap">{message}</p>
        <div className="flex justify-end gap-3 mt-2">
          {!isAlert && (
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 rounded border border-neon-cyan border-opacity-30 text-cool-gray hover:text-white hover:bg-neon-cyan hover:bg-opacity-10 transition-colors"
            >
              {cancelLabel}
            </button>
          )}
          <button
            type="button"
            onClick={handleConfirm}
            className={
              isDanger
                ? 'px-4 py-2 rounded font-medium bg-red-600 bg-opacity-20 border border-red-500 border-opacity-50 text-red-300 hover:bg-opacity-30 hover:border-opacity-70 transition-colors'
                : 'px-4 py-2 rounded font-medium bg-neon-cyan bg-opacity-15 border border-neon-cyan border-opacity-50 text-neon-cyan hover:bg-opacity-25 transition-colors'
            }
          >
            {isAlert ? (confirmLabel ?? 'OK') : confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
};
