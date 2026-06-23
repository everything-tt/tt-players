import type { AnchorHTMLAttributes, ButtonHTMLAttributes, ReactNode } from 'react';
import { cx } from '../utils/cx';

// Extended tone set. `primary`/`outline`/`ghost`/`danger` are the new canonical
// names; `highlight`/`outline-highlight` kept as aliases for back-compat.
export type AppButtonTone =
  | 'highlight' | 'outline-highlight'
  | 'primary' | 'outline' | 'ghost' | 'danger';
export type AppButtonSize = 's' | 'sm' | 'm' | 'l';
export type AppButtonRounded = 'full' | 'm';
export type AppButtonFontWeight = 'regular' | 'semibold' | 'bold';

const toneClassName: Record<AppButtonTone, string> = {
  highlight: 'tt-btn--primary',
  'outline-highlight': 'tt-btn--outline',
  primary: 'tt-btn--primary',
  outline: 'tt-btn--outline',
  ghost: 'tt-btn--ghost',
  danger: 'tt-btn--danger',
};


export interface AppButtonLinkProps extends Omit<AnchorHTMLAttributes<HTMLAnchorElement>, 'children'> {
  children: ReactNode;
  tone?: AppButtonTone;
  size?: AppButtonSize;
  rounded?: AppButtonRounded;
  fontWeight?: AppButtonFontWeight;
  full?: boolean;
}

export function AppButtonLink({
  children,
  className,
  tone = 'primary',
  size = 'sm',
  rounded = 'full',
  fontWeight = 'semibold',
  full = false,
  href,
  ...props
}: AppButtonLinkProps) {
  return (
    <a
      href={href}
      className={cx(
        'tt-btn',
        `tt-btn--${size}`,
        `tt-btn-rounded--${rounded}`,
        `tt-btn-weight--${fontWeight}`,
        toneClassName[tone],
        full && 'tt-btn--full',
        className,
      )}
      {...props}
    >
      {children}
    </a>
  );
}

export interface AppButtonProps extends Omit<ButtonHTMLAttributes<HTMLButtonElement>, 'children'> {
  children: ReactNode;
  tone?: AppButtonTone;
  size?: AppButtonSize;
  rounded?: AppButtonRounded;
  fontWeight?: AppButtonFontWeight;
  full?: boolean;
  loading?: boolean;
}

export function AppButton({
  children,
  className,
  tone = 'primary',
  size = 'sm',
  rounded = 'full',
  fontWeight = 'semibold',
  full = false,
  loading = false,
  disabled,
  ...props
}: AppButtonProps) {
  return (
    <button
      className={cx(
        'tt-btn',
        `tt-btn--${size}`,
        `tt-btn-rounded--${rounded}`,
        `tt-btn-weight--${fontWeight}`,
        toneClassName[tone],
        full && 'tt-btn--full',
        className,
      )}
      disabled={disabled || loading}
      {...props}
    >
      {loading ? (
        <>
          <i className="fa fa-spinner fa-spin me-2" />
          {children}
        </>
      ) : (
        children
      )}
    </button>
  );
}
