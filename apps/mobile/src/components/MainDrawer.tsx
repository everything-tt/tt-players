import { useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';
import { TAB_METADATA } from '../player-shared';
import type { AppTabId } from '../navigation/tab-navigation';
import { AppSwitch } from '../ui/appkit';
import { useAuth } from '../lib/auth';
import { usePWAInstallContext } from '../PWAInstallContext';

const DRAWER_TABS: AppTabId[] = ['home', 'players', 'leagues', 'events', 'h2h'];
const FOCUSABLE_SELECTOR = [
  'button:not([disabled])',
  'a[href]',
  'input:not([disabled])',
  '[tabindex]:not([tabindex="-1"])',
].join(',');

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
  const { canUpdate, updateApp } = usePWAInstallContext();
  const dialogRef = useRef<HTMLElement | null>(null);
  const closeRef = useRef<HTMLButtonElement | null>(null);
  const previousFocusRef = useRef<HTMLElement | null>(null);

  useEffect(() => {
    if (!isOpen) return;

    previousFocusRef.current = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    const page = document.getElementById('page');
    const pageHadInert = page?.hasAttribute('inert') ?? false;
    const previousOverflow = document.body.style.overflow;

    page?.setAttribute('inert', '');
    document.body.style.overflow = 'hidden';
    const frame = window.requestAnimationFrame(() => closeRef.current?.focus());

    const onKeyDown = (event: globalThis.KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.preventDefault();
        onClose();
        return;
      }

      if (event.key !== 'Tab' || !dialogRef.current) return;
      const focusable = Array.from(dialogRef.current.querySelectorAll<HTMLElement>(FOCUSABLE_SELECTOR));
      if (focusable.length === 0) {
        event.preventDefault();
        return;
      }

      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    };

    document.addEventListener('keydown', onKeyDown);
    return () => {
      window.cancelAnimationFrame(frame);
      document.removeEventListener('keydown', onKeyDown);
      document.body.style.overflow = previousOverflow;
      if (!pageHadInert) page?.removeAttribute('inert');
      previousFocusRef.current?.focus();
    };
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  const selectTab = (tab: AppTabId) => {
    onClose();
    onSelectTab(tab);
  };

  const handleUpdate = () => {
    onClose();
    void updateApp();
  };

  return createPortal(
    <div className="tt-drawer-layer">
      <button type="button" className="tt-drawer-backdrop" onClick={onClose} aria-label="Close menu" />
      <aside
        ref={dialogRef}
        className="tt-drawer"
        role="dialog"
        aria-modal="true"
        aria-labelledby="tt-drawer-title"
      >
        <div className="tt-drawer__hero">
          <button ref={closeRef} type="button" className="tt-drawer__close" onClick={onClose} aria-label="Close menu">
            <i className="fa fa-times" aria-hidden="true" />
          </button>
          <p className="tt-picker-eyebrow">Menu</p>
          <h2 id="tt-drawer-title" className="tt-drawer__title">TT Players</h2>
        </div>

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
            <a className="tt-drawer__row" href="/rating-audit" onClick={onClose}>
              <i className="fa fa-chart-line" aria-hidden="true" />
              <span>Rating Audit</span>
              <i className="fa fa-angle-right" aria-hidden="true" />
            </a>
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
                onChange={(event) => onThemeChange(event.target.checked)}
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
            <button type="button" className="tt-drawer__row" onClick={() => { onClose(); onOpenAbout(); }}>
              <i className={TAB_METADATA.about.icon} aria-hidden="true" />
              <span>{TAB_METADATA.about.label}</span>
              <i className="fa fa-angle-right" aria-hidden="true" />
            </button>
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

        <div className="tt-drawer__build" aria-label={`Build ${buildTime}, commit ${commit}`}>
          <span>Built {buildTime}</span>
          <span>Commit {commit}</span>
        </div>
      </aside>
    </div>,
    document.body,
  );
}
