import { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { useQuery } from '@tanstack/react-query';
import { useLocation } from 'react-router-dom';
import { apiFetch } from '../player-shared';
import { useTabNavigation } from '../navigation/tab-navigation';
import { useEventDetailQuery } from '../queries';
import {
  buildGoogleFormPreparationPath,
  type CachedEntryFormInspectionResponse,
} from '../tournament-entry-prefill';
import { getTournamentEntryDeadlineStatus } from '../tournament-entry-deadline';
import { AppButton, BottomSheet, Pill, Stack } from '../ui/appkit';
import './google-forms-entry-interceptor.css';

type EntryEvent = {
  entry_deadline?: string | null;
  entry_url?: string | null;
  name?: string | null;
  status?: string | null;
};

type PendingEntry = {
  href: string;
  preparationPath: string | null;
};

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

function eventIdFromEntryPrefillLocation(pathname: string, search: string): string | null {
  if (!/^\/tabs\/[^/]+\/entry-prefill\/?$/.test(pathname)) return null;
  const eventId = new URLSearchParams(search).get('event');
  return eventId?.trim() ? eventId : null;
}

function deadlineAcknowledged(search: string): boolean {
  return new URLSearchParams(search).get('late') === '1';
}

function addDeadlineAcknowledgement(path: string): string {
  const [pathname, query = ''] = path.split('?');
  const params = new URLSearchParams(query);
  params.set('late', '1');
  return `${pathname}?${params.toString()}`;
}

function urlsMatch(first: string, second: string | null | undefined): boolean {
  if (!second) return false;
  try {
    const firstUrl = new URL(first, window.location.origin);
    const secondUrl = new URL(second, window.location.origin);
    firstUrl.hash = '';
    secondUrl.hash = '';
    return firstUrl.toString() === secondUrl.toString();
  } catch {
    return first === second;
  }
}

function findEventStatusTarget(): HTMLElement | null {
  const headers = document.querySelectorAll<HTMLElement>(
    '.tt-tournament-detail-page .tt-section-header',
  );
  const eventInformationHeader = Array.from(headers).find((header) => (
    header.querySelector('.tt-section-header__title')?.textContent?.trim() === 'Event information'
  ));
  return eventInformationHeader?.querySelector<HTMLElement>('.tt-section-header__description') ?? null;
}

function findPrefillStatusTarget(): HTMLElement | null {
  return document.querySelector<HTMLElement>(
    '.tt-entry-prefill-page .tt-section-header__description',
  );
}

export function GoogleFormsEntryInterceptor() {
  const location = useLocation();
  const { navigateInActiveTab } = useTabNavigation();
  const detailEventId = eventIdFromTournamentDetailPath(location.pathname);
  const prefillEventId = detailEventId
    ? null
    : eventIdFromEntryPrefillLocation(location.pathname, location.search);
  const eventId = detailEventId ?? prefillEventId;
  const onPrefillPage = Boolean(prefillEventId);
  const [indicatorTarget, setIndicatorTarget] = useState<HTMLElement | null>(null);
  const [pendingEntry, setPendingEntry] = useState<PendingEntry | null>(null);

  const entryFormQuery = useQuery({
    queryKey: ['events', eventId ?? '', 'entry-form'],
    queryFn: ({ signal }: { signal: AbortSignal }) => apiFetch<CachedEntryFormInspectionResponse>(
      `/events/${encodeURIComponent(eventId ?? '')}/entry-form`,
      signal,
    ),
    enabled: Boolean(eventId),
    staleTime: 60_000,
  });
  const eventDetailQuery = useEventDetailQuery(eventId ?? '', Boolean(eventId));
  const entryEvent = eventDetailQuery.data?.event as EntryEvent | undefined;
  const entryAssistReady = hasReadyEntryAssist(entryFormQuery.data);
  const deadlineStatus = getTournamentEntryDeadlineStatus(
    entryEvent?.entry_deadline,
    entryEvent?.status,
  );
  const deadlineWarningActive = deadlineStatus.state !== 'open';
  const lateEntryAlreadyAcknowledged = onPrefillPage && deadlineAcknowledged(location.search);

  useEffect(() => {
    setPendingEntry(null);
  }, [location.pathname, location.search]);

  useEffect(() => {
    if (!eventId) return;

    const interceptEntryLink = (event: MouseEvent) => {
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

      const googlePreparationPath = buildGoogleFormPreparationPath(anchor.href, eventId);
      const isEventEntryLink = urlsMatch(anchor.href, entryEvent?.entry_url);
      const isPrefillFormLink = onPrefillPage && Boolean(anchor.closest('.tt-entry-prefill-page'));
      const isEntryLink = Boolean(googlePreparationPath || isEventEntryLink || isPrefillFormLink);
      if (!isEntryLink) return;

      if (
        deadlineStatus.state === 'closed'
        && !lateEntryAlreadyAcknowledged
      ) {
        event.preventDefault();
        event.stopPropagation();
        setPendingEntry({
          href: anchor.href,
          preparationPath: onPrefillPage ? null : googlePreparationPath,
        });
        return;
      }

      if (!onPrefillPage && googlePreparationPath) {
        event.preventDefault();
        event.stopPropagation();
        navigateInActiveTab(googlePreparationPath);
      }
    };

    document.addEventListener('click', interceptEntryLink, true);
    return () => document.removeEventListener('click', interceptEntryLink, true);
  }, [
    deadlineStatus.state,
    entryEvent?.entry_url,
    eventId,
    lateEntryAlreadyAcknowledged,
    navigateInActiveTab,
    onPrefillPage,
  ]);

  useEffect(() => {
    const shouldShowDetailIndicator = Boolean(detailEventId) && (entryAssistReady || deadlineWarningActive);
    const shouldShowPrefillIndicator = Boolean(prefillEventId) && deadlineWarningActive;
    if (!shouldShowDetailIndicator && !shouldShowPrefillIndicator) {
      setIndicatorTarget(null);
      return;
    }

    const refreshTarget = () => {
      const nextTarget = detailEventId ? findEventStatusTarget() : findPrefillStatusTarget();
      setIndicatorTarget((current) => current === nextTarget ? current : nextTarget);
    };

    refreshTarget();
    const observer = new MutationObserver(refreshTarget);
    observer.observe(document.body, { childList: true, subtree: true });
    return () => observer.disconnect();
  }, [
    deadlineWarningActive,
    detailEventId,
    entryAssistReady,
    location.pathname,
    prefillEventId,
  ]);

  const continueLateEntry = () => {
    const pending = pendingEntry;
    if (!pending) return;
    setPendingEntry(null);

    if (pending.preparationPath) {
      navigateInActiveTab(addDeadlineAcknowledgement(pending.preparationPath));
      return;
    }

    window.open(pending.href, '_blank', 'noopener,noreferrer');
  };

  const statusIndicator = indicatorTarget ? createPortal(
    <span className="tt-entry-assist-status-indicator">
      {deadlineWarningActive && deadlineStatus.label && deadlineStatus.tone ? (
        <Pill tone={deadlineStatus.tone}>
          <i
            className={deadlineStatus.state === 'closed' ? 'fa fa-exclamation-triangle' : 'fa fa-clock'}
            aria-hidden="true"
          />
          {deadlineStatus.label}
        </Pill>
      ) : null}
      {detailEventId && entryAssistReady ? (
        <Pill tone="accent">
          <i className="fa fa-magic" aria-hidden="true" />
          Entry assist ready
        </Pill>
      ) : null}
    </span>,
    indicatorTarget,
  ) : null;

  return (
    <>
      {statusIndicator}
      <BottomSheet
        isOpen={Boolean(pendingEntry)}
        onClose={() => setPendingEntry(null)}
        title="Entry deadline has passed"
        height="auto"
      >
        <Stack gap="sm">
          <p className="tt-entry-deadline-confirm-message">
            {deadlineStatus.message ?? 'Entries are marked as closed.'}{' '}
            You can still open the form, but the organiser may reject a late submission.
          </p>
          <AppButton full tone="outline" onClick={() => setPendingEntry(null)}>
            Cancel
          </AppButton>
          <AppButton full tone="danger" onClick={continueLateEntry}>
            Continue anyway
          </AppButton>
        </Stack>
      </BottomSheet>
    </>
  );
}
