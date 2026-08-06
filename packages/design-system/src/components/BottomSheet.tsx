import { useId, useRef, type ReactNode } from 'react';
import * as DialogPrimitive from '@radix-ui/react-dialog';
import { X } from 'lucide-react';
import { cn } from '../lib/utils';

export interface BottomSheetProps {
  isOpen: boolean;
  onClose: () => void;
  title: ReactNode;
  eyebrow?: string;
  description?: ReactNode;
  footer?: ReactNode;
  /** Sheet is the default mobile bottom-sheet treatment; page fills the mobile visual viewport. */
  presentation?: 'sheet' | 'page';
  /** Height as CSS length or percentage. Default '70%'. Ignored for page presentation. */
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

/**
 * TT mobile sheet composed from shadcn's Radix Dialog foundation. Radix owns
 * focus trapping, inert background behaviour, Escape handling and scroll
 * locking; this controlled wrapper records and restores the invoking element.
 */
export function BottomSheet({
  isOpen,
  onClose,
  title,
  eyebrow,
  description,
  footer,
  presentation = 'sheet',
  height = '70%',
  disableBackdropClose = false,
  disableCloseButton = false,
  autoFocus = false,
  children,
  className,
}: BottomSheetProps) {
  const contentRef = useRef<HTMLDivElement | null>(null);
  const returnFocusRef = useRef<HTMLElement | null>(null);
  const titleId = useId();
  const descriptionId = useId();

  return (
    <DialogPrimitive.Root open={isOpen} onOpenChange={(open) => { if (!open) onClose(); }}>
      <DialogPrimitive.Portal>
        <div className="tt-modal-layer" data-slot="dialog-layer">
          <DialogPrimitive.Overlay className="tt-backdrop" data-slot="dialog-overlay" />
          <DialogPrimitive.Content
            ref={contentRef}
            aria-labelledby={titleId}
            aria-describedby={description ? descriptionId : undefined}
            className={cn(
              'tt-sheet',
              presentation === 'page' && 'tt-sheet--page',
              presentation === 'sheet' && 'tt-sheet--standard',
              className,
            )}
            style={presentation === 'sheet' ? { height } : undefined}
            onEscapeKeyDown={(event) => {
              if (disableBackdropClose) event.preventDefault();
            }}
            onPointerDownOutside={(event) => {
              if (disableBackdropClose) event.preventDefault();
            }}
            onOpenAutoFocus={(event) => {
              const activeElement = document.activeElement;
              returnFocusRef.current = activeElement instanceof HTMLElement ? activeElement : null;
              if (autoFocus) return;
              event.preventDefault();
              contentRef.current?.focus({ preventScroll: true });
            }}
            onCloseAutoFocus={(event) => {
              event.preventDefault();
              const returnFocusElement = returnFocusRef.current;
              returnFocusRef.current = null;
              if (returnFocusElement?.isConnected) {
                returnFocusElement.focus({ preventScroll: true });
              }
            }}
            data-slot="dialog-content"
          >
            {presentation === 'sheet' ? <div className="tt-sheet__handle" aria-hidden="true" /> : null}
            <div className="tt-sheet__top">
              <div className="tt-sheet__heading">
                {eyebrow ? <p className="tt-eyebrow">{eyebrow}</p> : null}
                <DialogPrimitive.Title asChild>
                  <h2 id={titleId} className="tt-sheet__title">{title}</h2>
                </DialogPrimitive.Title>
                {description ? (
                  <DialogPrimitive.Description asChild>
                    <p id={descriptionId} className="tt-sheet__description">{description}</p>
                  </DialogPrimitive.Description>
                ) : null}
              </div>
              {!disableCloseButton ? (
                <DialogPrimitive.Close asChild>
                  <button type="button" className="tt-sheet__close" aria-label="Close">
                    <X aria-hidden="true" />
                  </button>
                </DialogPrimitive.Close>
              ) : null}
            </div>
            <div className="tt-sheet__body">{children}</div>
            {footer ? <div className="tt-sheet__footer">{footer}</div> : null}
          </DialogPrimitive.Content>
        </div>
      </DialogPrimitive.Portal>
    </DialogPrimitive.Root>
  );
}
