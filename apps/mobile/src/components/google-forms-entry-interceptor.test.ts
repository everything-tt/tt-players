import { describe, expect, it } from 'vitest';
import {
  eventIdFromTournamentDetailPath,
  hasReadyEntryAssist,
  isTournamentDetailPath,
} from './GoogleFormsEntryInterceptor';
import type { CachedEntryFormInspectionResponse } from '../tournament-entry-prefill';

function cachedInspection(status: 'ready' | 'failed'): CachedEntryFormInspectionResponse {
  return {
    data: {
      version: 1,
      provider: 'google_forms',
      status,
      source_url: 'https://docs.google.com/forms/d/e/form-id/viewform',
      inspected_at: '2026-08-06T13:23:02.000Z',
      fingerprint: status === 'ready' ? 'fingerprint' : null,
      form: status === 'ready' ? {
        provider: 'google_forms',
        form_url: 'https://docs.google.com/forms/d/e/form-id/viewform',
        title: 'Tournament entry',
        fields: [],
      } : null,
      error_code: status === 'failed' ? 'inspection_failed' : null,
      error_message: status === 'failed' ? 'Inspection failed' : null,
    },
  };
}

describe('Google Forms tournament entry interception', () => {
  it('matches tournament detail routes and extracts the event id', () => {
    expect(eventIdFromTournamentDetailPath('/tabs/events/event/123')).toBe('123');
    expect(eventIdFromTournamentDetailPath('/tabs/home/event/event%20id/')).toBe('event id');
    expect(eventIdFromTournamentDetailPath('/tournaments/456')).toBe('456');
    expect(isTournamentDetailPath('/tabs/events/event/123')).toBe(true);
  });

  it('does not intercept Google Form links away from tournament detail pages', () => {
    expect(eventIdFromTournamentDetailPath('/tabs/home')).toBeNull();
    expect(eventIdFromTournamentDetailPath('/tabs/home/entry-prefill')).toBeNull();
    expect(eventIdFromTournamentDetailPath('/tabs/players/player/123')).toBeNull();
    expect(isTournamentDetailPath('/tabs/home')).toBe(false);
  });

  it('shows entry assistance only for a ready cached form', () => {
    expect(hasReadyEntryAssist(cachedInspection('ready'))).toBe(true);
    expect(hasReadyEntryAssist(cachedInspection('failed'))).toBe(false);
    expect(hasReadyEntryAssist({ data: null })).toBe(false);
    expect(hasReadyEntryAssist(undefined)).toBe(false);
  });
});
