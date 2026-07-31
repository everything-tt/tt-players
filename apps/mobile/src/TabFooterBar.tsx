import { AppTabBar } from './ui/appkit';
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
    <AppTabBar
      items={FOOTER_TABS.map((tabId) => ({
        id: tabId,
        label: TAB_METADATA[tabId].label,
        iconClassName: TAB_METADATA[tabId].icon,
      }))}
      activeItemId={activeTab}
      onItemClick={(id) => switchTab(id as AppTabId, reselectBehavior)}
    />
  );
}
