import React, { ReactNode } from 'react';
import { cx } from '../utils/cx';

export interface AppSidebarProps {
  id: string;
  isOpen: boolean;
  onClose: () => void;
  title: string;
  subtitle?: string;
  width?: number;
  children: ReactNode;
  footer?: ReactNode;
  className?: string;
  style?: React.CSSProperties;
}

export function AppSidebar({
  id,
  isOpen,
  onClose,
  title,
  subtitle,
  width = 280,
  children,
  footer,
  className,
  style,
}: AppSidebarProps) {
  return (
    <div
      id={id}
      className={cx(
        'menu menu-box-left rounded-0 tt-main-menu',
        isOpen && 'menu-active',
        className
      )}
      data-menu-width={width}
      style={{ width, ...style }}
      aria-hidden={isOpen ? undefined : true}
    >
      <div className="tt-main-menu-hero">
        <div className="tt-main-menu-hero-top">
          <button
            type="button"
            className="tt-main-menu-close"
            onClick={onClose}
            aria-label="Close menu"
          >
            <i className="fa fa-times" />
          </button>
        </div>
        <div>
          {subtitle && <p className="tt-picker-eyebrow">{subtitle}</p>}
          <h1 className="tt-main-menu-title">{title}</h1>
        </div>
      </div>
      <div className="mt-4" />
      {children}
      {footer}
    </div>
  );
}

export interface AppSidebarDividerProps {
  title: string;
  className?: string;
}

export function AppSidebarDivider({ title, className }: AppSidebarDividerProps) {
  return <h6 className={cx('menu-divider', className)}>{title}</h6>;
}

export interface AppSidebarListProps {
  children: ReactNode;
  className?: string;
}

export function AppSidebarList({ children, className }: AppSidebarListProps) {
  return (
    <div className={cx('list-group list-custom-small list-menu', className)}>
      {children}
    </div>
  );
}

export interface AppSidebarItemProps {
  iconClassName: string;
  label: string;
  onClick: (event: React.MouseEvent<HTMLElement>) => void;
  trailingElement?: ReactNode;
  className?: string;
  href?: string;
}

export function AppSidebarItem({
  iconClassName,
  label,
  onClick,
  trailingElement,
  className,
  href = '#',
}: AppSidebarItemProps) {
  const content = (
    <>
      <i className={cx(iconClassName, 'color-white')} />
      <span>{label}</span>
      {trailingElement !== undefined ? (
        trailingElement
      ) : (
        <i className="fa fa-angle-right" />
      )}
    </>
  );

  if (href && href !== '#') {
    return <a href={href} onClick={onClick} className={className}>{content}</a>;
  }

  return <button type="button" onClick={onClick} className={className}>{content}</button>;
}
