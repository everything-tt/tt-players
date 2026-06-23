import type { ReactNode } from 'react';
import { useEffect, useRef } from 'react';
import { cx } from '../utils/cx';

export interface BottomSheetProps {
  isOpen: boolean;
  onClose: () => void;
  title: ReactNode;
  eyebrow?: string;
  /** Height as CSS length or percentage. Default '70%'. */
  height?: string | number;
  /** Disable backdrop close (e.g. mandatory league onboarding). */
  disableBackdropClose?: boolean;
  /** Disable the close button. */
  disableCloseButton?: boolean;
  children: ReactNode;
  className?: string;
}

/**
 * Single bottom-sheet primitive with shared backdrop, z-index scale, dialog
 * semantics, focus trap, and Escape-to-close. Replaces the 4 hand-rolled sheet
 * shells (tt-picker-shell, tt-feedback-shell, PWA sheets, AppKit .menu).
 */
export function BottomSheet({
  isOpen,
  onClose,
  title,
  eyebrow,
  height = '70%',
  disableBackdropClose = false,
  disableCloseButton = false,
  children,
  className,
}: BottomSheetProps) {
  const sheetRef = useRef<HTMLDivElement | null>(null);
  const previouslyFocused = useRef<HTMLElement | null>(null);

  useEffect(() => {
    if (!isOpen) return;
    previouslyFocused.current = document.activeElement as HTMLElement | null;

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape' && !disableBackdropClose) {
        event.preventDefault();
        onClose();
      }
      if (event.key === 'Tab' && sheetRef.current) {
        // Simple focus trap: keep Tab within the sheet.
        const focusable = sheetRef.current.querySelectorAll<HTMLElement>(
          'a[href], button:not([disabled]), textarea, input, select, [tabindex]:not([tabindex="-1"])',
        );
        if (focusable.length === 0) return;
        const first = focusable[0];
        const last = focusable[focusable.length - 1];
        if (event.shiftKey && document.activeElement === first) {
          event.preventDefault();
          last.focus();
        } else if (!event.shiftKey && document.activeElement === last) {
          event.preventDefault();
          first.focus();
        }
      }
    };

    document.addEventListener('keydown', onKeyDown);
    // Autofocus the sheet container (first focusable will be reached on Tab).
    const t = window.setTimeout(() => {
      const first = sheetRef.current?.querySelector<HTMLElement>(
        'input, textarea, button:not([disabled])',
      );
      first?.focus();
    }, 50);

    return () => {
      document.removeEventListener('keydown', onKeyDown);
      window.clearTimeout(t);
      previouslyFocused.current?.focus?.();
    };
  }, [isOpen, onClose, disableBackdropClose]);

  if (!isOpen) return null;

  return (
    <>
      <div
        className="tt-backdrop"
        onClick={() => { if (!disableBackdropClose) onClose(); }}
        aria-hidden="true"
      />
      <div
        ref={sheetRef}
        role="dialog"
        aria-modal="true"
        aria-label={typeof title === 'string' ? title : eyebrow ?? 'Dialog'}
        tabIndex={-1}
        className={cx('tt-sheet', className)}
        style={{ height }}
      >
        <div className="tt-sheet__top">
          <div>
            {eyebrow ? <p className="tt-eyebrow">{eyebrow}</p> : null}
            <h2 className="tt-sheet__title">{title}</h2>
          </div>
          {!disableCloseButton ? (
            <button
              type="button"
              className="tt-sheet__close"
              onClick={onClose}
              aria-label="Close"
            >
              <i className="fa fa-times" />
            </button>
          ) : null}
        </div>
        <div className="tt-sheet__body">{children}</div>
      </div>
    </>
  );
}
