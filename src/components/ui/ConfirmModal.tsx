import React, { type ReactNode } from 'react';
import { BUTTON } from './controlStyles';

export type ConfirmModalVariant = 'danger' | 'default' | 'alert';

interface ConfirmModalProps {
  isOpen: boolean;
  onClose: () => void;
  onConfirm?: () => void;
  title: string;
  /** Plain text, shown with its own line breaks. */
  message?: string;
  /**
   * Structured content, rendered INSTEAD of `message`.
   *
   * For dialogs whose content has real hierarchy. The write confirmation was a
   * pre-wrapped string, which flattened destructive warnings, byte counts and a
   * checklist into one grey paragraph — with a text divider wider than the
   * dialog and hard line breaks landing mid-sentence.
   */
  body?: ReactNode;
  /** 'lg' widens the dialog for content that needs the room. */
  size?: 'md' | 'lg';
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
  body,
  size = 'md',
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
      className="fixed inset-0 z-[100] flex items-center justify-center bg-black bg-opacity-75 p-4"
      onClick={onClose}
    >
      <div
        className={`bg-deep-gray rounded-lg w-full max-h-[90vh] border shadow-xl flex flex-col ${
          size === 'lg' ? 'max-w-2xl' : 'max-w-md'
        } ${isDanger ? 'border-red-500 border-opacity-50' : 'border-neon-cyan border-opacity-30'}`}
        onClick={(e) => e.stopPropagation()}
      >
        <h2 className={`px-6 pt-6 pb-4 text-xl font-bold ${isDanger ? 'text-red-400' : 'text-neon-cyan'}`}>
          {title}
        </h2>
        {/* Only the content scrolls. However much a dialog has to say, its
            buttons stay on screen — a long write confirmation on a short window
            used to push Continue out of reach. */}
        <div className="px-6 min-h-0 overflow-y-auto">
          {body ?? <p className="text-cool-gray text-sm whitespace-pre-wrap">{message}</p>}
        </div>
        <div className="flex justify-end gap-3 px-6 pt-6 pb-6">
          {!isAlert && (
            <button
              type="button"
              onClick={onClose}
              className={`${BUTTON.neutral} px-4 py-2 rounded border`}
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
