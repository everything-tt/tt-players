import { useTabNavigation, type AppTabId } from './navigation/tab-navigation';
import { TAB_METADATA } from './player-shared';

// Footer order (About remains menu-only until it moves to a dedicated settings route).
const FOOTER_TABS: AppTabId[] = ['home', 'players', 'leagues', 'events', 'h2h'];

interface TabFooterBarProps {
  reselectBehavior?: 'noop' | 'root';
}

/** Primary mobile tab bar. Labels and icons come from TAB_METADATA. */
export function TabFooterBar({ reselectBehavior = 'noop' }: TabFooterBarProps) {
  const { activeTab, switchTab } = useTabNavigation();

  return (
    <nav id="footer-bar" className="footer-bar-3" aria-label="Primary navigation">
      {FOOTER_TABS.map((tabId) => {
        const meta = TAB_METADATA[tabId];
        const selected = tabId === activeTab;
        return (
          <button
            key={tabId}
            type="button"
            className={selected ? 'active-nav' : undefined}
            aria-current={selected ? 'page' : undefined}
            aria-label={selected ? `${meta.label}, current tab` : meta.label}
            onClick={() => switchTab(tabId, reselectBehavior)}
          >
            <i className={meta.icon} aria-hidden="true" />
            <span>{meta.label}</span>
          </button>
        );
      })}
    </nav>
  );
}
