import { useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { clearLocalDataBackup } from './local-persistence';
import {
  AppButton,
  AppHeader,
  AppHeaderSpacer,
  AppPageContent,
  AppShellPage,
  BottomSheet,
  PageSection,
} from './ui/appkit';

interface SavedDataLocationState {
  from?: string;
}

function safeReturnPath(value: string | undefined): string {
  return value?.startsWith('/') && !value.startsWith('//') ? value : '/tabs/home';
}

export function SavedDataPage() {
  const navigate = useNavigate();
  const location = useLocation();
  const state = location.state as SavedDataLocationState | null;
  const returnPath = safeReturnPath(state?.from);
  const [confirmOpen, setConfirmOpen] = useState(false);

  const handleResetData = async () => {
    clearLocalDataBackup();
    localStorage.clear();
    sessionStorage.clear();
    if ('caches' in window) {
      const cacheNames = await window.caches.keys();
      await Promise.all(cacheNames.map((cacheName) => window.caches.delete(cacheName)));
    }
    window.location.replace('/tabs/home');
    window.location.reload();
  };

  return (
    <AppShellPage className="tt-about-page">
      <AppHeader
        title="Saved Data"
        heading
        leftAction={{
          iconClassName: 'fas fa-chevron-left',
          onClick: () => navigate(returnPath, { replace: true }),
          position: 1,
          ariaLabel: 'Back',
        }}
        rightAction={{
          iconClassName: 'fas fa-home',
          onClick: () => navigate('/tabs/home', { replace: true }),
          position: 4,
          ariaLabel: 'Home',
        }}
      />
      <AppHeaderSpacer />
      <AppPageContent>
        <PageSection surface="raised" density="standard" title="Data on this device" note="Local storage">
          <p className="tt-about-description">
            Your favourites, selected leagues, and active settings are stored locally on this device. Normal app updates keep this data; clearing browser or app storage will remove it.
          </p>
          <AppButton tone="danger" full onClick={() => setConfirmOpen(true)}>
            <i className="fa fa-trash me-2" aria-hidden="true" />Clear Saved Data
          </AppButton>
        </PageSection>
      </AppPageContent>

      <BottomSheet isOpen={confirmOpen} onClose={() => setConfirmOpen(false)} title="Clear all data?" height="auto" className="tt-confirm-sheet">
        <p className="tt-about-description">
          This deletes all saved favourites, selected leagues, and settings on this device. This cannot be undone.
        </p>
        <div className="tt-confirm-actions">
          <AppButton tone="ghost" full onClick={() => setConfirmOpen(false)}>Cancel</AppButton>
          <AppButton tone="danger" full onClick={handleResetData}>Clear</AppButton>
        </div>
      </BottomSheet>
    </AppShellPage>
  );
}
