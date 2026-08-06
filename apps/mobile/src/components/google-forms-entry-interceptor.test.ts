import { describe, expect, it } from 'vitest';
import {
  eventIdFromTournamentDetailPath,
  isTournamentDetailPath,
} from './GoogleFormsEntryInterceptor';

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
});
