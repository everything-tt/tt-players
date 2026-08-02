import type { ButtonHTMLAttributes, ReactNode } from 'react';
import { cx } from '../utils/cx';

export interface AppToggleButtonProps extends Omit<ButtonHTMLAttributes<HTMLButtonElement>, 'children' | 'aria-pressed'> {
  children: ReactNode;
  pressed: boolean;
  iconClassName?: string;
  size?: 'sm' | 'md';
}

/** Persistent on/off filter button with visible and semantic selected state. */
export function AppToggleButton({
  children,
  pressed,
  iconClassName,
  size = 'md',
  className,
  type = 'button',
  ...props
}: AppToggleButtonProps) {
  return (
    <button
      type={type}
      className={cx(
        'tt-toggle-button',
        `tt-toggle-button--${size}`,
        pressed && 'tt-toggle-button--pressed',
        className,
      )}
      aria-pressed={pressed}
      {...props}
    >
      {iconClassName ? <i className={iconClassName} aria-hidden="true" /> : null}
      <span>{children}</span>
    </button>
  );
}
