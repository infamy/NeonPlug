import { useEffect } from 'react';
import { redoChannelEdit, undoChannelEdit } from '../services/channelHistory';

const IS_MAC = typeof navigator !== 'undefined' && /Mac|iPhone|iPad/.test(navigator.platform);

/** The shortcuts as this platform writes them, for tooltips. */
export const UNDO_SHORTCUT = IS_MAC ? '⌘Z' : 'Ctrl+Z';
export const REDO_SHORTCUT = IS_MAC ? '⇧⌘Z' : 'Ctrl+Y';

const NOT_TEXT = new Set(['checkbox', 'radio', 'button', 'submit', 'reset', 'range', 'color', 'file']);

/** A field where the browser's own undo belongs to the text being typed. */
function isTextEntry(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false;
  if (target.isContentEditable || target instanceof HTMLTextAreaElement) return true;
  return target instanceof HTMLInputElement && !NOT_TEXT.has(target.type);
}

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
      if (isTextEntry(e.target) || document.querySelector('[aria-modal="true"]')) return;
      e.preventDefault();
      if (redo) redoChannelEdit();
      else undoChannelEdit();
    };
    document.addEventListener('keydown', onKeyDown);
    return () => document.removeEventListener('keydown', onKeyDown);
  }, [enabled]);
}
