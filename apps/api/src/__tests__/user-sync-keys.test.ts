import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

describe('user sync preference keys', () => {
  it('allows the account-owned My TT profile entry', () => {
    const source = readFileSync(new URL('../routes/user-sync.ts', import.meta.url), 'utf8');
    expect(source).toContain("'tt_players_my_tt_profile'");
  });
});
