import React, { useEffect } from 'react';
import { dismissChannelNotice, undoChannelEdit, useChannelHistoryStore } from '../../services/channelHistory';
import { BUTTON } from '../ui/controlStyles';

/** How long the notice stays up. */
const NOTICE_MS = 10_000;

/**
 * "Deleted 3 channels. Undo", after a delete or an import. Everyday cell edits
 * don't raise it: the Undo button and the shortcut cover those.
 */
export const ChannelUndoNotice: React.FC<{
  /** Runs after its Undo changes the channels, e.g. to clear a selection by number. */
  onUndo?: () => void;
}> = ({ onUndo }) => {
  const notice = useChannelHistoryStore((s) => s.notice);

  useEffect(() => {
    if (!notice) return;
    const timer = setTimeout(() => dismissChannelNotice(notice.id), NOTICE_MS);
    return () => clearTimeout(timer);
  }, [notice]);

  if (!notice) return null;
  return (
    <div
      role="status"
      className="fixed bottom-6 left-1/2 z-50 flex max-w-[calc(100%-2rem)] transform -translate-x-1/2 items-center gap-3 rounded border border-neon-cyan border-opacity-50 bg-dark-charcoal px-4 py-2 text-sm text-white shadow-glow-cyan"
    >
      <span>{notice.text}</span>
      <button
        type="button"
        onClick={() => {
          if (undoChannelEdit() !== null) onUndo?.();
        }}
        className={`${BUTTON.link} font-medium underline`}
      >
        Undo
      </button>
      <button
        type="button"
        onClick={() => dismissChannelNotice(notice.id)}
        className={BUTTON.ghost}
        aria-label="Dismiss"
      >
        ×
      </button>
    </div>
  );
};
