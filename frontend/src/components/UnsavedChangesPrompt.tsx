import { useEffect } from 'react';

interface UnsavedChangesPromptProps {
  when: boolean;
  message?: string;
}

/**
 * Warns users before they leave the page with unsaved changes
 * Uses browser's native beforeunload event (works on refresh/close)
 */
export function UnsavedChangesPrompt({
  when,
  message = 'You have unsaved changes. Are you sure you want to leave?',
}: UnsavedChangesPromptProps) {
  // Browser navigation guard (refresh, close tab, etc.)
  useEffect(() => {
    const handleBeforeUnload = (e: BeforeUnloadEvent) => {
      if (when) {
        e.preventDefault();
        // Modern browsers ignore custom messages and show their own
        e.returnValue = '';
        return '';
      }
    };

    window.addEventListener('beforeunload', handleBeforeUnload);

    return () => {
      window.removeEventListener('beforeunload', handleBeforeUnload);
    };
  }, [when, message]);

  return null;
}
