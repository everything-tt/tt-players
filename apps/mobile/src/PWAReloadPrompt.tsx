import React from 'react';
import { useRegisterSW } from 'virtual:pwa-register/react';

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

  return (
    <>
      {needRefresh && (
        <>
          <div
            className="menu-hider menu-active"
            onClick={close}
            style={{ zIndex: 998 }}
          />
          <div
            className="menu menu-box-bottom rounded-m menu-active"
            style={{ height: '300px', zIndex: 999 }}
          >
            <div className="content">
              <div className="text-center mt-4">
                <i className="fa fa-sync fa-spin font-40 color-highlight mb-3"></i>
                <h4 className="font-700">Update Available</h4>
                <p className="boxed-text-xl mt-2">
                  A newer version of TT Players is available. Update now to get the latest features and improvements!
                </p>
              </div>
              <div className="boxed-text-l mt-4">
                <button
                  onClick={() => updateServiceWorker(true)}
                  className="btn btn-m font-600 bg-highlight w-100"
                >
                  Update Now
                </button>
                <button
                  onClick={close}
                  className="btn-full mt-3 pt-2 text-center text-uppercase font-600 color-red-light font-12 bg-transparent border-0 w-100"
                >
                  Maybe later
                </button>
              </div>
            </div>
          </div>
        </>
      )}
    </>
  );
};

export default PWAReloadPrompt;
