import { useEffect } from 'react';
import { redoChannelEdit, undoChannelEdit } from '../services/channelHistory';
import { IS_MAC, isDialogOpen, isTextEntry } from '../utils/keyboardTargets';

/** The shortcuts as this platform writes them, for tooltips. */
export const UNDO_SHORTCUT = IS_MAC ? '⌘Z' : 'Ctrl+Z';
export const REDO_SHORTCUT = IS_MAC ? '⇧⌘Z' : 'Ctrl+Y';

/**
 * Undo and redo from the keyboard on the Channels tab. Typing in a field keeps
 * the browser's own undo, and an open dialog turns them off: a delete waiting
 * for confirmation names channels by number, and an undo underneath it would
 * renumber them.
 */
export function useChannelUndoShortcuts(enabled: boolean): void {
  useEffect(() => {
    if (!enabled) return;
    const onKeyDown = (e: KeyboardEvent) => {
      if (!(e.metaKey || e.ctrlKey) || e.altKey) return;
      const key = e.key.toLowerCase();
      const redo = (key === 'z' && e.shiftKey) || (key === 'y' && e.ctrlKey && !e.shiftKey);
      if (key !== 'z' && !redo) return;
      if (isTextEntry(e.target) || isDialogOpen()) return;
      e.preventDefault();
      if (redo) redoChannelEdit();
      else undoChannelEdit();
    };
    document.addEventListener('keydown', onKeyDown);
    return () => document.removeEventListener('keydown', onKeyDown);
  }, [enabled]);
}
