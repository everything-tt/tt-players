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
  onItemClick: (id: string, event: React.MouseEvent<HTMLButtonElement>) => void;
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
        <button
          key={item.id}
          type="button"
          className={item.id === activeItemId ? 'active-nav' : undefined}
          onClick={(e) => onItemClick(item.id, e)}
        >
          <i className={item.iconClassName} />
          <span>{item.label}</span>
        </button>
      ))}
    </nav>
  );
}
