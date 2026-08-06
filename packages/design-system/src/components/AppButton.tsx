import type { AnchorHTMLAttributes, ButtonHTMLAttributes, ReactNode } from 'react';
import { LoaderCircle } from 'lucide-react';
import { cn } from '../lib/utils';
import { Button } from './ui/button';

// Extended tone set. `primary`/`outline`/`ghost`/`danger` are canonical;
// `highlight`/`outline-highlight` remain aliases for compatibility.
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

function appButtonClassName({
  tone,
  size,
  rounded,
  fontWeight,
  full,
  iconOnly,
  className,
}: {
  tone: AppButtonTone;
  size: AppButtonSize;
  rounded: AppButtonRounded;
  fontWeight: AppButtonFontWeight;
  full: boolean;
  iconOnly: boolean;
  className?: string;
}) {
  return cn(
    'tt-btn',
    `tt-btn--${size}`,
    `tt-btn-rounded--${rounded}`,
    `tt-btn-weight--${fontWeight}`,
    toneClassName[tone],
    full && 'tt-btn--full',
    iconOnly && 'tt-btn--icon-only',
    className,
  );
}

export interface AppButtonLinkProps extends Omit<AnchorHTMLAttributes<HTMLAnchorElement>, 'children'> {
  children: ReactNode;
  tone?: AppButtonTone;
  size?: AppButtonSize;
  rounded?: AppButtonRounded;
  fontWeight?: AppButtonFontWeight;
  full?: boolean;
  iconOnly?: boolean;
}

export function AppButtonLink({
  children,
  className,
  tone = 'primary',
  size = 'sm',
  rounded = 'full',
  fontWeight = 'semibold',
  full = false,
  iconOnly = false,
  href,
  ...props
}: AppButtonLinkProps) {
  return (
    <Button asChild variant="unstyled" size="unstyled">
      <a
        href={href}
        className={appButtonClassName({ tone, size, rounded, fontWeight, full, iconOnly, className })}
        {...props}
      >
        {children}
      </a>
    </Button>
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
  iconOnly?: boolean;
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
  iconOnly = false,
  disabled,
  type = 'button',
  ...props
}: AppButtonProps) {
  return (
    <Button
      type={type}
      variant="unstyled"
      size="unstyled"
      className={appButtonClassName({ tone, size, rounded, fontWeight, full, iconOnly, className })}
      disabled={disabled || loading}
      aria-busy={loading || undefined}
      {...props}
    >
      {loading ? <LoaderCircle className="tt-btn__spinner" aria-hidden="true" /> : null}
      {children}
    </Button>
  );
}
