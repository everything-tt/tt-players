import React from 'react';
import { useRegisterSW } from 'virtual:pwa-register/react';
import { AppButton, BottomSheet } from './ui/appkit';
import { backupLocalData, requestPersistentStorage } from './local-persistence';

const PWAReloadPrompt: React.FC = () => {
  const {
    needRefresh: [needRefresh, setNeedRefresh],
    updateServiceWorker,
  } = useRegisterSW({
    onRegistered() {
      // Registered successfully.
    },
    onRegisterError() {
      // Ignore registration errors in the UI; the app still works without SW.
    },
  });

  const close = () => {
    setNeedRefresh(false);
  };

  const updateNow = async () => {
    backupLocalData();
    await requestPersistentStorage();
    updateServiceWorker(true);
  };

  return (
    <BottomSheet
      isOpen={needRefresh}
      onClose={close}
      title="Update available"
      eyebrow="App update"
      height="300px"
      className="tt-pwa-sheet"
    >
      <div className="tt-pwa-sheet__content">
        <i className="fa fa-sync fa-spin tt-pwa-sheet__sync" aria-hidden="true" />
        <p className="tt-pwa-sheet__copy">
          A newer version of TT Players is available. Your selected leagues and saved items are kept on this device during the update.
        </p>
        <div className="tt-pwa-sheet__actions">
          <AppButton onClick={updateNow} full>
            Update Now
          </AppButton>
          <AppButton onClick={close} tone="ghost" full>
            Maybe later
          </AppButton>
        </div>
      </div>
    </BottomSheet>
  );
};

export default PWAReloadPrompt;
