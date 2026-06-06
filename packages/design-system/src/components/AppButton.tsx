import type { AnchorHTMLAttributes, ButtonHTMLAttributes, ReactNode } from 'react';
import { cx } from '../utils/cx';

export type AppButtonTone = 'highlight' | 'outline-highlight';
export type AppButtonSize = 's' | 'sm' | 'm' | 'l';
export type AppButtonRounded = 'full' | 'm';
export type AppButtonFontWeight = 'regular' | 'semibold' | 'bold';

const toneClassName: Record<AppButtonTone, string> = {
  highlight: 'bg-highlight color-white border-0',
  'outline-highlight': 'color-highlight border-highlight bg-transparent',
};

const sizeClassName: Record<AppButtonSize, string> = {
  s: 'btn-s',
  sm: 'btn-sm',
  m: 'btn-m',
  l: 'btn-l',
};

const roundedClassName: Record<AppButtonRounded, string> = {
  full: 'rounded-pill',
  m: 'rounded-m',
};

const fontWeightClassName: Record<AppButtonFontWeight, string> = {
  regular: 'font-400',
  semibold: 'font-600',
  bold: 'font-700',
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
  tone = 'highlight',
  size = 's',
  rounded = 'full',
  fontWeight = 'regular',
  full = false,
  href = '#',
  ...props
}: AppButtonLinkProps) {
  return (
    <a
      href={href}
      className={cx(
        'btn',
        sizeClassName[size],
        roundedClassName[rounded],
        fontWeightClassName[fontWeight],
        toneClassName[tone],
        full && 'btn-full',
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
  tone = 'highlight',
  size = 's',
  rounded = 'full',
  fontWeight = 'regular',
  full = false,
  loading = false,
  disabled,
  ...props
}: AppButtonProps) {
  return (
    <button
      className={cx(
        'btn',
        sizeClassName[size],
        roundedClassName[rounded],
        fontWeightClassName[fontWeight],
        toneClassName[tone],
        full && 'btn-full',
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
