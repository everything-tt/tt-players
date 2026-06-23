import type { MouseEvent } from 'react';
import { useTabNavigation, type AppTabId } from './navigation/tab-navigation';
import { TAB_METADATA } from './player-shared';

// Footer order (About is menu-only; see DESIGN_REVIEW §2.4).
const FOOTER_TABS: AppTabId[] = ['home', 'players', 'leagues', 'events', 'h2h'];

interface TabFooterBarProps {
  reselectBehavior?: 'noop' | 'root';
}

/**
 * Footer tab bar. Labels + icons come from the single TAB_METADATA source so the
 * same tab always has the same name + icon everywhere (footer, menu, page title,
 * home cards). Replaces the duplicate footerItems array.
 */
export function TabFooterBar({ reselectBehavior = 'noop' }: TabFooterBarProps) {
  const { activeTab, switchTab } = useTabNavigation();

  const onTabClick = (tabId: AppTabId) => (event: MouseEvent<HTMLAnchorElement>) => {
    event.preventDefault();
    switchTab(tabId, reselectBehavior);
  };

  return (
    <nav id="footer-bar" className="footer-bar-3" aria-label="Primary">
      {FOOTER_TABS.map((tabId) => {
        const meta = TAB_METADATA[tabId];
        return (
          <a
            key={tabId}
            href="#"
            className={tabId === activeTab ? 'active-nav' : undefined}
            aria-current={tabId === activeTab ? 'page' : undefined}
            onClick={onTabClick(tabId)}
          >
            <i className={meta.icon} />
            <span>{meta.label}</span>
          </a>
        );
      })}
    </nav>
  );
}
