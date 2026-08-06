import { useId, useRef, type ReactNode } from 'react';
import * as DialogPrimitive from '@radix-ui/react-dialog';
import { X } from 'lucide-react';
import { cn } from '../lib/utils';

export interface AppDrawerProps {
  id?: string;
  isOpen: boolean;
  onClose: () => void;
  title: ReactNode;
  subtitle?: ReactNode;
  width?: number | string;
  children: ReactNode;
  footer?: ReactNode;
  className?: string;
  closeLabel?: string;
}

/** Radix-backed shadcn drawer with TT mobile navigation geometry. */
export function AppDrawer({
  id,
  isOpen,
  onClose,
  title,
  subtitle,
  width,
  children,
  footer,
  className,
  closeLabel = 'Close menu',
}: AppDrawerProps) {
  const titleId = useId();
  const returnFocusRef = useRef<HTMLElement | null>(null);

  return (
    <DialogPrimitive.Root open={isOpen} onOpenChange={(open) => { if (!open) onClose(); }}>
      <DialogPrimitive.Portal>
        <div className="tt-drawer-layer" data-slot="drawer-layer">
          <DialogPrimitive.Overlay className="tt-drawer-backdrop" data-slot="dialog-overlay" />
          <DialogPrimitive.Content
            asChild
            aria-labelledby={titleId}
            onOpenAutoFocus={() => {
              const activeElement = document.activeElement;
              returnFocusRef.current = activeElement instanceof HTMLElement ? activeElement : null;
            }}
            onCloseAutoFocus={(event) => {
              event.preventDefault();
              const returnFocusElement = returnFocusRef.current;
              returnFocusRef.current = null;
              if (returnFocusElement?.isConnected) {
                returnFocusElement.focus({ preventScroll: true });
              }
            }}
          >
            <aside
              id={id}
              className={cn('tt-drawer', className)}
              style={width == null ? undefined : { width }}
              data-slot="drawer-content"
            >
              <div className="tt-drawer__hero">
                <DialogPrimitive.Close asChild>
                  <button type="button" className="tt-drawer__close" aria-label={closeLabel}>
                    <X aria-hidden="true" />
                  </button>
                </DialogPrimitive.Close>
                {subtitle ? <p className="tt-picker-eyebrow">{subtitle}</p> : null}
                <DialogPrimitive.Title asChild>
                  <h2 id={titleId} className="tt-drawer__title">{title}</h2>
                </DialogPrimitive.Title>
              </div>
              {children}
              {footer}
            </aside>
          </DialogPrimitive.Content>
        </div>
      </DialogPrimitive.Portal>
    </DialogPrimitive.Root>
  );
}
