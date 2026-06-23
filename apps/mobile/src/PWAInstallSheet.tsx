import React from 'react';
import { usePWAInstallContext } from './PWAInstallContext';

const PWAInstallSheet: React.FC = () => {
  const { showAndroidSheet, showIosSheet, install, dismiss } = usePWAInstallContext();

  if (!showAndroidSheet && !showIosSheet) return null;

  return (
    <>
      {/* Backdrop */}
      <div
        className="menu-hider menu-active"
        onClick={dismiss}
        style={{ zIndex: 998 }}
      />

      {/* Android Sheet */}
      {showAndroidSheet && (
        <div
          id="menu-install-pwa-android"
          className="menu menu-box-bottom rounded-m menu-active"
          style={{ height: '380px', zIndex: 999 }}
        >
          <div className="content">
            <img className="mx-auto mt-4 rounded-m" src="/appkit/app/icons/icon-128x128.png" alt="" width="90" />
            <h4 className="text-center mt-4 mb-2">TT Players on Home Screen</h4>
            <p className="text-center boxed-text-xl">
              Install TT Players on your home screen, and access it just like a regular app.
            </p>
            <div className="boxed-text-l">
              <button
                onClick={install}
                className="pwa-install mx-auto btn btn-m font-600 bg-highlight w-100"
              >
                Add to Home Screen
              </button>
              <button
                onClick={dismiss}
                className="pwa-dismiss btn-full mt-3 pt-2 text-center text-uppercase font-600 color-red-light font-12 bg-transparent border-0 w-100"
              >
                Maybe later
              </button>
            </div>
          </div>
        </div>
      )}

      {/* iOS Sheet */}
      {showIosSheet && (
        <div
          id="menu-install-pwa-ios"
          className="menu menu-box-bottom rounded-m menu-active"
          style={{ height: '350px', zIndex: 999 }}
        >
          <div className="content">
            <div className="boxed-text-xl top-25">
              <img className="mx-auto mt-4 rounded-m" src="/appkit/app/icons/icon-128x128.png" alt="" width="90" />
              <h4 className="text-center mt-4 mb-2">TT Players on Home Screen</h4>
              <p className="text-center ms-3 me-3">
                Install TT Players on your home screen, and access it just like a regular app.
                Open your Safari menu and tap <strong>"Add to Home Screen"</strong>.
              </p>
              <button
                onClick={dismiss}
                className="pwa-dismiss btn-full mt-3 text-center text-uppercase font-900 color-red-light opacity-90 font-11 bg-transparent border-0 w-100"
              >
                Maybe later
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
};

export default PWAInstallSheet;
