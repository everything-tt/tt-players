import type { AnchorHTMLAttributes, ReactNode } from 'react';
import { cx } from '../utils/cx';

interface ExternalLinkButtonProps extends Omit<AnchorHTMLAttributes<HTMLAnchorElement>, 'children'> {
  children: ReactNode;
  /** Optional icon class to prepend (default none). */
  iconClassName?: string;
}

/**
 * A link that opens in a new tab with correct noopener/noreferrer.
 * Always includes target="_blank" rel="noopener noreferrer".
 */
export function ExternalLinkButton({
  children,
  className,
  iconClassName,
  ...props
}: ExternalLinkButtonProps) {
  return (
    <a
      target="_blank"
      rel="noopener noreferrer"
      className={cx(className)}
      {...props}
    >
      {iconClassName ? <i className={iconClassName} /> : null}
      {children}
    </a>
  );
}
