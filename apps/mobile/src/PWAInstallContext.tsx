import type { ReactNode } from 'react';
import {
  PWAInstallProvider as SharedPWAInstallProvider,
  usePWAInstallContext,
  type PWAInstallContextValue,
} from '@tt-players/pwa';
import { backupLocalData } from './local-persistence';

export { usePWAInstallContext };
export type { PWAInstallContextValue };

export function PWAInstallProvider({ children }: { children: ReactNode }) {
  return (
    <SharedPWAInstallProvider
      onBeforeUpdate={() => {
        backupLocalData();
      }}
    >
      {children}
    </SharedPWAInstallProvider>
  );
}
