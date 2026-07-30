import React from 'react';
import { AppButton, BottomSheet } from './ui/appkit';
import { usePWAInstallContext } from './PWAInstallContext';

const PWAReloadPrompt: React.FC = () => {
  const { showUpdateSheet, updateApp, dismissUpdate } = usePWAInstallContext();

  const handleUpdate = () => {
    void updateApp();
  };

  return (
    <BottomSheet
      isOpen={showUpdateSheet}
      onClose={dismissUpdate}
      title="Update available"
      eyebrow="App update"
      height="auto"
      className="tt-pwa-sheet"
    >
      <div className="tt-pwa-sheet__content">
        <i className="fa fa-sync tt-pwa-sheet__sync" aria-hidden="true" />
        <p className="tt-pwa-sheet__copy">
          A newer version of TT Players is available. Your selected leagues and saved items are kept on this device during the update.
        </p>
        <div className="tt-pwa-sheet__actions">
          <AppButton onClick={handleUpdate} full>
            Update Now
          </AppButton>
          <AppButton onClick={dismissUpdate} tone="ghost" full>
            Maybe later
          </AppButton>
        </div>
      </div>
    </BottomSheet>
  );
};

export default PWAReloadPrompt;
