import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

describe('user sync preference keys', () => {
  it('allows account-owned private profile entries', () => {
    const source = readFileSync(new URL('../routes/user-sync.ts', import.meta.url), 'utf8');
    expect(source).toContain("'tt_players_my_tt_profile'");
    expect(source).toContain("'tt_players_tournament_entry_profiles'");
  });
});
