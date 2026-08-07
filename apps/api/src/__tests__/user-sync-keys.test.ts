import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

describe('user sync preference keys', () => {
  it('allows account-owned identity and tournament profile entries', () => {
    const source = readFileSync(new URL('../routes/user-sync.ts', import.meta.url), 'utf8');
    expect(source).toContain("'tt_players_my_player'");
    expect(source).toContain("'tt_players_my_tt_profile'");
    expect(source).toContain("'tt_players_tournament_entry_profiles'");
  });

  it('allows tournament filters and all followed entity choices', () => {
    const source = readFileSync(new URL('../routes/user-sync.ts', import.meta.url), 'utf8');
    expect(source).toContain("'tt_players_tournament_filters'");
    expect(source).toContain("'tt_players_favourite_players'");
    expect(source).toContain("'tt_players_favourite_h2h'");
    expect(source).toContain("'tt_players_favourite_teams'");
    expect(source).toContain("'tt_players_favourite_tournaments'");
  });
});
