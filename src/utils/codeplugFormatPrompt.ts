import type { CodeplugFormatError } from '../services/codeplugExport';
import type { ConfirmRequest } from '../hooks/useConfirmDialog';

/**
 * The one place the "newer codeplug format" warning is worded.
 *
 * Three entry points can hit it (file import, snapshot restore from the toolbar,
 * snapshot restore from the startup screen) and they must say the same thing —
 * this is the decision point where a user chooses to accept losing data.
 *
 * Only ever shown for `canOverride` errors (newer *minor*). A newer major has no
 * override and goes through the caller's normal error alert instead.
 */
export function newerFormatConfirm(error: CodeplugFormatError): ConfirmRequest {
  return {
    title: 'Newer codeplug format',
    message: error.message,
    confirmLabel: 'Open anyway',
    cancelLabel: 'Cancel',
    variant: 'danger',
  };
}

/** Adapter for `readWithFormatOverride`'s `confirmOverride` argument. */
export function confirmNewerFormat(
  confirm: (req: ConfirmRequest) => Promise<boolean>
): (error: CodeplugFormatError) => Promise<boolean> {
  return (error) => confirm(newerFormatConfirm(error));
}
