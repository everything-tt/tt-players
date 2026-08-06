import { useEffect } from 'react';
import { useLocation } from 'react-router-dom';
import { useTabNavigation } from '../navigation/tab-navigation';
import { buildGoogleFormPreparationPath } from '../tournament-entry-prefill';

export function eventIdFromTournamentDetailPath(pathname: string): string | null {
  const tabMatch = pathname.match(/^\/tabs\/[^/]+\/event\/([^/]+)\/?$/);
  if (tabMatch) return decodeURIComponent(tabMatch[1]);
  const publicMatch = pathname.match(/^\/tournaments\/([^/]+)\/?$/);
  return publicMatch ? decodeURIComponent(publicMatch[1]) : null;
}

export function isTournamentDetailPath(pathname: string): boolean {
  return eventIdFromTournamentDetailPath(pathname) !== null;
}

export function GoogleFormsEntryInterceptor() {
  const location = useLocation();
  const { navigateInActiveTab } = useTabNavigation();

  useEffect(() => {
    const eventId = eventIdFromTournamentDetailPath(location.pathname);
    if (!eventId) return;

    const interceptGoogleFormEntry = (event: MouseEvent) => {
      if (
        event.defaultPrevented
        || event.button !== 0
        || event.metaKey
        || event.ctrlKey
        || event.shiftKey
        || event.altKey
      ) {
        return;
      }

      const target = event.target;
      if (!(target instanceof Element)) return;
      const anchor = target.closest<HTMLAnchorElement>('a[href]');
      if (!anchor || anchor.hasAttribute('download')) return;

      const preparationPath = buildGoogleFormPreparationPath(anchor.href, eventId);
      if (!preparationPath) return;

      event.preventDefault();
      event.stopPropagation();
      navigateInActiveTab(preparationPath);
    };

    document.addEventListener('click', interceptGoogleFormEntry, true);
    return () => document.removeEventListener('click', interceptGoogleFormEntry, true);
  }, [location.pathname, navigateInActiveTab]);

  return null;
}
