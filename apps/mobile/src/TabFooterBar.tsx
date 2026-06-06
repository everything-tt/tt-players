import type { MouseEvent } from 'react';
import { useTabNavigation, type AppTabId } from './navigation/tab-navigation';

type FooterItem = {
  id: AppTabId;
  label: string;
  iconClassName: string;
};

const footerItems: FooterItem[] = [
  { id: 'home', label: 'Home', iconClassName: 'fa fa-home' },
  { id: 'players', label: 'Players', iconClassName: 'fa fa-user-friends' },
  { id: 'leagues', label: 'Leagues', iconClassName: 'fa fa-table-tennis' },
  { id: 'events', label: 'Tournaments', iconClassName: 'fa fa-trophy' },
  { id: 'h2h', label: 'H2H', iconClassName: 'fa fa-code-compare' },
];

interface TabFooterBarProps {
  reselectBehavior?: 'noop' | 'root';
}

export function TabFooterBar({ reselectBehavior = 'noop' }: TabFooterBarProps) {
  const { activeTab, switchTab } = useTabNavigation();

  const onTabClick = (tabId: AppTabId) => (event: MouseEvent<HTMLAnchorElement>) => {
    event.preventDefault();
    switchTab(tabId, reselectBehavior);
  };

  return (
    <nav id="footer-bar" className="footer-bar-3">
      {footerItems.map((item) => (
        <a
          key={item.id}
          href="#"
          className={item.id === activeTab ? 'active-nav' : undefined}
          onClick={onTabClick(item.id)}
        >
          <i className={item.iconClassName} />
          <span>{item.label}</span>
        </a>
      ))}
    </nav>
  );
}
