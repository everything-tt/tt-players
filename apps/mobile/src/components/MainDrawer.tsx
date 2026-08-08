import { useLocation } from 'react-router-dom';
import { TAB_METADATA } from '../player-shared';
import type { AppTabId } from '../navigation/tab-navigation';
import { AppDrawer, AppSwitch } from '../ui/appkit';
import { useAuth } from '../lib/auth';
import { usePWAInstallContext } from '../PWAInstallContext';

const DRAWER_TABS: AppTabId[] = ['home', 'players', 'leagues', 'events', 'h2h'];
const PLATFORM_LINKS = [
  { label: 'Data Updates', path: '/scraping-monitor', icon: 'fa fa-wave-square' },
  { label: 'Data Quality', path: '/data-coverage', icon: 'fa fa-database' },
  { label: 'Rating Audit', path: '/rating-audit', icon: 'fa fa-chart-line' },
] as const;

interface MainDrawerProps {
  isOpen: boolean;
  activeTab: AppTabId;
  isDarkMode: boolean;
  canInstall: boolean;
  showShare: boolean;
  buildTime: string;
  commit: string;
  onClose: () => void;
  onSelectTab: (tab: AppTabId) => void;
  onOpenAbout: () => void;
  onInstall: () => void;
  onShare: () => void;
  onThemeChange: (enabled: boolean) => void;
}

