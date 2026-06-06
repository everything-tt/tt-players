import React, { MouseEventHandler, ReactNode } from 'react';
import { cx } from '../utils/cx';

export type HeaderIconPosition = 1 | 2 | 3 | 4;
export type HeaderClearSize = 'small' | 'medium' | 'large';

export interface AppHeaderAction {
  iconClassName: string;
  onClick: MouseEventHandler<HTMLAnchorElement>;
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
  onTitleClick?: MouseEventHandler<HTMLAnchorElement>;
  leftAction?: AppHeaderAction;
  rightAction?: AppHeaderAction;
  actions?: AppHeaderAction[];
  children?: ReactNode;
  className?: string;
  style?: React.CSSProperties;
  ref?: React.Ref<HTMLElement>;
}

export function AppHeaderActionLink({ iconClassName, onClick, position, ariaLabel, className, badgeContent }: AppHeaderAction) {
  return (
    <a
      href="#"
      className={cx('header-icon', `header-icon-${position}`, className)}
      aria-label={ariaLabel}
      onClick={onClick}
    >
      <i className={iconClassName} />
      {badgeContent}
    </a>
  );
}

export function AppShellPage({ children, className, id = 'page' }: AppShellPageProps) {
  return <div id={id} className={cx('app-shell-page', className)}>{children}</div>;
}

export function AppHeaderSpacer({ size = 'medium' }: AppHeaderSpacerProps) {
  return <div className={`header-clear-${size}`} />;
}

export function AppPageContent({ children, className, style }: AppPageContentProps) {
  return <main className={cx('page-content app-shell-content', className)} style={style}>{children}</main>;
}

export const AppHeader = React.forwardRef<HTMLElement, AppHeaderProps>(({
  title,
  onTitleClick,
  leftAction,
  rightAction,
  actions = [],
  children,
  className,
  style,
}, ref) => {
  return (
    <header ref={ref} style={style} className={cx('header header-fixed header-logo-center', className)}>
      {children ? (
        children
      ) : (
        <>
          {onTitleClick ? (
            <a href="#" className="header-title" onClick={onTitleClick}>{title}</a>
          ) : (
            <span className="header-title">{title}</span>
          )}
          {leftAction ? <AppHeaderActionLink {...leftAction} /> : null}
          {rightAction ? <AppHeaderActionLink {...rightAction} /> : null}
          {actions.map((action, index) => (
            <AppHeaderActionLink key={index} {...action} />
          ))}
        </>
      )}
    </header>
  );
});

AppHeader.displayName = 'AppHeader';
