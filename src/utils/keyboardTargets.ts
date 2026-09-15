/**
 * Where a key press lands, for page shortcuts that must leave the keyboard alone
 * while someone is typing or a dialog is open.
 */

export const IS_MAC = typeof navigator !== 'undefined' && /Mac|iPhone|iPad/.test(navigator.platform);

/** The shortcut modifier as this platform's keyboard shows it. */
export const MOD_KEY = IS_MAC ? '⌘' : 'Ctrl';

const NOT_TEXT = new Set(['checkbox', 'radio', 'button', 'submit', 'reset', 'range', 'color', 'file']);

/** A field where the browser's own keys (undo, select all) belong to the text being typed. */
export function isTextEntry(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false;
  if (target.isContentEditable || target instanceof HTMLTextAreaElement) return true;
  return target instanceof HTMLInputElement && !NOT_TEXT.has(target.type);
}

/** A control that does something with Enter itself. */
export function isInteractive(target: EventTarget | null): boolean {
  return target instanceof Element && target.closest('button, a[href], select, input, textarea, [role="button"]') !== null;
}

/** True while a modal dialog is open. */
export function isDialogOpen(): boolean {
  return document.querySelector('[aria-modal="true"]') !== null;
}
