import React from 'react';
import { cx } from '../utils/cx';

export interface AppTabBarItem {
  id: string;
  label: string;
  iconClassName: string;
  ariaLabel?: string;
}

export interface AppTabBarProps {
  items: AppTabBarItem[];
  activeItemId: string;
  onItemClick: (id: string, event: React.MouseEvent<HTMLButtonElement>) => void;
  className?: string;
  id?: string;
  ariaLabel?: string;
}

export function AppTabBar({
  items,
  activeItemId,
  onItemClick,
  className,
  id = 'footer-bar',
  ariaLabel = 'Primary navigation',
}: AppTabBarProps) {
  const tabBarStyle = {
    '--tt-tab-count': String(Math.max(items.length, 1)),
  } as React.CSSProperties;

  return (
    <nav
      id={id}
      className={cx('footer-bar-3', 'tt-tab-bar', className)}
      aria-label={ariaLabel}
      style={tabBarStyle}
    >
      {items.map((item) => {
        const selected = item.id === activeItemId;
        return (
          <button
            key={item.id}
            type="button"
            className={cx('tt-tab-bar__item', selected && 'active-nav tt-tab-bar__item--active')}
            aria-current={selected ? 'page' : undefined}
            aria-label={item.ariaLabel ?? (selected ? `${item.label}, current tab` : item.label)}
            onClick={(event) => onItemClick(item.id, event)}
          >
            <span className="tt-tab-bar__icon" aria-hidden="true">
              <i className={item.iconClassName} />
            </span>
            <span className="tt-tab-bar__label">{item.label}</span>
          </button>
        );
      })}
    </nav>
  );
}
