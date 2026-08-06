import { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { useQuery } from '@tanstack/react-query';
import { useLocation } from 'react-router-dom';
import { apiFetch } from '../player-shared';
import { useTabNavigation } from '../navigation/tab-navigation';
import {
  buildGoogleFormPreparationPath,
  isGoogleFormsUrl,
  type CachedEntryFormInspectionResponse,
} from '../tournament-entry-prefill';
import { Pill } from '../ui/appkit';

export function eventIdFromTournamentDetailPath(pathname: string): string | null {
  const tabMatch = pathname.match(/^\/tabs\/[^/]+\/event\/([^/]+)\/?$/);
  if (tabMatch) return decodeURIComponent(tabMatch[1]);
  const publicMatch = pathname.match(/^\/tournaments\/([^/]+)\/?$/);
  return publicMatch ? decodeURIComponent(publicMatch[1]) : null;
}

export function isTournamentDetailPath(pathname: string): boolean {
  return eventIdFromTournamentDetailPath(pathname) !== null;
}

export function hasReadyEntryAssist(
  response: CachedEntryFormInspectionResponse | undefined,
): boolean {
  return response?.data?.status === 'ready' && response.data.form !== null;
}

function findPrimaryEntryActionTarget(): HTMLElement | null {
  const anchors = document.querySelectorAll<HTMLAnchorElement>(
    '.tt-tournament-detail-page a[href]',
  );
  const entryAnchor = Array.from(anchors).find((anchor) => isGoogleFormsUrl(anchor.href));
  return entryAnchor?.parentElement ?? null;
}

export function GoogleFormsEntryInterceptor() {
  const location = useLocation();
  const { navigateInActiveTab } = useTabNavigation();
  const eventId = eventIdFromTournamentDetailPath(location.pathname);
  const [indicatorTarget, setIndicatorTarget] = useState<HTMLElement | null>(null);

  const entryFormQuery = useQuery({
    queryKey: ['events', eventId ?? '', 'entry-form'],
    queryFn: ({ signal }: { signal: AbortSignal }) => apiFetch<CachedEntryFormInspectionResponse>(
      `/events/${encodeURIComponent(eventId ?? '')}/entry-form`,
      signal,
    ),
    enabled: Boolean(eventId),
    staleTime: 60_000,
  });
  const entryAssistReady = hasReadyEntryAssist(entryFormQuery.data);

  useEffect(() => {
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
  }, [eventId, navigateInActiveTab]);

  useEffect(() => {
    if (!eventId || !entryAssistReady) {
      setIndicatorTarget(null);
      return;
    }

    const refreshTarget = () => {
      const nextTarget = findPrimaryEntryActionTarget();
      setIndicatorTarget((current) => current === nextTarget ? current : nextTarget);
    };

    refreshTarget();
    const observer = new MutationObserver(refreshTarget);
    observer.observe(document.body, { childList: true, subtree: true });
    return () => observer.disconnect();
  }, [entryAssistReady, eventId, location.pathname]);

  if (!entryAssistReady || !indicatorTarget) return null;

  return createPortal(
    <Pill size="xs" tone="accent">
      <i className="fa fa-magic" aria-hidden="true" />
      Entry assist ready
    </Pill>,
    indicatorTarget,
  );
}
