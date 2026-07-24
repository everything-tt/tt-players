import type { ReactNode } from 'react';
import { useEffect, useId, useRef } from 'react';
import { createPortal } from 'react-dom';
import { cx } from '../utils/cx';

export interface BottomSheetProps {
  isOpen: boolean;
  onClose: () => void;
  title: ReactNode;
  eyebrow?: string;
  /** Height as CSS length or percentage. Default '70%'. */
  height?: string | number;
  /** Disable backdrop and Escape close (e.g. mandatory onboarding). */
  disableBackdropClose?: boolean;
  /** Disable the close button. */
  disableCloseButton?: boolean;
  /** Focus the first form control on open. Defaults to false to avoid opening the mobile keyboard unexpectedly. */
  autoFocus?: boolean;
  children: ReactNode;
  className?: string;
}

let openModalLayers = 0;
let previousBodyOverflow = '';

function lockApplicationLayer(): () => void {
  const root = document.getElementById('root');
  if (openModalLayers === 0) {
    previousBodyOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    root?.setAttribute('inert', '');
    root?.setAttribute('aria-hidden', 'true');
  }
  openModalLayers += 1;

  return () => {
    openModalLayers = Math.max(0, openModalLayers - 1);
    if (openModalLayers > 0) return;
    document.body.style.overflow = previousBodyOverflow;
    root?.removeAttribute('inert');
    root?.removeAttribute('aria-hidden');
  };
}

/**
 * Shared mobile bottom sheet with a backdrop, modal semantics, focus trapping,
 * safe-area spacing, body scroll locking and focus restoration.
 */
export function BottomSheet({
  isOpen,
  onClose,
  title,
  eyebrow,
  height = '70%',
  disableBackdropClose = false,
  disableCloseButton = false,
  autoFocus = false,
  children,
  className,
}: BottomSheetProps) {
  const sheetRef = useRef<HTMLDivElement | null>(null);
  const previouslyFocused = useRef<HTMLElement | null>(null);
  const titleId = useId();

  useEffect(() => {
    if (!isOpen) return;
    previouslyFocused.current = document.activeElement as HTMLElement | null;
    const unlockApplicationLayer = lockApplicationLayer();

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape' && !disableBackdropClose) {
        event.preventDefault();
        onClose();
        return;
      }
      if (event.key === 'Tab' && sheetRef.current) {
        const focusable = sheetRef.current.querySelectorAll<HTMLElement>(
          'a[href], button:not([disabled]), textarea:not([disabled]), input:not([disabled]), select:not([disabled]), [tabindex]:not([tabindex="-1"])',
        );
        if (focusable.length === 0) {
          event.preventDefault();
          sheetRef.current.focus();
          return;
        }
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
    const timer = window.setTimeout(() => {
      const target = autoFocus
        ? sheetRef.current?.querySelector<HTMLElement>('input:not([type="hidden"]), textarea, select, button:not([disabled])')
        : sheetRef.current;
      target?.focus();
    }, 0);

    return () => {
      document.removeEventListener('keydown', onKeyDown);
      window.clearTimeout(timer);
      unlockApplicationLayer();
      previouslyFocused.current?.focus?.();
    };
  }, [autoFocus, disableBackdropClose, isOpen, onClose]);

  if (!isOpen || typeof document === 'undefined') return null;

  return createPortal(
    <div className="tt-modal-layer">
      <div
        className="tt-backdrop"
        onClick={() => { if (!disableBackdropClose) onClose(); }}
        aria-hidden="true"
      />
      <div
        ref={sheetRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        tabIndex={-1}
        className={cx('tt-sheet', className)}
        style={{ height }}
      >
        <div className="tt-sheet__handle" aria-hidden="true" />
        <div className="tt-sheet__top">
          <div>
            {eyebrow ? <p className="tt-eyebrow">{eyebrow}</p> : null}
            <h2 id={titleId} className="tt-sheet__title">{title}</h2>
          </div>
          {!disableCloseButton ? (
            <button
              type="button"
              className="tt-sheet__close"
              onClick={onClose}
              aria-label="Close"
            >
              <i className="fa fa-times" aria-hidden="true" />
            </button>
          ) : null}
        </div>
        <div className="tt-sheet__body">{children}</div>
      </div>
    </div>,
    document.body,
  );
}
