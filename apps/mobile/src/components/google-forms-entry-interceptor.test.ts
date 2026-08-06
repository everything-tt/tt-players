import { describe, expect, it } from 'vitest';
import { isTournamentDetailPath } from './GoogleFormsEntryInterceptor';

describe('Google Forms tournament entry interception', () => {
  it('matches tournament detail routes in tab and public URL forms', () => {
    expect(isTournamentDetailPath('/tabs/events/event/123')).toBe(true);
    expect(isTournamentDetailPath('/tabs/home/event/123/')).toBe(true);
    expect(isTournamentDetailPath('/tournaments/123')).toBe(true);
  });

  it('does not intercept Google Form links away from tournament detail pages', () => {
    expect(isTournamentDetailPath('/tabs/home')).toBe(false);
    expect(isTournamentDetailPath('/tabs/home/entry-prefill')).toBe(false);
    expect(isTournamentDetailPath('/tabs/players/player/123')).toBe(false);
  });
});
