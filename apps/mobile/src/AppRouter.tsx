import { BrowserRouter } from 'react-router-dom';
import './ratings-enhancements.css';
import './mobile-polish.css';
import { AppRoutes } from './AppRoutes';
import { TabNavigationProvider } from './navigation/tab-navigation';
import PWAReloadPrompt from './PWAReloadPrompt';
import PWAInstallSheet from './PWAInstallSheet';
import { PWAInstallProvider } from './PWAInstallContext';
import { UserDataSyncProvider } from './UserDataSyncProvider';
import { GoogleFormsEntryInterceptor } from './components/GoogleFormsEntryInterceptor';
import { RuntimeProvider } from './ssr/runtime-context';
import { ThemeProvider } from './ui/appkit';

export function AppRouter({
  siteOrigin,
  isSsrHydration = false,
}: {
  siteOrigin?: string;
  isSsrHydration?: boolean;
} = {}) {
  const resolvedOrigin = siteOrigin
    ?? (typeof window === 'undefined' ? '' : window.location.origin);

  return (
    <BrowserRouter>
      <RuntimeProvider siteOrigin={resolvedOrigin} isSsrHydration={isSsrHydration}>
        <UserDataSyncProvider>
          <ThemeProvider>
            <PWAInstallProvider>
              <PWAReloadPrompt />
              <PWAInstallSheet />
              <TabNavigationProvider>
                <GoogleFormsEntryInterceptor />
                <AppRoutes />
              </TabNavigationProvider>
            </PWAInstallProvider>
          </ThemeProvider>
        </UserDataSyncProvider>
      </RuntimeProvider>
    </BrowserRouter>
  );
}
