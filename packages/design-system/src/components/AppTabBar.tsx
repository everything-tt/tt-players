import React from 'react';
import { cx } from '../utils/cx';

export interface AppTabBarItem {
  id: string;
  label: string;
  iconClassName: string;
}

export interface AppTabBarProps {
  items: AppTabBarItem[];
  activeItemId: string;
  onItemClick: (id: string, event: React.MouseEvent<HTMLAnchorElement>) => void;
  className?: string;
  id?: string;
}

export function AppTabBar({
  items,
  activeItemId,
  onItemClick,
  className,
  id = 'footer-bar',
}: AppTabBarProps) {
  return (
    <nav id={id} className={cx('footer-bar-3', className)}>
      {items.map((item) => (
        <a
          key={item.id}
          href="#"
          className={item.id === activeItemId ? 'active-nav' : undefined}
          onClick={(e) => {
            e.preventDefault();
            onItemClick(item.id, e);
          }}
        >
          <i className={item.iconClassName} />
          <span>{item.label}</span>
        </a>
      ))}
    </nav>
  );
}
