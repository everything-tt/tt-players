import { describe, expect, it } from 'vitest';
import { buildPlayerRubbersPath } from './queries';

describe('buildPlayerRubbersPath', () => {
  it('keeps the existing source-scoped endpoint when no entity filter is selected', () => {
    expect(buildPlayerRubbersPath('player-1', 20, 40, 'all')).toBe(
      '/players/player-1/rubbers?limit=20&offset=40&source=all',
    );
  });

  it('uses the exact team endpoint before pagination', () => {
    expect(buildPlayerRubbersPath('player-1', 20, 0, 'league', { teamId: 'team-1' })).toBe(
      '/players/player-1/rubbers-filtered?limit=20&offset=0&team_id=team-1',
    );
  });

  it('uses the exact tournament endpoint before pagination', () => {
    expect(buildPlayerRubbersPath('player-1', 20, 20, 'tournament', { eventId: 'event-1' })).toBe(
      '/players/player-1/rubbers-filtered?limit=20&offset=20&event_id=event-1',
    );
  });
});
