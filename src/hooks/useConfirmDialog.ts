import { useCallback, useRef, useState } from 'react';
import type { ConfirmModalVariant } from '../components/ui/ConfirmModal';

export interface ConfirmRequest {
  title: string;
  message: string;
  confirmLabel?: string;
  cancelLabel?: string;
  variant?: ConfirmModalVariant;
}

/**
 * Promise-based wrapper around `ConfirmModal`, for flows that need an answer
 * mid-async — e.g. "this codeplug is a newer format, open it anyway?" inside an
 * import that then continues with the result.
 *
 * `useAlert` is the fire-and-forget equivalent; reach for this only when the
 * answer changes what happens next.
 *
 *   const { confirm, confirmProps } = useConfirmDialog();
 *   if (await confirm({ title: '…', message: '…' })) { … }
 *   // and render <ConfirmModal {...confirmProps} /> once
 */
export function useConfirmDialog() {
  const [request, setRequest] = useState<ConfirmRequest | null>(null);
  const resolveRef = useRef<((ok: boolean) => void) | null>(null);

  const confirm = useCallback((req: ConfirmRequest): Promise<boolean> => {
    return new Promise<boolean>((resolve) => {
      resolveRef.current = resolve;
      setRequest(req);
    });
  }, []);

  const settle = useCallback((accepted: boolean) => {
    const resolve = resolveRef.current;
    // ConfirmModal calls onConfirm() and then onClose(); clearing the ref first
    // means the trailing onClose can't overwrite a true with a false.
    resolveRef.current = null;
    setRequest(null);
    resolve?.(accepted);
  }, []);

  return {
    confirm,
    confirmProps: {
      isOpen: request !== null,
      title: request?.title ?? '',
      message: request?.message ?? '',
      confirmLabel: request?.confirmLabel,
      cancelLabel: request?.cancelLabel,
      variant: request?.variant,
      onConfirm: () => settle(true),
      onClose: () => settle(false),
    },
  };
}