export function MainDrawer({
  isOpen,
  activeTab,
  isDarkMode,
  canInstall,
  showShare,
  buildTime,
  commit,
  onClose,
  onSelectTab,
  onOpenAbout,
  onInstall,
  onShare,
  onThemeChange,
}: MainDrawerProps) {
  const auth = useAuth();
  const location = useLocation();
  const { canUpdate, updateApp } = usePWAInstallContext();

  const selectTab = (tab: AppTabId) => {
    onClose();
    onSelectTab(tab);
  };

  const handleUpdate = () => {
    onClose();
    void updateApp();
  };

  const platformLinkActive = (path: string) => {
    if (path === '/rating-audit') return location.pathname.startsWith('/rating-audit');
    return location.pathname === path;
  };

  return (
    <AppDrawer
      isOpen={isOpen}
      onClose={onClose}
      title="TT Players"
      subtitle="Menu"
      footer={(
        <div className="tt-drawer__build" aria-label={`Build ${buildTime}, commit ${commit}`}>
          <span>Built {buildTime}</span>
          <span>Commit {commit}</span>
        </div>
      )}
    >
      <div className="tt-drawer__content">
        <h3 className="tt-drawer__section-title">Library</h3>
        <nav className="tt-drawer__list" aria-label="App sections">
          {DRAWER_TABS.map((tab) => {
            const meta = TAB_METADATA[tab];
            const selected = activeTab === tab;
            return (
              <button
                key={tab}
                type="button"
                className={`tt-drawer__row${selected ? ' tt-drawer__row--active' : ''}`}
                onClick={() => selectTab(tab)}
                aria-current={selected ? 'page' : undefined}
              >
                <i className={meta.icon} aria-hidden="true" />
                <span>{meta.label}</span>
                <i className="fa fa-angle-right" aria-hidden="true" />
              </button>
            );
          })}
        </nav>

        <h3 className="tt-drawer__section-title">Platform</h3>
        <nav className="tt-drawer__list" aria-label="Platform">
          {PLATFORM_LINKS.map((item) => {
            const selected = platformLinkActive(item.path);
            return (
              <a
                key={item.path}
                className={`tt-drawer__row${selected ? ' tt-drawer__row--active' : ''}`}
                href={item.path}
                aria-current={selected ? 'page' : undefined}
                onClick={onClose}
              >
                <i className={item.icon} aria-hidden="true" />
                <span>{item.label}</span>
                <i className="fa fa-angle-right" aria-hidden="true" />
              </a>
            );
          })}
        </nav>

        <h3 className="tt-drawer__section-title">Settings</h3>
        <div className="tt-drawer__list">
          <div className="tt-drawer__row tt-drawer__row--switch">
            <i className="fa fa-moon" aria-hidden="true" />
            <label htmlFor="tt-drawer-theme-switch">Dark Mode</label>
            <AppSwitch
              id="tt-drawer-theme-switch"
              containerClassName="tt-drawer-switch"
              checked={isDarkMode}
              onCheckedChange={onThemeChange}
              aria-label="Dark mode"
            />
          </div>
          {canUpdate ? (
            <button type="button" className="tt-drawer__row" onClick={handleUpdate}>
              <i className="fa fa-sync-alt" aria-hidden="true" />
              <span>Update App</span>
              <i className="fa fa-angle-right" aria-hidden="true" />
            </button>
          ) : canInstall ? (
            <button type="button" className="tt-drawer__row" onClick={() => { onClose(); onInstall(); }}>
              <i className="fa fa-download" aria-hidden="true" />
              <span>Install App</span>
              <i className="fa fa-angle-right" aria-hidden="true" />
            </button>
          ) : null}
          <a className="tt-drawer__row" href="/settings/data" onClick={onClose}>
            <i className="fa fa-hard-drive" aria-hidden="true" />
            <span>Saved Data</span>
            <i className="fa fa-angle-right" aria-hidden="true" />
          </a>
        </div>

        {auth.isConfigured ? (
          <>
            <h3 className="tt-drawer__section-title">Account</h3>
            <div className="tt-drawer__list">
              {auth.user ? (
                <>
                  <div className="tt-drawer__row" aria-label="Signed in">
                    <i className="fa fa-user-circle" aria-hidden="true" />
                    <span>{auth.user.email ?? 'Signed in'}</span>
                  </div>
                  <button
                    type="button"
                    className="tt-drawer__row"
                    onClick={() => { void auth.signOut(); }}
                  >
                    <i className="fa fa-sign-out-alt" aria-hidden="true" />
                    <span>Sign out</span>
                    <i className="fa fa-angle-right" aria-hidden="true" />
                  </button>
                </>
              ) : (
                <button
                  type="button"
                  className="tt-drawer__row"
                  onClick={() => { void auth.signInWithGoogle(); }}
                >
                  <i className="fa fa-sign-in-alt" aria-hidden="true" />
                  <span>Sign in with Google</span>
                  <i className="fa fa-angle-right" aria-hidden="true" />
                </button>
              )}
            </div>
          </>
        ) : null}

        <h3 className="tt-drawer__section-title">Links</h3>
        <div className="tt-drawer__list">
          <button type="button" className="tt-drawer__row" onClick={() => { onClose(); onOpenAbout(); }}>
            <i className={TAB_METADATA.about.icon} aria-hidden="true" />
            <span>{TAB_METADATA.about.label}</span>
            <i className="fa fa-angle-right" aria-hidden="true" />
          </button>
          <a className="tt-drawer__row" href="/feedback" onClick={onClose}>
            <i className="fa fa-comment-dots" aria-hidden="true" />
            <span>Feedback</span>
            <i className="fa fa-angle-right" aria-hidden="true" />
          </a>
          {showShare ? (
            <button type="button" className="tt-drawer__row" onClick={() => { onClose(); onShare(); }}>
              <i className="fa fa-share-alt" aria-hidden="true" />
              <span>Share TT Players</span>
              <i className="fa fa-angle-right" aria-hidden="true" />
            </button>
          ) : null}
          <a className="tt-drawer__row" href="https://www.tournapilot.com/app" target="_blank" rel="noopener noreferrer" onClick={onClose}>
            <i className="fa fa-external-link-alt" aria-hidden="true" />
            <span>TournaPilot</span>
            <i className="fa fa-angle-right" aria-hidden="true" />
          </a>
        </div>
      </div>
    </AppDrawer>
  );
}
