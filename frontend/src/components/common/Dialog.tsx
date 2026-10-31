import React, { useEffect, useRef } from 'react';

/** Keeps keyboard focus inside an open modal and restores it on close. */
export const Dialog: React.FC<{ label: string; className?: string; children: React.ReactNode; onClose?: () => void }> = ({ label, className, children, onClose }) => {
  const root = useRef<HTMLDivElement>(null);
  const closeRef = useRef(onClose); closeRef.current = onClose;
  useEffect(() => {
    const previous = document.activeElement as HTMLElement | null;
    const focusables = () => [...(root.current?.querySelectorAll<HTMLElement>('button:not(:disabled), input:not(:disabled), textarea:not(:disabled), select:not(:disabled), a[href], [tabindex="0"]') || [])];
    (focusables()[0] || root.current)?.focus();
    const keyboard = (event: KeyboardEvent) => {
      if (event.key === 'Escape' && closeRef.current) { event.preventDefault(); closeRef.current(); }
      if (event.key !== 'Tab') return;
      const elements = focusables();
      if (!elements.length) { event.preventDefault(); root.current?.focus(); return; }
      const first = elements[0], last = elements[elements.length - 1];
      if (event.shiftKey && (document.activeElement === first || !root.current?.contains(document.activeElement))) { event.preventDefault(); last.focus(); }
      else if (!event.shiftKey && (document.activeElement === last || !root.current?.contains(document.activeElement))) { event.preventDefault(); first.focus(); }
    };
    document.addEventListener('keydown',keyboard);
    return () => { document.removeEventListener('keydown',keyboard); previous?.focus(); };
  }, []);
  return <div ref={root} tabIndex={-1} role="dialog" aria-modal="true" aria-label={label} className={className}>{children}</div>;
};
