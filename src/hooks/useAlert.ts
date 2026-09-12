import { useState, useCallback, type ReactNode } from 'react';

export function useAlert(defaultTitle = 'Notice') {
  const [alertOpen, setAlertOpen] = useState(false);
  const [alertMessage, setAlertMessage] = useState('');
  /**
   * Structured content, shown instead of the message (ConfirmModal's `body`).
   * For alerts with real hierarchy — lists, findings, counts — which read as one
   * grey paragraph when flattened into a string.
   */
  const [alertBody, setAlertBody] = useState<ReactNode>(null);
  const [alertSize, setAlertSize] = useState<'md' | 'lg'>('md');
  const [alertTitle, setAlertTitle] = useState(defaultTitle);

  const showAlert = useCallback((message: string, title?: string) => {
    setAlertMessage(message);
    setAlertBody(null);
    setAlertSize('md');
    if (title !== undefined) setAlertTitle(title);
    setAlertOpen(true);
  }, []);

  const showAlertBody = useCallback((body: ReactNode, title?: string, size: 'md' | 'lg' = 'md') => {
    setAlertBody(body);
    setAlertMessage('');
    setAlertSize(size);
    if (title !== undefined) setAlertTitle(title);
    setAlertOpen(true);
  }, []);

  const closeAlert = useCallback(() => {
    setAlertOpen(false);
    setAlertTitle(defaultTitle);
  }, [defaultTitle]);

  return { alertOpen, alertMessage, alertBody, alertSize, alertTitle, showAlert, showAlertBody, closeAlert };
}
