import React, { MouseEventHandler, ReactNode } from 'react';
import { cx } from '../utils/cx';

export type HeaderIconPosition = 1 | 2 | 3 | 4;
export type HeaderClearSize = 'small' | 'medium' | 'large';

export interface AppHeaderAction {
  iconClassName: string;
  onClick: MouseEventHandler<HTMLButtonElement>;
  position: HeaderIconPosition;
  ariaLabel: string;
  className?: string;
  badgeContent?: ReactNode;
}

export interface AppShellPageProps {
  children: ReactNode;
  className?: string;
  id?: string;
}

export interface AppPageContentProps {
  children: ReactNode;
  className?: string;
  style?: React.CSSProperties;
}

export interface AppHeaderSpacerProps {
  size?: HeaderClearSize;
}

export interface AppHeaderProps {
  title?: ReactNode;
  /** When true, render the title as an <h1> so the route exposes a page landmark heading. */
  heading?: boolean;
  onTitleClick?: MouseEventHandler<HTMLButtonElement>;
  leftAction?: AppHeaderAction;
  rightAction?: AppHeaderAction;
  actions?: AppHeaderAction[];
  children?: ReactNode;
  className?: string;
  style?: React.CSSProperties;
  ariaLabel?: string;
  ref?: React.Ref<HTMLElement>;
}

export function AppHeaderActionLink({ iconClassName, onClick, position, ariaLabel, className, badgeContent }: AppHeaderAction) {
  return (
    <button
      type="button"
      className={cx('header-icon', `header-icon-${position}`, 'tt-app-header__action', className)}
      aria-label={ariaLabel}
      onClick={onClick}
    >
      <i className={iconClassName} aria-hidden="true" />
      {badgeContent}
    </button>
  );
}

export function AppShellPage({ children, className, id = 'page' }: AppShellPageProps) {
  return <div id={id} className={cx('app-shell-page', 'tt-app-shell', className)}>{children}</div>;
}

export function AppHeaderSpacer({ size = 'medium' }: AppHeaderSpacerProps) {
  return <div className={cx(`header-clear-${size}`, 'tt-app-header-spacer')} aria-hidden="true" />;
}

export function AppPageContent({ children, className, style }: AppPageContentProps) {
  return (
    <main className={cx('page-content', 'tt-page-content', className)} style={style}>
      {children}
    </main>
  );
}

export const AppHeader = React.forwardRef<HTMLElement, AppHeaderProps>(({
  title,
  heading = false,
  onTitleClick,
  leftAction,
  rightAction,
  actions = [],
  children,
  className,
  style,
  ariaLabel = 'Application header',
}, ref) => {
  return (
    <header
      ref={ref}
      style={style}
      className={cx('header header-fixed header-logo-center', 'tt-app-header', className)}
      aria-label={ariaLabel}
    >
      {children ? (
        children
      ) : (
        <>
          {onTitleClick ? (
            <button type="button" className="header-title tt-app-header__title" onClick={onTitleClick}>{title}</button>
          ) : heading ? (
            <h1 className="header-title tt-app-header__title">{title}</h1>
          ) : (
            <span className="header-title tt-app-header__title">{title}</span>
          )}
          {leftAction ? <AppHeaderActionLink {...leftAction} /> : null}
          {rightAction ? <AppHeaderActionLink {...rightAction} /> : null}
          {actions.map((action, index) => (
            <AppHeaderActionLink key={`${action.position}-${action.ariaLabel}-${index}`} {...action} />
          ))}
        </>
      )}
    </header>
  );
});

AppHeader.displayName = 'AppHeader';
