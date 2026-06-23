import { useEffect, useId, useRef, type KeyboardEvent as ReactKeyboardEvent, type ReactNode } from 'react';
import { cx } from '../utils/cx';
import { AppBackdrop } from './AppBackdrop';
import { useOverlayStackItem } from './overlayStack';

interface AppDrawerProps {
  id?: string;
  isOpen: boolean;
  onClose: () => void;
  title: ReactNode;
  subtitle?: ReactNode;
  width?: number;
  children: ReactNode;
  footer?: ReactNode;
  className?: string;
}

function getFocusableElements(container: HTMLElement | null): HTMLElement[] {
  if (!container) return [];
  return Array.from(
    container.querySelectorAll<HTMLElement>(
      'button:not([disabled]), [href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])'
    )
  ).filter((element) => !element.hasAttribute('aria-hidden'));
}

export function AppDrawer({
  id,
  isOpen,
  onClose,
  title,
  subtitle,
  width = 280,
  children,
  footer,
  className,
}: AppDrawerProps) {
  const titleId = useId();
  const drawerRef = useRef<HTMLDivElement | null>(null);
  const previousActiveElementRef = useRef<HTMLElement | null>(null);
  const isTopMost = useOverlayStackItem(isOpen);

  useEffect(() => {
    if (!isOpen) return;

    previousActiveElementRef.current = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    const rafId = window.requestAnimationFrame(() => {
      const focusable = getFocusableElements(drawerRef.current);
      (focusable[0] ?? drawerRef.current)?.focus();
    });

    return () => {
      window.cancelAnimationFrame(rafId);
      previousActiveElementRef.current?.focus?.();
    };
  }, [isOpen]);

  useEffect(() => {
    if (!isOpen || !isTopMost) return;

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.preventDefault();
        onClose();
      }
    };

    const handleBackButton = (event: Event) => {
      event.preventDefault();
      onClose();
    };

    window.addEventListener('keydown', handleKeyDown);
    document.addEventListener('backbutton', handleBackButton, false);
    return () => {
      window.removeEventListener('keydown', handleKeyDown);
      document.removeEventListener('backbutton', handleBackButton, false);
    };
  }, [isOpen, isTopMost, onClose]);

  const trapFocus = (event: ReactKeyboardEvent<HTMLDivElement>) => {
    if (event.key !== 'Tab') return;

    const focusable = getFocusableElements(drawerRef.current);
    if (focusable.length === 0) {
      event.preventDefault();
      drawerRef.current?.focus();
      return;
    }

    const first = focusable[0];
    const last = focusable[focusable.length - 1];
    const activeElement = document.activeElement;

    if (event.shiftKey) {
      if (activeElement === first || activeElement === drawerRef.current) {
        event.preventDefault();
        last.focus();
      }
      return;
    }

    if (activeElement === last) {
      event.preventDefault();
      first.focus();
    }
  };

  if (!isOpen) return null;

  return (
    <>
      <AppBackdrop isActive={isOpen} onClick={onClose} className="tt-overlay-backdrop" />
      <div
        id={id}
        ref={drawerRef}
        className={cx('menu menu-box-left rounded-0 tt-main-menu menu-active', className)}
        data-menu-width={width}
        style={{ width }}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        tabIndex={-1}
        onKeyDown={trapFocus}
      >
        <div className="tt-main-menu-hero">
          <div className="tt-main-menu-hero-top">
            <button type="button" className="tt-main-menu-close" onClick={onClose} aria-label="Close menu">
              <i className="fa fa-times" />
            </button>
          </div>
          <div>
            {subtitle ? <p className="tt-picker-eyebrow">{subtitle}</p> : null}
            <h1 id={titleId} className="tt-main-menu-title">{title}</h1>
          </div>
        </div>
        <div className="mt-4" />
        {children}
        {footer}
      </div>
    </>
  );
}
