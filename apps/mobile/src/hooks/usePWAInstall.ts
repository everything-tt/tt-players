import { useState, useEffect } from 'react';

interface BeforeInstallPromptEvent extends Event {
  readonly platforms: string[];
  readonly userChoice: Promise<{
    outcome: 'accepted' | 'dismissed';
    platform: string;
  }>;
  prompt(): Promise<void>;
}

export function usePWAInstall() {
  const [deferredPrompt, setDeferredPrompt] = useState<BeforeInstallPromptEvent | null>(null);
  const [showAndroidSheet, setShowAndroidSheet] = useState(false);
  const [showIosSheet, setShowIosSheet] = useState(false);

  useEffect(() => {
    const handler = (e: Event) => {
      // Prevent the mini-infobar from appearing on mobile
      e.preventDefault();
      // Stash the event so it can be triggered later.
      setDeferredPrompt(e as BeforeInstallPromptEvent);
      
      // Check if we should show the prompt (e.g. not rejected recently)
      const lastPrompt = localStorage.getItem('pwa-install-dismissed');
      const now = Date.now();
      if (!lastPrompt || (now - parseInt(lastPrompt)) > 1000 * 60 * 60 * 24 * 7) { // 7 days
        // Determine platform
        const isIOS = /iPad|iPhone|iPod/.test(navigator.userAgent) && !(window as any).MSStream;
        if (isIOS) {
          setShowIosSheet(true);
        } else {
          setShowAndroidSheet(true);
        }
      }
    };

    window.addEventListener('beforeinstallprompt', handler);

    // Initial check for iOS (since beforeinstallprompt doesn't fire on iOS)
    const isIOS = /iPad|iPhone|iPod/.test(navigator.userAgent) && !(window as any).MSStream;
    const isPWA = window.matchMedia('(display-mode: standalone)').matches || (navigator as any).standalone;
    
    if (isIOS && !isPWA) {
      const lastPrompt = localStorage.getItem('pwa-install-dismissed');
      const now = Date.now();
      if (!lastPrompt || (now - parseInt(lastPrompt)) > 1000 * 60 * 60 * 24 * 7) {
        setShowIosSheet(true);
      }
    }

    return () => window.removeEventListener('beforeinstallprompt', handler);
  }, []);

  const install = async () => {
    if (deferredPrompt) {
      deferredPrompt.prompt();
      await deferredPrompt.userChoice;
      setDeferredPrompt(null);
      setShowAndroidSheet(false);
    }
  };

  const dismiss = () => {
    localStorage.setItem('pwa-install-dismissed', Date.now().toString());
    setShowAndroidSheet(false);
    setShowIosSheet(false);
  };

  return {
    showAndroidSheet,
    showIosSheet,
    install,
    dismiss,
    canInstall: !!deferredPrompt
  };
}
