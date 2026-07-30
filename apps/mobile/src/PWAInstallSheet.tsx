import React from 'react';
import { AppButton, BottomSheet } from './ui/appkit';
import { usePWAInstallContext } from './PWAInstallContext';

const PWAInstallSheet: React.FC = () => {
  const { showAndroidSheet, showIosSheet, install, dismiss } = usePWAInstallContext();
  const isOpen = showAndroidSheet || showIosSheet;

  return (
    <BottomSheet
      isOpen={isOpen}
      onClose={dismiss}
      title="TT Players on Home Screen"
      eyebrow="Install app"
      height="auto"
      className="tt-pwa-sheet"
    >
      <div className="tt-pwa-sheet__content">
        <img className="tt-pwa-sheet__icon" src="/appkit/app/icons/icon-128x128.png" alt="" width="90" height="90" />
        <p className="tt-pwa-sheet__copy">
          {showIosSheet ? (
            <>
              Install TT Players on your home screen, and access it just like a regular app.
              Open your Safari menu and tap <strong> Add to Home Screen</strong>.
            </>
          ) : (
            'Install TT Players on your home screen, and access it just like a regular app.'
          )}
        </p>
        <div className="tt-pwa-sheet__actions">
          {showAndroidSheet ? (
            <AppButton onClick={install} full>
              Add to Home Screen
            </AppButton>
          ) : null}
          <AppButton onClick={dismiss} tone="ghost" full>
            Maybe later
          </AppButton>
        </div>
      </div>
    </BottomSheet>
  );
};

export default PWAInstallSheet;
