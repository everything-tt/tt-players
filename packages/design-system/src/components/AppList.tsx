import type { MouseEventHandler, ReactNode } from 'react';
import { cx } from '../utils/cx';

export type AppListSize = 'small' | 'large';

export interface AppListGroupProps {
  children: ReactNode;
  size?: AppListSize;
  className?: string;
}

export interface AppListItemProps {
  iconClassName?: string;
  title: ReactNode;
  subtitle?: ReactNode;
  className?: string;
  onClick?: MouseEventHandler<any>;
  href?: string | null;
  borderless?: boolean;
  trailingIconClassName?: string;
  trailingElement?: ReactNode;
  children?: ReactNode;
}

export function AppListGroup({ children, size = 'large', className }: AppListGroupProps) {
  return (
    <div
      className={cx(
        'list-group',
        size === 'large' ? 'list-custom-large' : 'list-custom-small',
        'tt-app-list',
        className
      )}
    >
      {children}
    </div>
  );
}

export function AppListItem({
  iconClassName,
  title,
  subtitle,
  className,
  onClick,
  href = '#',
  borderless = false,
  trailingIconClassName = 'fa fa-angle-right',
  trailingElement,
  children,
}: AppListItemProps) {
  const content = (
    <>
      {iconClassName ? <i className={iconClassName} /> : null}
      <span>{title}</span>
      {subtitle ? <strong>{subtitle}</strong> : null}
      {children}
      {trailingElement !== undefined ? (
        trailingElement
      ) : trailingIconClassName ? (
        <i className={trailingIconClassName} />
      ) : null}
    </>
  );

  if (href === null) {
    return (
      <div onClick={onClick} className={cx('tt-app-list-row', borderless && 'border-0', className)}>
        {content}
      </div>
    );
  }

  return (
    <a href={href} onClick={onClick} className={cx(borderless && 'border-0', className)}>
      {content}
    </a>
  );
}
