import { useState, useCallback } from 'react';

export function useAlert(defaultTitle = 'Notice') {
  const [alertOpen, setAlertOpen] = useState(false);
  const [alertMessage, setAlertMessage] = useState('');
  const [alertTitle, setAlertTitle] = useState(defaultTitle);

  const showAlert = useCallback((message: string, title?: string) => {
    setAlertMessage(message);
    if (title !== undefined) setAlertTitle(title);
    setAlertOpen(true);
  }, []);

  const closeAlert = useCallback(() => {
    setAlertOpen(false);
    setAlertTitle(defaultTitle);
  }, [defaultTitle]);

  return { alertOpen, alertMessage, alertTitle, showAlert, closeAlert };
}
